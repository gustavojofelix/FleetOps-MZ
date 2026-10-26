import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ACTIVE_CURRENCIES } from '../../../core/formatting/currency';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { CUSTOMER_SEGMENTS, CUSTOMER_STATUSES, CurrencyCode, Customer, CustomerSegment, CustomerStatus } from '../../../core/models';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { phoneNumber, revealErrors } from '../../../shared/utils/form-utils';
import { CUSTOMER_COUNTRIES } from '../customer-countries';
import { CustomersFacade, suggestCustomerCode } from '../customers.facade';

/** Create / edit form, rendered inside a drawer by the list and detail pages. */
@Component({
  selector: 'app-customer-form',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError, ...FORMAT_PIPES],
  templateUrl: './customer-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerForm {
  readonly customer = input<Customer | null>(null);
  readonly saved = output<Customer>();
  readonly cancelled = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly facade = inject(CustomersFacade);
  private readonly directory = inject(EntityDirectory);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly segments = CUSTOMER_SEGMENTS;
  protected readonly statuses = CUSTOMER_STATUSES;
  protected readonly countries = CUSTOMER_COUNTRIES;
  protected readonly currencies = ACTIVE_CURRENCIES;
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    legalName: ['', [Validators.required, Validators.maxLength(120)]],
    code: [suggestCustomerCode(this.directory.customers()), [Validators.required, Validators.maxLength(12), (c: AbstractControl) => this.uniqueCode(c)]],
    taxId: ['', Validators.maxLength(20)],
    segment: ['mining' as CustomerSegment, Validators.required],
    status: ['active' as CustomerStatus, Validators.required],
    contactName: ['', [Validators.required, Validators.maxLength(80)]],
    contactRole: ['', Validators.maxLength(60)],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(120)]],
    phone: ['', [Validators.required, phoneNumber]],
    city: ['', [Validators.required, Validators.maxLength(60)]],
    country: ['MZ', Validators.required],
    billingAddress: ['', Validators.maxLength(200)],
    billingEmail: ['', [Validators.email, Validators.maxLength(120)]],
    paymentTermsDays: [30, [Validators.required, Validators.min(0), Validators.max(180)]],
    preferredCurrency: ['MZN' as CurrencyCode, Validators.required],
    creditLimit: [0, [Validators.required, Validators.min(0)]],
    notes: ['', Validators.maxLength(500)],
  });

  protected readonly currencyValue = toSignal(this.form.controls.preferredCurrency.valueChanges, {
    initialValue: this.form.controls.preferredCurrency.value,
  });

  constructor() {
    queueMicrotask(() => this.populate());
  }

  protected isEditing(): boolean {
    return !!this.customer();
  }

  protected suggestCode(): void {
    this.form.controls.code.setValue(suggestCustomerCode(this.directory.customers()));
    this.form.controls.code.markAsTouched();
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      revealErrors(this.form, this.host.nativeElement);
      this.toast.error(this.i18n.t('validation.formInvalid'));
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const existing = this.customer();
    try {
      const saved = await this.facade.save(existing?.id ?? null, {
        code: value.code.trim().toUpperCase(),
        name: value.name.trim(),
        legalName: value.legalName.trim(),
        taxId: value.taxId.trim(),
        segment: value.segment,
        status: value.status,
        contactName: value.contactName.trim(),
        contactRole: value.contactRole.trim(),
        email: value.email.trim(),
        phone: value.phone.trim(),
        city: value.city.trim(),
        country: value.country,
        billingAddress: value.billingAddress.trim(),
        billingEmail: value.billingEmail.trim(),
        paymentTermsDays: Number(value.paymentTermsDays),
        preferredCurrency: value.preferredCurrency,
        creditLimit: { amount: Number(value.creditLimit), currency: value.preferredCurrency },
        // Demo figure owned by (future) invoicing: never edited here.
        outstandingBalance: existing?.outstandingBalance ?? { amount: 0, currency: value.preferredCurrency },
        notes: value.notes.trim(),
      });
      this.saved.emit(saved);
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }

  private populate(): void {
    const customer = this.customer();
    if (!customer) return;
    this.form.reset({
      name: customer.name,
      legalName: customer.legalName,
      code: customer.code,
      taxId: customer.taxId,
      segment: customer.segment,
      status: customer.status,
      contactName: customer.contactName,
      contactRole: customer.contactRole,
      email: customer.email,
      phone: customer.phone,
      city: customer.city,
      country: customer.country,
      billingAddress: customer.billingAddress,
      billingEmail: customer.billingEmail,
      paymentTermsDays: customer.paymentTermsDays,
      preferredCurrency: customer.preferredCurrency,
      creditLimit: customer.creditLimit.amount,
      notes: customer.notes,
    });
  }

  private uniqueCode(control: AbstractControl): ValidationErrors | null {
    const value = String(control.value ?? '').trim().toUpperCase();
    if (!value) return null;
    const clash = this.directory.customers().some((c) => c.id !== this.customer()?.id && c.code.toUpperCase() === value);
    return clash ? { unique: 'customers.validation.codeTaken' } : null;
  }
}
