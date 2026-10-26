import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { MockCustomersService } from '../services/mock-customers.service';
import { MockDocumentsService } from '../services/mock-documents.service';
import { MockDriversService } from '../services/mock-drivers.service';
import { MockExpensesService } from '../services/mock-expenses.service';
import { MockFuelService } from '../services/mock-fuel.service';
import { MockMaintenanceService } from '../services/mock-maintenance.service';
import { MockNotificationsService } from '../services/mock-notifications.service';
import { MockRoutesService, MockSettingsService } from '../services/mock-settings.service';
import { MockTrailersService } from '../services/mock-trailers.service';
import { MockTripsService } from '../services/mock-trips.service';
import { MockUsersService } from '../services/mock-users.service';
import { MockVehiclesService } from '../services/mock-vehicles.service';
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
} from './repositories';

/**
 * Binds every repository contract to its local mock implementation.
 * A future `provideSupabaseDataAccess()` would bind the same tokens to Supabase repositories.
 */
export function provideMockDataAccess(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: VehicleRepository, useClass: MockVehiclesService },
    { provide: DriverRepository, useClass: MockDriversService },
    { provide: TrailerRepository, useClass: MockTrailersService },
    { provide: CustomerRepository, useClass: MockCustomersService },
    { provide: TripRepository, useClass: MockTripsService },
    { provide: FuelRepository, useClass: MockFuelService },
    { provide: ExpenseRepository, useClass: MockExpensesService },
    { provide: MaintenanceRepository, useClass: MockMaintenanceService },
    { provide: DocumentRepository, useClass: MockDocumentsService },
    { provide: NotificationRepository, useClass: MockNotificationsService },
    { provide: UserRepository, useClass: MockUsersService },
    { provide: OrganizationRepository, useClass: MockSettingsService },
    { provide: RouteRepository, useClass: MockRoutesService },
  ]);
}
