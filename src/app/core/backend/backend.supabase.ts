import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { CanActivateFn, Routes } from '@angular/router';
import { VehicleRepository } from '../data-access/repositories';
import { provideMockDataAccess } from '../data-access/provide-data-access';
import { SupabaseAuthService } from '../supabase/supabase-auth.service';
import { authGuard, noOrganizationGuard, organizationGuard } from '../supabase/supabase-guards';
import { SupabaseVehicleRepository } from '../supabase/supabase-vehicle.repository';
import { AuthSession } from './auth-session';

/*
 * Backend selection — SUPABASE build. Replaces `backend.ts` via angular.json `fileReplacements`.
 *
 * Migration in progress: repositories move to Supabase one by one as their tables exist.
 * Everything not overridden below still uses the local mock.
 */

export const BACKEND_KIND: 'mock' | 'supabase' = 'supabase';

export function provideBackend(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideMockDataAccess(),
    // Overrides (last provider for a token wins).
    { provide: VehicleRepository, useClass: SupabaseVehicleRepository },
    { provide: AuthSession, useExisting: SupabaseAuthService },
  ]);
}

export const authRoutes: Routes = [
  {
    path: 'login',
    data: { titleKey: 'auth.login.title' },
    loadComponent: () => import('../../features/auth/login-page/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'onboarding',
    canActivate: [authGuard, noOrganizationGuard],
    data: { titleKey: 'auth.onboarding.title' },
    loadComponent: () => import('../../features/auth/onboarding-page/onboarding-page').then((m) => m.OnboardingPage),
  },
];

export const shellGuards: CanActivateFn[] = [authGuard, organizationGuard];
