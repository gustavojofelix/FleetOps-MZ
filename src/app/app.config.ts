import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { provideBackend } from './core/backend/backend';
import { TranslatedTitleStrategy } from './core/i18n/translated-title.strategy';
import { TranslationService } from './core/i18n/translation.service';
import { CompanySettingsService } from './core/state/company-settings.service';
import { ThemeService } from './core/state/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' })),
    // Demo (mock) or Supabase, chosen at build time: see core/backend/backend.ts.
    provideBackend(),
    { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
    provideAppInitializer(async () => {
      inject(ThemeService);
      const settings = inject(CompanySettingsService);
      const i18n = inject(TranslationService);
      const organization = await settings.load();
      await i18n.init(organization.defaultLanguage);
    }),
  ],
};
