import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LanguageCode } from '../../../core/i18n/languages';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { SupabaseAuthService } from '../../../core/supabase/supabase-auth.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { Icon } from '../../../shared/ui/icon/icon';
import { authErrorKey } from '../auth-errors';

type Mode = 'signIn' | 'signUp';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError, Icon],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly auth = inject(SupabaseAuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly i18n = inject(TranslationService);

  /** Query params: where to go after signing in, and an error raised by a guard. */
  readonly returnUrl = input<string | undefined>();
  readonly error = input<string | undefined>();

  protected readonly mode = signal<Mode>('signIn');
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly confirmationSentTo = signal<string | null>(null);
  protected readonly visibleError = computed(
    () => this.errorKey() ?? (this.error() === 'membership' ? 'auth.errors.membership' : null),
  );

  protected readonly form = this.fb.group({
    fullName: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected switchMode(mode: Mode): void {
    this.mode.set(mode);
    this.errorKey.set(null);
    this.confirmationSentTo.set(null);
    const fullName = this.form.controls.fullName;
    fullName.setValidators(mode === 'signUp' ? [Validators.required] : []);
    fullName.updateValueAndValidity();
    fullName.markAsUntouched();
  }

  protected setLanguage(code: LanguageCode): void {
    void this.i18n.use(code);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password, fullName } = this.form.getRawValue();
    this.busy.set(true);
    this.errorKey.set(null);
    try {
      if (this.mode() === 'signIn') {
        await this.auth.signIn(email.trim(), password);
        await this.router.navigateByUrl(this.safeReturnUrl());
      } else {
        const result = await this.auth.signUp(email.trim(), password, fullName.trim());
        if (result.needsConfirmation) {
          this.switchMode('signIn');
          this.confirmationSentTo.set(email.trim());
        } else {
          await this.router.navigateByUrl('/onboarding');
        }
      }
    } catch (error) {
      this.errorKey.set(authErrorKey(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** Only same-app paths are accepted, so a crafted link cannot redirect elsewhere. */
  private safeReturnUrl(): string {
    const url = this.returnUrl();
    return url && url.startsWith('/') && !url.startsWith('//') ? url : '/dashboard';
  }
}
