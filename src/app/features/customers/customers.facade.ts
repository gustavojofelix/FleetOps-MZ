import { Injectable, computed, inject } from '@angular/core';
import { EntityInput } from '../../core/data-access/query.model';
import { CustomerRepository, TripRepository } from '../../core/data-access/repositories';
import { convertMoney } from '../../core/formatting/currency';
import { isWithinRange } from '../../core/formatting/date-utils';
import { ACTIVE_TRIP_STATUSES, Customer, CustomerStatus, FINISHED_TRIP_STATUSES, IsoDate, Trip } from '../../core/models';
import { EntityDirectory } from '../../core/services/entity-directory.service';
import { FleetAnalytics } from '../../core/services/fleet-analytics.service';

export type CustomerInput = EntityInput<Customer>;

/** Per-customer aggregates. Money values are in the reporting currency (simulated conversion). */
export interface CustomerMetrics {
  tripsTotal: number;
  tripsActive: number;
  tripsInPeriod: number;
  revenueTotal: number;
  revenueInPeriod: number;
  finishedTrips: number;
  /** Revenue-weighted average contribution margin ratio of finished trips; null without revenue. */
  averageMarginRatio: number | null;
}

/** Credit usage of the (demo) outstanding balance against the credit limit. */
export interface CreditUsage {
  /** Ratio 0–n; null when there is no credit limit. */
  ratio: number | null;
  level: 'ok' | 'warning' | 'danger';
}

export const CREDIT_WARNING_RATIO = 0.8;

/** Trip date used for period filters: actual arrival when delivered, else planned departure. */
export function tripReportingDate(trip: Trip): string {
  return FINISHED_TRIP_STATUSES.includes(trip.status) ? (trip.actualArrival ?? trip.plannedArrival) : trip.plannedDeparture;
}

export function creditUsage(customer: Pick<Customer, 'creditLimit' | 'outstandingBalance'>): CreditUsage {
  if (!customer.creditLimit.amount) return { ratio: null, level: 'ok' };
  const balance = convertMoney(customer.outstandingBalance, customer.creditLimit.currency).converted.amount;
  const ratio = Math.max(0, balance / customer.creditLimit.amount);
  return { ratio, level: ratio > 1 ? 'danger' : ratio > CREDIT_WARNING_RATIO ? 'warning' : 'ok' };
}

/** Next free code in the CLI-0xx sequence. */
export function suggestCustomerCode(existing: readonly Pick<Customer, 'code'>[]): string {
  const max = existing.reduce((highest, customer) => {
    const match = /^CLI-(\d+)$/i.exec(customer.code.trim());
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `CLI-${String(max + 1).padStart(3, '0')}`;
}

/**
 * Customer workflows and the shared per-customer figures used by the list and detail pages,
 * so both screens always show the same numbers.
 */
@Injectable({ providedIn: 'root' })
export class CustomersFacade {
  private readonly customers = inject(CustomerRepository);
  private readonly trips = inject(TripRepository);
  private readonly directory = inject(EntityDirectory);
  private readonly analytics = inject(FleetAnalytics);

  /** Trips grouped by customer, newest first. */
  readonly tripsByCustomer = computed(() => {
    const map = new Map<string, Trip[]>();
    for (const trip of this.directory.trips()) {
      const list = map.get(trip.customerId);
      if (list) list.push(trip);
      else map.set(trip.customerId, [trip]);
    }
    for (const list of map.values()) list.sort((a, b) => b.plannedDeparture.localeCompare(a.plannedDeparture));
    return map;
  });

  tripsOf(customerId: string): Trip[] {
    return this.tripsByCustomer().get(customerId) ?? [];
  }

  /** Computes metrics for every customer for the given period (null bounds = open). */
  metricsFor(from: IsoDate | null, to: IsoDate | null): Map<string, CustomerMetrics> {
    const result = new Map<string, CustomerMetrics>();
    for (const [customerId, trips] of this.tripsByCustomer()) {
      result.set(customerId, this.computeMetrics(trips, from, to));
    }
    return result;
  }

  metricsOf(customerId: string): CustomerMetrics {
    return this.computeMetrics(this.tripsOf(customerId), null, null);
  }

  async save(id: string | null, input: CustomerInput): Promise<Customer> {
    return id ? this.customers.update(id, input) : this.customers.create(input);
  }

  setStatus(id: string, status: CustomerStatus): Promise<Customer> {
    return this.customers.update(id, { status });
  }

  /** Customers with trip history cannot be deleted (history must stay intact). */
  async linkedTripCount(id: string): Promise<number> {
    return (await this.trips.list({ customerId: id })).total;
  }

  delete(id: string): Promise<void> {
    return this.customers.delete(id);
  }

  private computeMetrics(trips: readonly Trip[], from: IsoDate | null, to: IsoDate | null): CustomerMetrics {
    let revenueTotal = 0;
    let revenueInPeriod = 0;
    let tripsInPeriod = 0;
    let tripsActive = 0;
    let finishedTrips = 0;
    let marginSum = 0;
    let marginRevenue = 0;
    let tripsTotal = 0;
    for (const trip of trips) {
      if (trip.status === 'cancelled') continue;
      tripsTotal++;
      if (ACTIVE_TRIP_STATUSES.includes(trip.status)) tripsActive++;
      const inPeriod = isWithinRange(tripReportingDate(trip), from, to);
      if (inPeriod) tripsInPeriod++;
      if (!FINISHED_TRIP_STATUSES.includes(trip.status)) continue;
      finishedTrips++;
      const profitability = this.analytics.profitabilityOf(trip.id);
      const revenue = profitability?.revenue ?? 0;
      revenueTotal += revenue;
      if (inPeriod) revenueInPeriod += revenue;
      if (profitability && revenue > 0) {
        marginSum += profitability.contributionMargin;
        marginRevenue += revenue;
      }
    }
    return {
      tripsTotal,
      tripsActive,
      tripsInPeriod,
      revenueTotal,
      revenueInPeriod,
      finishedTrips,
      averageMarginRatio: marginRevenue > 0 ? marginSum / marginRevenue : null,
    };
  }
}
