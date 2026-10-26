import { Signal } from '@angular/core';
import {
  AppNotification,
  AppUser,
  ApprovalStatus,
  CurrencyCode,
  Customer,
  CustomerSegment,
  CustomerStatus,
  DocumentStatus,
  DocumentType,
  Driver,
  DriverStatus,
  EntityType,
  Expense,
  ExpenseCategory,
  FleetDocument,
  FuelRecord,
  MaintenanceDisplayStatus,
  MaintenanceRecord,
  MaintenanceType,
  NotificationCategory,
  Organization,
  RouteDefinition,
  Trailer,
  TrailerStatus,
  TrailerType,
  Trip,
  TripEvent,
  TripStatus,
  UserRole,
  UserStatus,
  Vehicle,
  VehicleStatus,
  VehicleType,
} from '../models';
import { DateRangeFilter, EntityInput, ListQuery, PagedResult } from './query.model';

/*
 * Data-access contracts. Pages and facades depend only on these abstract classes, which are
 * also the DI tokens. The current implementations are local mocks (core/services/mock-*);
 * a Supabase implementation can be provided instead without touching the UI.
 * Every method is asynchronous even though the mock data is local.
 */

export abstract class CrudRepository<T extends { id: string }, Q extends ListQuery = ListQuery> {
  /** Increments after every mutation; read it inside reactive queries to refetch. */
  abstract readonly changes: Signal<number>;
  abstract list(query?: Q): Promise<PagedResult<T>>;
  abstract all(): Promise<T[]>;
  abstract getById(id: string): Promise<T | undefined>;
  abstract create(input: EntityInput<T>): Promise<T>;
  abstract update(id: string, changes: Partial<EntityInput<T>>): Promise<T>;
  abstract delete(id: string): Promise<void>;
  /** Demo only: discards local changes and restores the original fixtures. */
  abstract reset(): void;
}

export interface VehicleQuery extends ListQuery {
  status?: VehicleStatus | null;
  type?: VehicleType | null;
}
export abstract class VehicleRepository extends CrudRepository<Vehicle, VehicleQuery> {
  /** Changes status and records the transition in the vehicle's history. */
  abstract changeStatus(id: string, status: VehicleStatus, reason: string): Promise<Vehicle>;
}

export interface DriverQuery extends ListQuery {
  status?: DriverStatus | null;
}
export abstract class DriverRepository extends CrudRepository<Driver, DriverQuery> {}

export interface TrailerQuery extends ListQuery {
  status?: TrailerStatus | null;
  type?: TrailerType | null;
}
export abstract class TrailerRepository extends CrudRepository<Trailer, TrailerQuery> {}

export interface CustomerQuery extends ListQuery {
  status?: CustomerStatus | null;
  segment?: CustomerSegment | null;
  country?: string | null;
}
export abstract class CustomerRepository extends CrudRepository<Customer, CustomerQuery> {}

export interface TripQuery extends ListQuery, DateRangeFilter {
  statuses?: TripStatus[] | null;
  customerId?: string | null;
  vehicleId?: string | null;
  driverId?: string | null;
  trailerId?: string | null;
  routeId?: string | null;
}
export abstract class TripRepository extends CrudRepository<Trip, TripQuery> {
  /** Updates the status and appends a timeline event (with actual times where relevant). */
  abstract changeStatus(id: string, status: TripStatus, note: string, delayReason?: string | null): Promise<Trip>;
  abstract addEvent(id: string, event: Omit<TripEvent, 'id'>): Promise<Trip>;
}

export interface FuelQuery extends ListQuery, DateRangeFilter {
  vehicleId?: string | null;
  driverId?: string | null;
  tripId?: string | null;
}
export abstract class FuelRepository extends CrudRepository<FuelRecord, FuelQuery> {}

export interface ExpenseQuery extends ListQuery, DateRangeFilter {
  category?: ExpenseCategory | null;
  approvalStatus?: ApprovalStatus | null;
  currency?: CurrencyCode | null;
  vehicleId?: string | null;
  tripId?: string | null;
}
export abstract class ExpenseRepository extends CrudRepository<Expense, ExpenseQuery> {
  abstract setApproval(id: string, status: ApprovalStatus): Promise<Expense>;
}

export interface MaintenanceQuery extends ListQuery, DateRangeFilter {
  vehicleId?: string | null;
  displayStatus?: MaintenanceDisplayStatus | null;
  type?: MaintenanceType | null;
}
export abstract class MaintenanceRepository extends CrudRepository<MaintenanceRecord, MaintenanceQuery> {}

export interface DocumentQuery extends ListQuery {
  type?: DocumentType | null;
  entityType?: EntityType | null;
  entityId?: string | null;
  status?: DocumentStatus | null;
}
export abstract class DocumentRepository extends CrudRepository<FleetDocument, DocumentQuery> {}

export interface NotificationQuery extends ListQuery {
  category?: NotificationCategory | null;
  unreadOnly?: boolean;
}
export abstract class NotificationRepository extends CrudRepository<AppNotification, NotificationQuery> {
  abstract markRead(id: string, read?: boolean): Promise<void>;
  abstract markAllRead(): Promise<void>;
}

export interface UserQuery extends ListQuery {
  role?: UserRole | null;
  status?: UserStatus | null;
}
export abstract class UserRepository extends CrudRepository<AppUser, UserQuery> {
  /** Demo: the signed-in user. Real identity will come from the auth provider. */
  abstract currentUserId(): string;
}

/** Company profile and settings for the active organization. */
export abstract class OrganizationRepository {
  abstract get(): Promise<Organization>;
  abstract update(changes: Partial<Omit<Organization, 'id' | 'createdAt'>>): Promise<Organization>;
  abstract reset(): void;
}

/** Reference data: frequently operated routes. */
export abstract class RouteRepository {
  abstract all(): Promise<RouteDefinition[]>;
}
