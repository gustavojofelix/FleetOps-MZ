import { ChangeDetectionStrategy, Component, ElementRef, inject, output, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { AppUser, UserRole } from '../../../core/models';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { Icon } from '../../../shared/ui/icon/icon';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { revealErrors } from '../../../shared/utils/form-utils';
import { ASSIGNABLE_ROLES } from '../role-permissions';
import { UsersFacade } from '../users.facade';

/** Invitation form rendered inside a drawer. Demo: no email is sent. */
@Component({
  selector: 'app-user-invite-form',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError, Icon],
  templateUrl: './user-invite-form.html',
  styleUrl: './user-invite-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserInviteForm {
  readonly saved = output<AppUser>();
  readonly cancelled = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly facade = inject(UsersFacade);
  private readonly directory = inject(EntityDirectory);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly roles = ASSIGNABLE_ROLES;
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    fullName: ['', [Validators.required, Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(120), (c: AbstractControl) => this.uniqueEmail(c)]],
    jobTitle: ['', Validators.maxLength(60)],
    role: ['viewer' as UserRole, Validators.required],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      revealErrors(this.form, this.host.nativeElement);
      this.toast.error(this.i18n.t('validation.formInvalid'));
      return;
    }
    this.saving.set(true);
    try {
      const user = await this.facade.invite(this.form.getRawValue());
      this.saved.emit(user);
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }

  private uniqueEmail(control: AbstractControl): ValidationErrors | null {
    const value = String(control.value ?? '').trim().toLowerCase();
    if (!value) return null;
    const clash = this.directory.users().some((u) => u.email.toLowerCase() === value);
    return clash ? { unique: 'users.validation.emailTaken' } : null;
  }
}
