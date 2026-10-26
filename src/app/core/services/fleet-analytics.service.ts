import { Injectable, computed, inject } from '@angular/core';
import { FuelAnalysis, analyseFuelRecords } from '../domain/fuel-analysis';
import { TripProfitability, calculateTripProfitability, maintenanceCostPerKm } from '../domain/profitability';
import { CompanySettingsService } from '../state/company-settings.service';
import { EntityDirectory } from './entity-directory.service';

/**
 * Derived, cross-entity figures shared by the dashboard, trips, profitability and reports,
 * so every screen shows the same numbers for the same data.
 */
@Injectable({ providedIn: 'root' })
export class FleetAnalytics {
  private readonly directory = inject(EntityDirectory);
  private readonly settings = inject(CompanySettingsService);

  readonly maintenanceCostPerKm = computed(() =>
    maintenanceCostPerKm(this.directory.maintenance(), this.directory.trips(), this.settings.reportingCurrency()),
  );

  /** Profitability for every trip, in the reporting currency. */
  readonly tripProfitability = computed<Map<string, TripProfitability>>(() => {
    const reporting = this.settings.reportingCurrency();
    const inputs = {
      fuel: this.directory.fuel(),
      expenses: this.directory.expenses(),
      maintenanceCostPerKm: this.maintenanceCostPerKm(),
    };
    return new Map(
      this.directory.trips().map((trip) => [trip.id, calculateTripProfitability(trip, inputs, reporting)]),
    );
  });

  /** Fuel consistency checks for every record. */
  readonly fuelAnalysis = computed<Map<string, FuelAnalysis>>(() =>
    analyseFuelRecords(this.directory.fuel(), this.directory.vehicles()),
  );

  profitabilityOf(tripId: string): TripProfitability | undefined {
    return this.tripProfitability().get(tripId);
  }
}
