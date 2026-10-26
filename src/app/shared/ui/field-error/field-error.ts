import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { TranslationService } from '../../../core/i18n/translation.service';
import { Icon } from '../icon/icon';

/**
 * Shows the first validation error of a control once it is touched.
 * `<app-field-error [control]="form.controls.plateNumber" />`
 * Group-level errors (e.g. date order) can be attached with [group] and groupError.
 */
@Component({
  selector: 'app-field-error',
  imports: [Icon],
  templateUrl: './field-error.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldError {
  readonly control = input.required<AbstractControl | null | undefined>();
  readonly group = input<AbstractControl | null>(null);
  readonly groupError = input<string | null>(null);

  private readonly i18n = inject(TranslationService);
  /** Control state is not signal-based; bump on every control event. */
  private readonly tick = signal(0);

  constructor() {
    effect((onCleanup) => {
      const subs = [this.control(), this.group()]
        .filter((control): control is AbstractControl => !!control)
        .map((control) => control.events.subscribe(() => this.tick.update((n) => n + 1)));
      onCleanup(() => subs.forEach((sub) => sub.unsubscribe()));
    });
  }

  protected readonly message = computed(() => {
    this.tick();
    this.i18n.revision();
    const control = this.control();
    if (!control || !control.touched) return null;
    const groupKey = this.groupError();
    if (groupKey && this.group()?.errors?.[groupKey]) return this.i18n.t(`validation.${groupKey}`);
    const errors = control.errors;
    if (!errors) return null;
    const [key, value] = Object.entries(errors)[0];
    switch (key) {
      case 'min':
        return this.i18n.t('validation.min', { min: value.min });
      case 'max':
        return this.i18n.t('validation.max', { max: value.max });
      case 'minlength':
        return this.i18n.t('validation.minLength', { length: value.requiredLength });
      case 'maxlength':
        return this.i18n.t('validation.maxLength', { length: value.requiredLength });
    }
    // Custom validators may return a translation key as their value.
    if (typeof value === 'string' && this.i18n.has(value)) return this.i18n.t(value);
    if (this.i18n.has(`validation.${key}`)) return this.i18n.t(`validation.${key}`);
    return this.i18n.t('validation.pattern');
  });
}
