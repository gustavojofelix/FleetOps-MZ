import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { UserRepository } from '../../../core/data-access/repositories';
import { AssignmentIssue, COMPATIBLE_TRAILERS, checkTripAssignment } from '../../../core/domain/trip-rules';
import { ACTIVE_CURRENCIES } from '../../../core/formatting/currency';
import { fromDateTimeLocalValue, hoursBetween } from '../../../core/formatting/date-utils';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { CARGO_TYPES, CargoType, CurrencyCode, Trip } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { TripWorkflowService } from '../../../core/services/trip-workflow.service';
import { CompanySettingsService } from '../../../core/state/company-settings.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { Icon } from '../../../shared/ui/icon/icon';
import { Breadcrumb, PageHeader } from '../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { containerNumber, dateOrder, positiveNumber, revealErrors } from '../../../shared/utils/form-utils';
import { isTripEditable } from '../trip-filters';
import {
  TRIP_COUNTRIES,
  TripFormValue,
  duplicateFormValue,
  emptyTripForm,
  isCrossBorder,
  nextTripReference,
  routePrefill,
  suggestArrival,
  toTripInput,
  tripToFormValue,
} from '../trip-form.model';
import { describeIssue, sortIssues } from '../trip-issues';

type SectionId = 'route' | 'cargo' | 'assignment' | 'schedule' | 'commercial';

interface Option {
  id: string;
  label: string;
  /** Translated suffix shown after the label, e.g. "(em manutenção)". */
  note: string | null;
}

interface IssueView {
  code: AssignmentIssue['code'];
  message: string;
}

/** Container cargo needs a container number; other cargo types hide the field. */
const requiredForContainer = (control: AbstractControl): ValidationErrors | null =>
  control.parent?.get('cargoType')?.value === 'container' && !String(control.value ?? '').trim() ? { required: true } : null;

