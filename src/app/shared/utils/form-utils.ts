import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isValidContainerNumber } from '../../core/domain/trip-rules';

/** Marks every control as touched so errors become visible, and focuses the first invalid field. */
export function revealErrors(form: FormGroup, root: HTMLElement | null = null): void {
  form.markAllAsTouched();
  queueMicrotask(() => {
    const invalid = (root ?? document).querySelector<HTMLElement>('.ng-invalid[formControlName], .ng-invalid [formControlName].ng-invalid');
    invalid?.focus();
  });
}

export const positiveNumber: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value;
  if (value === null || value === undefined || value === '') return null;
  return Number(value) > 0 ? null : { positive: true };
};

/** Mozambican registration plate (fictional data): AAA-123-SF. */
export const plateNumber: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = String(control.value ?? '').trim().toUpperCase();
  if (!value) return null;
  return /^[A-Z]{3}-\d{3}-[A-Z]{2}$/.test(value) || /^[A-Z]{2}-\d{4}-[A-Z]{2}$/.test(value) ? null : { plate: true };
};

export const phoneNumber: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  if (!value) return null;
  return /^\+?[\d\s()-]{8,20}$/.test(value) ? null : { phone: true };
};

export const containerNumber: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  if (!value) return null;
  return isValidContainerNumber(value) ? null : { containerRef: true };
};

/** Group validator: `end` must be after `start` (dates or datetimes as ISO strings). */
export function dateOrder(startKey: string, endKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const start = group.get(startKey)?.value;
    const end = group.get(endKey)?.value;
    if (!start || !end) return null;
    return String(end) > String(start) ? null : { dateOrder: true };
  };
}

/** Empty strings become null so optional fields are stored consistently. */
export function emptyToNull<T>(value: T | ''): T | null {
  return value === '' || value === undefined ? null : (value as T);
}
