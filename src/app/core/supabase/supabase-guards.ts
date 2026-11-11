import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TranslationService } from '../i18n/translation.service';
import { CompanySettingsService } from '../state/company-settings.service';
import { CurrentOrganization } from './current-organization.service';
import { ExchangeRatesLoader } from './exchange-rates.loader';
import { SupabaseAuthService } from './supabase-auth.service';

/** Requires a signed-in user; otherwise goes to /login and comes back afterwards. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(SupabaseAuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.session() ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Requires an organization membership; users without one go through onboarding. */
export const organizationGuard: CanActivateFn = async () => {
  const organization = inject(CurrentOrganization);
  const settings = inject(CompanySettingsService);
  const i18n = inject(TranslationService);
  const rates = inject(ExchangeRatesLoader);
  const router = inject(Router);
  try {
    const membership = await organization.load();
    if (!membership) return router.createUrlTree(['/onboarding']);
    // Company settings (currency, units, default language) for this organization.
    if (settings.organization()?.id !== membership.organizationId) {
      const [company] = await Promise.all([settings.load(), rates.load()]);
      await i18n.applyCompanyDefault(company.defaultLanguage);
    }
    return true;
  } catch (error) {
    console.error(error);
    return router.createUrlTree(['/login'], { queryParams: { error: 'membership' } });
  }
};

/** Onboarding is only for users who do not belong to an organization yet. */
export const noOrganizationGuard: CanActivateFn = async () => {
  const organization = inject(CurrentOrganization);
  const router = inject(Router);
  try {
    return (await organization.load()) ? router.createUrlTree(['/dashboard']) : true;
  } catch {
    return true;
  }
};