/** Full-page trip create / edit (`/trips/new`, `/trips/:id/edit`). */
@Component({
  selector: 'app-trip-form-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, ...FORMAT_PIPES, PageHeader, FieldError, Icon, EmptyState, StatusBadge],
  templateUrl: './trip-form-page.html',
  styleUrl: './trip-form-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripFormPage {
  /** Route param (edit) and query params (prefill), bound by the router. */
  readonly id = input<string | undefined>();
  readonly vehicleId = input<string | undefined>();
  readonly driverId = input<string | undefined>();
  readonly customerId = input<string | undefined>();
  readonly duplicate = input<string | undefined>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly workflow = inject(TripWorkflowService);
  private readonly users = inject(UserRepository);
  private readonly settings = inject(CompanySettingsService);
  private readonly clock = inject(ClockService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly directory = inject(EntityDirectory);

  protected readonly countries = TRIP_COUNTRIES;
  protected readonly cargoTypes = CARGO_TYPES;
  protected readonly currencies = ACTIVE_CURRENCIES;
  protected readonly saving = signal(false);
  protected readonly initialised = signal(false);

  private saved = false;
  private populating = false;
  private lastSuggestedArrival = '';

  protected readonly form = this.fb.group(
    {
      routeId: [''],
      originCity: ['', [Validators.required, Validators.maxLength(60)]],
      originSite: ['', Validators.maxLength(120)],
      originCountry: ['MZ', Validators.required],
      destinationCity: ['', [Validators.required, Validators.maxLength(60)]],
      destinationSite: ['', Validators.maxLength(120)],
      destinationCountry: ['MZ', Validators.required],
      plannedDistanceKm: this.fb.control<number | null>(null, [Validators.required, positiveNumber, Validators.max(5000)]),
      customerId: ['', Validators.required],
      customerReference: ['', Validators.maxLength(40)],
      cargoType: this.fb.control<CargoType>('container', Validators.required),
      cargoDescription: ['', [Validators.required, Validators.maxLength(120)]],
      weightTonnes: this.fb.control<number | null>(null, [Validators.required, positiveNumber, Validators.max(80)]),
      containerRef: ['', [requiredForContainer, containerNumber]],
      sealNumber: ['', Validators.maxLength(30)],
      vehicleId: ['', Validators.required],
      driverId: ['', Validators.required],
      trailerId: [''],
      plannedDeparture: ['', Validators.required],
      plannedArrival: ['', Validators.required],
      revenueAmount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
      revenueCurrency: this.fb.control<CurrencyCode>('USD', Validators.required),
      notes: ['', Validators.maxLength(500)],
    },
    { validators: dateOrder('plannedDeparture', 'plannedArrival') },
  );

  /** Form value as a signal (raw value, so it also drives computed summaries and checks). */
  protected readonly value = toSignal(this.form.valueChanges.pipe(map((): TripFormValue => this.form.getRawValue())), {
    initialValue: this.form.getRawValue() as TripFormValue,
  });

  protected readonly isEdit = computed(() => !!this.id());
  protected readonly editing = computed(() => this.directory.trip(this.id()));
  protected readonly duplicateSource = computed(() => (this.isEdit() ? undefined : this.directory.trip(this.duplicate())));
  protected readonly notFound = computed(() => this.isEdit() && !this.directory.loading() && !this.editing());
  protected readonly readOnly = computed(() => {
    const trip = this.editing();
    return !!trip && !isTripEditable(trip.status);
  });

  protected readonly selectedRoute = computed(() => this.directory.routeById().get(this.value().routeId));
  protected readonly vehicle = computed(() => this.directory.vehicle(this.value().vehicleId));
  protected readonly driver = computed(() => this.directory.driver(this.value().driverId));
  protected readonly customer = computed(() => this.directory.customer(this.value().customerId));
  protected readonly isTractor = computed(() => !this.vehicle() || this.vehicle()?.type === 'truck_tractor');
  protected readonly trailer = computed(() => (this.isTractor() ? this.directory.trailer(this.value().trailerId) : undefined));
  protected readonly crossBorder = computed(() => isCrossBorder(this.value(), this.selectedRoute()));
  protected readonly isContainer = computed(() => this.value().cargoType === 'container');

  protected readonly reference = computed(
    () => this.editing()?.reference ?? nextTripReference(this.directory.trips().map((trip) => trip.reference), this.clock.today().slice(0, 4)),
  );

  protected readonly title = computed(() => {
    const trip = this.editing();
    return trip ? this.i18n.t('trips.form.editTitle', { reference: trip.reference }) : this.i18n.t('trips.form.newTitle');
  });

  protected readonly subtitle = computed(() => {
    if (this.isEdit()) return this.i18n.t('trips.form.editSubtitle');
    const source = this.duplicateSource();
    return source ? this.i18n.t('trips.form.duplicateSubtitle', { reference: source.reference }) : this.i18n.t('trips.form.newSubtitle');
  });

  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => {
    const trip = this.editing();
    const crumbs: Breadcrumb[] = [{ label: 'trips.detail.backToList', link: '/trips', translate: true }];
    if (trip) crumbs.push({ label: trip.reference, link: ['/trips', trip.id] }, { label: 'common.actions.edit', translate: true });
    else crumbs.push({ label: 'trips.new', translate: true });
    return crumbs;
  });

  // ── Options ────────────────────────────────────────────────────────────────

  protected readonly routeOptions = computed(() =>
    this.directory
      .routes()
      .map((route) => ({
        id: route.id,
        label: this.i18n.t('trips.hints.routeOption', {
          label: this.directory.routeLabel(route),
          distance: this.format.distance(route.distanceKm),
          hours: this.format.number(route.typicalDurationHours, 1),
        }),
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  protected readonly customerOptions = computed<Option[]>(() => {
    const current = this.value().customerId;
    return this.directory
      .customers()
      .filter((c) => c.status === 'active' || c.id === current)
      .map((c) => ({ id: c.id, label: c.name, note: c.status === 'active' ? null : this.i18n.t('customers.status.' + c.status) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  protected readonly vehicleOptions = computed<Option[]>(() => {
    const current = this.value().vehicleId;
    return this.directory
      .vehicles()
      .filter((v) => v.status !== 'inactive' || v.id === current)
      .map((v) => ({
        id: v.id,
        label: `${v.plateNumber} · ${v.fleetNumber} · ${this.i18n.t('vehicles.types.' + v.type)}`,
        note: v.status === 'available' ? null : this.i18n.t('vehicles.status.' + v.status),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  protected readonly driverOptions = computed<Option[]>(() => {
    const current = this.value().driverId;
    return this.directory
      .drivers()
      .filter((d) => d.status !== 'inactive' || d.id === current)
      .map((d) => ({
        id: d.id,
        label: `${d.firstName} ${d.lastName}`,
        note: d.status === 'active' ? null : this.i18n.t('drivers.status.' + d.status),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  /** Trailers compatible with the cargo type; a selected incompatible one stays listed (and flagged). */
  protected readonly trailerOptions = computed<Option[]>(() => {
    const { cargoType, trailerId } = this.value();
    const compatible = COMPATIBLE_TRAILERS[cargoType];
    return this.directory
      .trailers()
      .filter((t) => (compatible.includes(t.type) && t.status !== 'inactive') || t.id === trailerId)
      .map((t) => ({
        id: t.id,
        label: `${t.plateNumber} · ${this.i18n.t('trailers.types.' + t.type)} · ${this.format.number(t.capacityTonnes)} ${this.i18n.t('common.units.tonnes')}`,
        note: !compatible.includes(t.type)
          ? this.i18n.t('trips.hints.incompatible')
          : t.status === 'available'
            ? null
            : this.i18n.t('trailers.status.' + t.status),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  // ── Checks ────────────────────────────────────────────────────────────────

  protected readonly departureIso = computed(() => fromDateTimeLocalValue(this.value().plannedDeparture));
  protected readonly arrivalIso = computed(() => fromDateTimeLocalValue(this.value().plannedArrival));

  protected readonly checkReady = computed(() => !!this.vehicle() && !!this.driver() && !!this.departureIso() && !!this.arrivalIso());

  private readonly issues = computed(() =>
    sortIssues(
      checkTripAssignment({
        tripId: this.editing()?.id ?? null,
        vehicle: this.vehicle(),
        driver: this.driver(),
        trailer: this.trailer(),
        cargoType: this.value().cargoType,
        weightTonnes: Number(this.value().weightTonnes ?? 0),
        crossBorder: this.crossBorder(),
        plannedDeparture: this.departureIso(),
        plannedArrival: this.arrivalIso(),
        trips: this.directory.trips(),
        today: this.clock.today(),
      }),
    ).filter((issue) => issue.code !== 'arrival_before_departure'), // shown by the schedule field instead
  );

  protected readonly blocking = computed<IssueView[]>(() => this.issues().filter((i) => i.blocking).map((i) => this.view(i)));
  protected readonly warnings = computed<IssueView[]>(() => this.issues().filter((i) => !i.blocking).map((i) => this.view(i)));

  protected readonly suggestedArrival = computed(() => {
    const route = this.selectedRoute();
    return route ? suggestArrival(this.value().plannedDeparture, route.typicalDurationHours) : '';
  });

  protected readonly suggestedArrivalIso = computed(() => fromDateTimeLocalValue(this.suggestedArrival()));

  protected readonly durationHours = computed(() => {
    const from = this.departureIso();
    const to = this.arrivalIso();
    return from && to && to > from ? hoursBetween(from, to) : null;
  });

  protected readonly revenuePerKm = computed(() => {
    const { revenueAmount, plannedDistanceKm } = this.value();
    return revenueAmount && plannedDistanceKm && plannedDistanceKm > 0 ? revenueAmount / plannedDistanceKm : null;
  });

  /** Completion per section, for the sidebar checklist. */
  protected readonly sections = computed<{ id: SectionId; complete: boolean }[]>(() => {
    this.value();
    const c = this.form.controls;
    const valid = (...controls: AbstractControl[]) => controls.every((control) => control.valid);
    return [
      { id: 'route', complete: valid(c.originCity, c.originSite, c.originCountry, c.destinationCity, c.destinationSite, c.destinationCountry, c.plannedDistanceKm) },
      { id: 'cargo', complete: valid(c.customerId, c.customerReference, c.cargoType, c.cargoDescription, c.weightTonnes, c.containerRef, c.sealNumber) },
      { id: 'assignment', complete: valid(c.vehicleId, c.driverId) && this.blocking().length === 0 },
      { id: 'schedule', complete: valid(c.plannedDeparture, c.plannedArrival) && !this.form.hasError('dateOrder') },
      { id: 'commercial', complete: valid(c.revenueAmount, c.revenueCurrency, c.notes) },
    ];
  });

  constructor() {
    effect(() => {
      if (this.initialised() || this.directory.loading()) return;
      untracked(() => this.initialise());
    });

    const c = this.form.controls;
    const whenUser = <T>(control: AbstractControl<T>, handler: (value: T) => void) =>
      control.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
        if (!this.populating) handler(value);
      });

    whenUser(c.routeId, (routeId) => this.applyRoute(routeId));
    whenUser(c.plannedDeparture, () => this.maybeSuggestArrival());
    whenUser(c.vehicleId, (vehicleId) => this.applyVehicleDefaults(vehicleId));
    whenUser(c.customerId, (customerId) => this.applyCustomerCurrency(customerId));
    whenUser(c.originCity, () => this.detachRouteIfChanged());
    whenUser(c.destinationCity, () => this.detachRouteIfChanged());
    c.cargoType.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => c.containerRef.updateValueAndValidity());
  }

  /** Used by the route's canDeactivate guard. */
  canLeave(): boolean | Promise<boolean> {
    if (this.saved || !this.form.dirty || this.readOnly()) return true;
    return this.confirm.ask({
      title: this.i18n.t('common.confirm.discardTitle'),
      message: this.i18n.t('common.confirm.discardMessage'),
      confirmLabel: this.i18n.t('common.confirm.discard'),
      tone: 'danger',
    });
  }

  protected cancel(): void {
    const trip = this.editing();
    void this.router.navigate(trip ? ['/trips', trip.id] : ['/trips']);
  }

  protected scrollTo(section: SectionId): void {
    const element = this.host.nativeElement.querySelector<HTMLElement>(`#trip-section-${section}`);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    element.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea')?.focus({ preventScroll: true });
  }

  protected applySuggestion(): void {
    const suggestion = this.suggestedArrival();
    if (!suggestion) return;
    this.lastSuggestedArrival = suggestion;
    this.form.controls.plannedArrival.setValue(suggestion);
    this.form.controls.plannedArrival.markAsDirty();
    this.form.controls.plannedArrival.markAsTouched();
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      revealErrors(this.form, this.host.nativeElement);
      this.toast.error(this.i18n.t('validation.formInvalid'));
      return;
    }
    if (this.blocking().length) {
      this.toast.error(this.i18n.t('trips.validation.blocking'));
      this.scrollTo('assignment');
      return;
    }
    this.saving.set(true);
    const existing = this.editing();
    const input = toTripInput(this.form.getRawValue(), { reference: this.reference(), vehicleType: this.vehicle()?.type });
    try {
      let saved: Trip;
      if (existing) {
        saved = await this.workflow.update(existing.id, input);
      } else {
        const name = this.directory.user(this.users.currentUserId())?.fullName ?? '—';
        saved = await this.workflow.create(input, this.i18n.t('trips.form.createdNote', { name }));
      }
      this.saved = true;
      this.toast.success(this.i18n.t(existing ? 'trips.toasts.updated' : 'trips.toasts.created', { reference: saved.reference }));
      await this.router.navigate(['/trips', saved.id]);
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }

  protected optionLabel(option: Option): string {
    return option.note ? `${option.label} (${option.note})` : option.label;
  }

  protected countryLabel(code: string): string {
    return this.i18n.t('countries.' + code);
  }

  // ── Prefill logic ─────────────────────────────────────────────────────────

  private initialise(): void {
    let value: TripFormValue;
    if (this.isEdit()) {
      const trip = this.editing();
      if (!trip) return; // not found; the template shows the empty state
      value = tripToFormValue(trip);
    } else {
      const source = this.duplicateSource();
      value = source ? duplicateFormValue(source) : emptyTripForm(this.settings.reportingCurrency());
    }

    this.populating = true;
    this.form.reset(value);
    if (!this.isEdit()) this.applyQueryPrefill(!!this.duplicateSource());
    this.populating = false;
    this.initialised.set(true);
  }

  private applyQueryPrefill(duplicating: boolean): void {
    const c = this.form.controls;
    const customer = this.directory.customer(this.customerId());
    if (customer) {
      c.customerId.setValue(customer.id);
      if (!duplicating) this.applyCustomerCurrency(customer.id);
    }
    const vehicle = this.directory.vehicle(this.vehicleId());
    if (vehicle) {
      c.vehicleId.setValue(vehicle.id);
      this.applyVehicleDefaults(vehicle.id);
    }
    const driver = this.directory.driver(this.driverId());
    if (driver) c.driverId.setValue(driver.id);
  }

  private applyRoute(routeId: string): void {
    const route = this.directory.routeById().get(routeId);
    if (!route) return;
    this.form.patchValue(routePrefill(route));
    this.maybeSuggestArrival();
  }

  /** Fills the arrival from the route's typical duration unless the user typed their own. */
  private maybeSuggestArrival(): void {
    // Read the controls directly: the value signal updates only after the whole group emits.
    const raw = this.form.getRawValue();
    const route = this.directory.routeById().get(raw.routeId);
    const suggestion = route ? suggestArrival(raw.plannedDeparture, route.typicalDurationHours) : '';
    const arrival = this.form.controls.plannedArrival;
    if (!suggestion || (arrival.value && arrival.value !== this.lastSuggestedArrival)) return;
    this.lastSuggestedArrival = suggestion;
    arrival.setValue(suggestion);
  }

  private applyVehicleDefaults(vehicleId: string): void {
    const vehicle = this.directory.vehicle(vehicleId);
    if (!vehicle) return;
    const c = this.form.controls;
    const driver = this.directory.driver(vehicle.assignedDriverId);
    if (driver && driver.status !== 'inactive') c.driverId.setValue(driver.id);
    if (vehicle.type !== 'truck_tractor') c.trailerId.setValue('');
    else if (vehicle.linkedTrailerId) c.trailerId.setValue(vehicle.linkedTrailerId);
  }

  private applyCustomerCurrency(customerId: string): void {
    const currency = this.form.controls.revenueCurrency;
    const preferred = this.directory.customer(customerId)?.preferredCurrency;
    if (this.isEdit() || currency.dirty || !preferred || !ACTIVE_CURRENCIES.includes(preferred)) return;
    currency.setValue(preferred);
  }

  /** A preset no longer applies once its cities are changed by hand. */
  private detachRouteIfChanged(): void {
    const { routeId, originCity, destinationCity } = this.form.getRawValue();
    const route = this.directory.routeById().get(routeId);
    if (route && (route.origin.city !== originCity.trim() || route.destination.city !== destinationCity.trim())) {
      this.form.controls.routeId.setValue('');
    }
  }

  private view(issue: AssignmentIssue): IssueView {
    return {
      code: issue.code,
      message: describeIssue(issue, {
        t: (key, params) => this.i18n.t(key, params),
        date: (value) => this.format.date(value, 'medium'),
        number: (value, digits) => this.format.number(value, digits ?? 0),
      }),
    };
  }
}
