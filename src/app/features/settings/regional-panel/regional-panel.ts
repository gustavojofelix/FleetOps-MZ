import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ACTIVE_CURRENCIES, CURRENCIES } from '../../../core/formatting/currency';
import { formatDate, formatDistance, formatVolume } from '../../../core/formatting/formatters';
import { findLanguage } from '../../../core/i18n/languages';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { CurrencyCode, DateFormatPreference, DistanceUnit, Organization, VolumeUnit } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { CompanySettingsService } from '../../../core/state/company-settings.service';
import { PreferencesService } from '../../../core/state/preferences.service';
import { Icon } from '../../../shared/ui/icon/icon';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { revealErrors } from '../../../shared/utils/form-utils';
import { trackSettingsForm } from '../settings-form';
import { SettingsScope } from '../settings-scope/settings-scope';

const TIME_ZONES = ['Africa/Maputo', 'Africa/Johannesburg', 'Africa/Harare', 'Africa/Blantyre', 'Africa/Lusaka'] as const;
const DATE_FORMATS: readonly DateFormatPreference[] = ['dd/MM/yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'];
const DISTANCE_UNITS: readonly DistanceUnit[] = ['km', 'mi'];
const VOLUME_UNITS: readonly VolumeUnit[] = ['l', 'gal'];
/** Sample figures for the live unit examples (a typical Beira → Harare leg and a full tank). */
const SAMPLE_KM = 560;
const SAMPLE_LITRES = 400;

@Component({
  selector: 'app-regional-panel',
  imports: [ReactiveFormsModule, TranslatePipe, Icon, SettingsScope],
  templateUrl: './regional-panel.html',
  styleUrl: './regional-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegionalPanel {
  readonly organization = input.required<Organization>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly settings = inject(CompanySettingsService);
  private readonly preferences = inject(PreferencesService);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(ClockService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly i18n = inject(TranslationService);

  protected readonly timeZones = TIME_ZONES;
  protected readonly dateFormats = DATE_FORMATS;
  protected readonly distanceUnits = DISTANCE_UNITS;
  protected readonly volumeUnits = VOLUME_UNITS;
  protected readonly currencies = ACTIVE_CURRENCIES;
  protected readonly currencyMeta = CURRENCIES;
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    defaultLanguage: ['pt-MZ', Validators.required],
    reportingCurrency: ['MZN' as CurrencyCode, Validators.required],
    timeZone: ['Africa/Maputo', Validators.required],
    dateFormat: ['dd/MM/yyyy' as DateFormatPreference, Validators.required],
    distanceUnit: ['km' as DistanceUnit, Validators.required],
    volumeUnit: ['l' as VolumeUnit, Validators.required],
  });

  private readonly saved = computed(() => {
    const o = this.organization();
    return {
      defaultLanguage: o.defaultLanguage,
      reportingCurrency: o.reportingCurrency,
      timeZone: o.timeZone,
      dateFormat: o.dateFormat,
      distanceUnit: o.distanceUnit,
      volumeUnit: o.volumeUnit,
    };
  });

  protected readonly tracker = trackSettingsForm(this.form, this.saved);
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly currencyChanged = computed(() => {
    const selected = this.value().reportingCurrency;
    return !!selected && selected !== this.organization().reportingCurrency;
  });

  /** Name of the personal language, when the user overrides the company default. */
  protected readonly personalLanguage = computed(() => findLanguage(this.preferences.language())?.nativeName ?? null);

  protected dateExample(pattern: DateFormatPreference): string {
    return formatDate(this.clock.today(), this.i18n.locale(), 'short', pattern);
  }

  protected distanceExample(unit: DistanceUnit): string {
    return formatDistance(SAMPLE_KM, this.i18n.locale(), unit);
  }

  protected volumeExample(unit: VolumeUnit): string {
    return formatVolume(SAMPLE_LITRES, this.i18n.locale(), unit, 0);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      revealErrors(this.form, this.host.nativeElement);
      this.toast.error(this.i18n.t('validation.formInvalid'));
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const languageChanged = value.defaultLanguage !== this.organization().defaultLanguage;
    try {
      await this.settings.save(value);
      if (languageChanged) await this.i18n.applyCompanyDefault(value.defaultLanguage);
      this.toast.success(this.i18n.t('settings.toasts.saved'));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }

  protected discard(): void {
    this.tracker.discard();
    this.toast.info(this.i18n.t('settings.toasts.discarded'));
  }
}
