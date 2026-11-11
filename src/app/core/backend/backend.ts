import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { CanActivateFn, Routes } from '@angular/router';
import { provideMockDataAccess } from '../data-access/provide-data-access';
import { AuthSession, DemoAuthSession } from './auth-session';

/*
 * Backend selection — DEMO build (default).
 *
 * `ng build --configuration supabase` replaces this file with `backend.supabase.ts`
 * (see angular.json `fileReplacements`), so the demo bundle never contains Supabase code.
 * Both files must export the same names.
 */

export const BACKEND_KIND: 'mock' | 'supabase' = 'mock';

export function provideBackend(): EnvironmentProviders {
  return makeEnvironmentProviders([provideMockDataAccess(), { provide: AuthSession, useClass: DemoAuthSession }]);
}

/** Routes outside the application shell (sign-in, onboarding). None in the demo. */
export const authRoutes: Routes = [];

/** Guards protecting the application shell. None in the demo. */
export const shellGuards: CanActivateFn[] = [];
