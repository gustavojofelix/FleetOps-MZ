import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FileStorage } from '../../../core/backend/file-storage';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { Organization } from '../../../core/models';
import { CompanySettingsService } from '../../../core/state/company-settings.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { Icon } from '../../../shared/ui/icon/icon';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { phoneNumber, revealErrors } from '../../../shared/utils/form-utils';
import { trackSettingsForm } from '../settings-form';
import { SettingsScope } from '../settings-scope/settings-scope';
import { CanDirective } from '../../../shared/ui/can/can.directive';
import { PermissionService } from '../../../core/services/permission.service';

const COUNTRIES = ['MZ', 'ZA', 'ZW', 'MW', 'ZM'] as const;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** NUIT: 9 digits, optionally grouped in threes. */
const nuit = (control: AbstractControl): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  if (!value) return null;
  return /^\d{3}\s?\d{3}\s?\d{3}$/.test(value) ? null : { nuit: 'settings.company.validation.taxId' };
};

@Component({
  selector: 'app-company-profile-panel',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError, Icon, SettingsScope, CanDirective],
  templateUrl: './company-profile-panel.html',
  styleUrl: './company-profile-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyProfilePanel {
  readonly organization = input.required<Organization>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly settings = inject(CompanySettingsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly permissions = inject(PermissionService);
  private readonly files = inject(FileStorage);

  protected readonly countries = COUNTRIES;
  protected readonly saving = signal(false);
  protected readonly canManage = computed(() => this.permissions.can('settings.manage'));
  /** Stored logo (short-lived signed URL) or a local preview while it uploads. */
  protected readonly logoUrl = signal<string | null>(null);
  protected readonly logoName = signal<string | null>(null);
  protected readonly dragging = signal(false);

  protected readonly form = this.fb.group({
    displayName: ['', [Validators.required, Validators.maxLength(60)]],
    legalName: ['', [Validators.required, Validators.maxLength(120)]],
    taxId: ['', [Validators.required, nuit]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(120)]],
    phone: ['', [Validators.required, phoneNumber]],
    address: ['', [Validators.required, Validators.maxLength(160)]],
    city: ['', [Validators.required, Validators.maxLength(60)]],
    country: ['MZ', Validators.required],
  });

  private readonly saved = computed(() => {
    const o = this.organization();
    return {
      displayName: o.displayName,
      legalName: o.legalName,
      taxId: o.taxId,
      email: o.email,
      phone: o.phone,
      address: o.address,
      city: o.city,
      country: o.country,
    };
  });

  protected readonly tracker = trackSettingsForm(this.form, this.saved);

  protected readonly initials = computed(() =>
    this.organization()
      .displayName.split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join(''),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revokeLogo());
    // The logo lives in storage under the organization id.
    effect(() => {
      const id = this.organization().id;
      untracked(() => void this.loadLogo(id));
    });
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      revealErrors(this.form, this.host.nativeElement);
      this.toast.error(this.i18n.t('validation.formInvalid'));
      return;
    }
    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      await this.settings.save({
        displayName: value.displayName.trim(),
        legalName: value.legalName.trim(),
        taxId: value.taxId.trim(),
        email: value.email.trim().toLowerCase(),
        phone: value.phone.trim(),
        address: value.address.trim(),
        city: value.city.trim(),
        country: value.country,
      });
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

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.previewLogo(input.files?.[0] ?? null);
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    void this.previewLogo(event.dataTransfer?.files?.[0] ?? null);
  }

  protected async removeLogo(): Promise<void> {
    try {
      await this.files.removeAll('company', this.organization().id);
      this.revokeLogo();
      this.logoUrl.set(null);
      this.logoName.set(null);
    } catch (error) {
      console.error(error);
      this.toast.error(this.i18n.t('common.toasts.error'));
    }
  }

  /** Validates, shows a local preview immediately and uploads the logo. */
  private async previewLogo(file: File | null): Promise<void> {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.toast.error(this.i18n.t('settings.company.logoInvalid'));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      this.toast.error(this.i18n.t('settings.company.logoTooLarge'));
      return;
    }
    const previous = { url: this.logoUrl(), name: this.logoName() };
    this.revokeLogo();
    this.logoUrl.set(URL.createObjectURL(file));
    this.logoName.set(file.name);
    try {
      await this.files.sync('company', this.organization().id, file, false);
      this.toast.success(this.i18n.t('common.toasts.saved'));
    } catch (error) {
      console.error(error);
      this.revokeLogo();
      this.logoUrl.set(previous.url);
      this.logoName.set(previous.name);
      this.toast.error(this.i18n.t('common.toasts.error'));
    }
  }

  private async loadLogo(organizationId: string): Promise<void> {
    try {
      const url = await this.files.openUrl('company', organizationId);
      this.logoUrl.set(url);
      this.logoName.set(url ? decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '') : null);
    } catch (error) {
      console.error(error);
    }
  }

  /** Only local previews (blob: URLs) need releasing. */
  private revokeLogo(): void {
    const url = this.logoUrl();
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}
