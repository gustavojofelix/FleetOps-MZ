import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { CurrentOrganization } from '../../../core/supabase/current-organization.service';
import { SupabaseAuthService } from '../../../core/supabase/supabase-auth.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { Icon } from '../../../shared/ui/icon/icon';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { authErrorKey } from '../auth-errors';

/** First sign-in without an organization: registers the company with the user as owner. */
@Component({
  selector: 'app-onboarding-page',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError, Icon],
  templateUrl: './onboarding-page.html',
  styleUrl: './onboarding-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingPage {
  private readonly auth = inject(SupabaseAuthService);
  private readonly organization = inject(CurrentOrganization);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly busy = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly email = this.auth.user()?.email ?? '';

  protected readonly form = this.fb.group({
    companyName: ['', [Validators.required, Validators.maxLength(120)]],
    fullName: [String(this.auth.user()?.user_metadata['full_name'] ?? ''), [Validators.required, Validators.maxLength(120)]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { companyName, fullName } = this.form.getRawValue();
    this.busy.set(true);
    this.errorKey.set(null);
    try {
      await this.organization.create(companyName.trim(), fullName.trim());
      this.toast.success(this.i18n.t('auth.onboarding.created'));
      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      console.error(error);
      this.errorKey.set(authErrorKey(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected signOut(): void {
    void this.auth.signOut();
  }
}
