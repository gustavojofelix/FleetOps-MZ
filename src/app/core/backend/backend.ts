import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { CanActivateFn, Routes } from '@angular/router';
import {
  CustomerRepository,
  DocumentRepository,
  DriverRepository,
  ExpenseRepository,
  FuelRepository,
  MaintenanceRepository,
  NotificationRepository,
  OrganizationRepository,
  RouteRepository,
  TrailerRepository,
  TripRepository,
  UserRepository,
  VehicleRepository,
} from '../data-access/repositories';
import { SupabaseAuthService } from '../supabase/supabase-auth.service';
import { authGuard, noOrganizationGuard, organizationGuard } from '../supabase/supabase-guards';
import {
  SupabaseCustomerRepository,
  SupabaseDriverRepository,
  SupabaseRouteRepository,
  SupabaseTrailerRepository,
  SupabaseVehicleRepository,
} from '../supabase/repositories/master-data.repositories';
import { SupabaseDocumentRepository, SupabaseNotificationRepository } from '../supabase/repositories/admin.repositories';
import { SupabaseFileStorage } from '../supabase/supabase-file-storage';
import { SupabaseExpenseRepository, SupabaseFuelRepository, SupabaseMaintenanceRepository } from '../supabase/repositories/cost.repositories';
import { SupabaseTripRepository } from '../supabase/repositories/trip.repository';
import { SupabaseOrganizationRepository, SupabaseUserRepository } from '../supabase/repositories/organization.repositories';
import { AuthSession } from './auth-session';
import { FileStorage } from './file-storage';

/*
 * Binds every data-access contract (core/data-access/repositories.ts) to its Supabase
 * implementation. Pages and facades depend only on the contracts.
 */
export function provideBackend(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: VehicleRepository, useClass: SupabaseVehicleRepository },
    { provide: DriverRepository, useClass: SupabaseDriverRepository },
    { provide: TrailerRepository, useClass: SupabaseTrailerRepository },
    { provide: CustomerRepository, useClass: SupabaseCustomerRepository },
    { provide: RouteRepository, useClass: SupabaseRouteRepository },
    { provide: OrganizationRepository, useClass: SupabaseOrganizationRepository },
    { provide: UserRepository, useClass: SupabaseUserRepository },
    { provide: TripRepository, useClass: SupabaseTripRepository },
    { provide: FuelRepository, useClass: SupabaseFuelRepository },
    { provide: ExpenseRepository, useClass: SupabaseExpenseRepository },
    { provide: MaintenanceRepository, useClass: SupabaseMaintenanceRepository },
    { provide: DocumentRepository, useClass: SupabaseDocumentRepository },
    { provide: NotificationRepository, useClass: SupabaseNotificationRepository },
    { provide: FileStorage, useClass: SupabaseFileStorage },
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
