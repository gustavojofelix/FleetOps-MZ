import { Injectable, Signal, computed, inject } from '@angular/core';
import { createQuery } from '../data-access/query';
import {
  CustomerRepository,
  DocumentRepository,
  DriverRepository,
  ExpenseRepository,
  FuelRepository,
  MaintenanceRepository,
  RouteRepository,
  TrailerRepository,
  TripRepository,
  UserRepository,
  VehicleRepository,
} from '../data-access/repositories';
import {
  AppUser,
  Customer,
  Driver,
  Expense,
  FleetDocument,
  FuelRecord,
  MaintenanceRecord,
  RouteDefinition,
  Trailer,
  Trip,
  Vehicle,
} from '../models';

function indexById<T extends { id: string }>(items: readonly T[] | undefined): Map<string, T> {
  return new Map((items ?? []).map((item) => [item.id, item]));
}

/**
 * Reactive read model holding every collection of the active organization, refreshed when a
 * repository reports changes. Used for lookups (names, plates), cross-entity views, dashboards,
 * reports and global search. Paged lists still query repositories directly.
 */
@Injectable({ providedIn: 'root' })
export class EntityDirectory {
  private readonly vehicleRepo = inject(VehicleRepository);
  private readonly driverRepo = inject(DriverRepository);
  private readonly trailerRepo = inject(TrailerRepository);
  private readonly customerRepo = inject(CustomerRepository);
  private readonly tripRepo = inject(TripRepository);
  private readonly fuelRepo = inject(FuelRepository);
  private readonly expenseRepo = inject(ExpenseRepository);
  private readonly maintenanceRepo = inject(MaintenanceRepository);
  private readonly documentRepo = inject(DocumentRepository);
  private readonly userRepo = inject(UserRepository);
  private readonly routeRepo = inject(RouteRepository);

  private readonly vehiclesQuery = createQuery(() => this.vehicleRepo.changes(), () => this.vehicleRepo.all());
  private readonly driversQuery = createQuery(() => this.driverRepo.changes(), () => this.driverRepo.all());
  private readonly trailersQuery = createQuery(() => this.trailerRepo.changes(), () => this.trailerRepo.all());
  private readonly customersQuery = createQuery(() => this.customerRepo.changes(), () => this.customerRepo.all());
  private readonly tripsQuery = createQuery(() => this.tripRepo.changes(), () => this.tripRepo.all());
  private readonly fuelQuery = createQuery(() => this.fuelRepo.changes(), () => this.fuelRepo.all());
  private readonly expensesQuery = createQuery(() => this.expenseRepo.changes(), () => this.expenseRepo.all());
  private readonly maintenanceQuery = createQuery(() => this.maintenanceRepo.changes(), () => this.maintenanceRepo.all());
  private readonly documentsQuery = createQuery(() => this.documentRepo.changes(), () => this.documentRepo.all());
  private readonly usersQuery = createQuery(() => this.userRepo.changes(), () => this.userRepo.all());
  private readonly routesQuery = createQuery(() => 0, () => this.routeRepo.all());

  readonly vehicles: Signal<Vehicle[]> = computed(() => this.vehiclesQuery.value() ?? []);
  readonly drivers: Signal<Driver[]> = computed(() => this.driversQuery.value() ?? []);
  readonly trailers: Signal<Trailer[]> = computed(() => this.trailersQuery.value() ?? []);
  readonly customers: Signal<Customer[]> = computed(() => this.customersQuery.value() ?? []);
  readonly trips: Signal<Trip[]> = computed(() => this.tripsQuery.value() ?? []);
  readonly fuel: Signal<FuelRecord[]> = computed(() => this.fuelQuery.value() ?? []);
  readonly expenses: Signal<Expense[]> = computed(() => this.expensesQuery.value() ?? []);
  readonly maintenance: Signal<MaintenanceRecord[]> = computed(() => this.maintenanceQuery.value() ?? []);
  readonly documents: Signal<FleetDocument[]> = computed(() => this.documentsQuery.value() ?? []);
  readonly users: Signal<AppUser[]> = computed(() => this.usersQuery.value() ?? []);
  readonly routes: Signal<RouteDefinition[]> = computed(() => this.routesQuery.value() ?? []);

  /** True until every collection has loaded once. */
  readonly loading = computed(() =>
    [
      this.vehiclesQuery,
      this.driversQuery,
      this.trailersQuery,
      this.customersQuery,
      this.tripsQuery,
      this.fuelQuery,
      this.expensesQuery,
      this.maintenanceQuery,
      this.documentsQuery,
      this.usersQuery,
      this.routesQuery,
    ].some((query) => query.initialLoading()),
  );

  readonly vehicleById = computed(() => indexById(this.vehicles()));
  readonly driverById = computed(() => indexById(this.drivers()));
  readonly trailerById = computed(() => indexById(this.trailers()));
  readonly customerById = computed(() => indexById(this.customers()));
  readonly tripById = computed(() => indexById(this.trips()));
  readonly userById = computed(() => indexById(this.users()));
  readonly routeById = computed(() => indexById(this.routes()));

  vehicle(id: string | null | undefined): Vehicle | undefined {
    return id ? this.vehicleById().get(id) : undefined;
  }

  driver(id: string | null | undefined): Driver | undefined {
    return id ? this.driverById().get(id) : undefined;
  }

  trailer(id: string | null | undefined): Trailer | undefined {
    return id ? this.trailerById().get(id) : undefined;
  }

  customer(id: string | null | undefined): Customer | undefined {
    return id ? this.customerById().get(id) : undefined;
  }

  trip(id: string | null | undefined): Trip | undefined {
    return id ? this.tripById().get(id) : undefined;
  }

  user(id: string | null | undefined): AppUser | undefined {
    return id ? this.userById().get(id) : undefined;
  }

  plate(vehicleId: string | null | undefined): string {
    return this.vehicle(vehicleId)?.plateNumber ?? '—';
  }

  driverName(driverId: string | null | undefined): string {
    const driver = this.driver(driverId);
    return driver ? `${driver.firstName} ${driver.lastName}` : '—';
  }

  customerName(customerId: string | null | undefined): string {
    return this.customer(customerId)?.name ?? '—';
  }

  tripReference(tripId: string | null | undefined): string {
    return this.trip(tripId)?.reference ?? '—';
  }

  /** "Beira → Tete" */
  routeLabel(trip: Pick<Trip, 'origin' | 'destination'>): string {
    return `${trip.origin.city} → ${trip.destination.city}`;
  }

  /** Display name of the entity a document (or similar) is attached to. */
  entityLabel(entityType: string, entityId: string): string {
    switch (entityType) {
      case 'vehicle':
        return this.plate(entityId);
      case 'driver':
        return this.driverName(entityId);
      case 'trailer':
        return this.trailer(entityId)?.plateNumber ?? '—';
      case 'trip':
        return this.tripReference(entityId);
      case 'customer':
        return this.customerName(entityId);
      default:
        return '—';
    }
  }

  /** Router link for an entity detail page. */
  entityLink(entityType: string, entityId: string): string[] {
    const segment: Record<string, string> = {
      vehicle: '/vehicles',
      driver: '/drivers',
      trailer: '/trailers',
      trip: '/trips',
      customer: '/customers',
    };
    return [segment[entityType] ?? '/', entityId];
  }
}
