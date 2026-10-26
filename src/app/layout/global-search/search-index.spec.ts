import customers from '../../core/mock-data/customers.json';
import documents from '../../core/mock-data/documents.json';
import drivers from '../../core/mock-data/drivers.json';
import trailers from '../../core/mock-data/trailers.json';
import trips from '../../core/mock-data/trips.json';
import vehicles from '../../core/mock-data/vehicles.json';
import { Customer, Driver, FleetDocument, Trailer, Trip, Vehicle } from '../../core/models';
import { searchEverything } from './search-index';

const sources = {
  vehicles: vehicles as unknown as Vehicle[],
  drivers: drivers as unknown as Driver[],
  trailers: trailers as unknown as Trailer[],
  trips: trips as unknown as Trip[],
  customers: customers as unknown as Customer[],
  documents: documents as unknown as FleetDocument[],
  customerName: (id: string) => (customers as unknown as Customer[]).find((c) => c.id === id)?.name ?? '',
};

describe('global search', () => {
  it('requires at least two characters', () => {
    expect(searchEverything('a', sources)).toEqual([]);
  });

  it('finds a vehicle by plate without dashes', () => {
    const plate = sources.vehicles[0].plateNumber;
    const groups = searchEverything(plate.replace(/-/g, ''), sources);
    expect(groups.find((g) => g.key === 'vehicles')?.results[0].title).toBe(plate);
  });

  it('finds trips by route, container and customer, linking to the trip', () => {
    const container = sources.trips.find((t) => t.cargo.containerRef)!;
    const byContainer = searchEverything(container.cargo.containerRef!, sources);
    expect(byContainer.find((g) => g.key === 'trips')?.results[0].link).toEqual(['/trips', container.id]);
    expect(searchEverything('beira lusaka', sources).find((g) => g.key === 'trips')?.results.length).toBeGreaterThan(0);
  });

  it('finds drivers ignoring accents', () => {
    const groups = searchEverything('lourenco', sources);
    expect(groups.find((g) => g.key === 'drivers')?.results.length).toBe(1);
  });
});

describe('fixture integrity', () => {
  it('references only existing vehicles, drivers, customers and trailers from trips', () => {
    const ids = (list: { id: string }[]) => new Set(list.map((item) => item.id));
    const vehicleIds = ids(sources.vehicles);
    const driverIds = ids(sources.drivers);
    const customerIds = ids(sources.customers);
    const trailerIds = ids(sources.trailers);
    for (const trip of sources.trips) {
      expect(vehicleIds.has(trip.vehicleId)).toBe(true);
      expect(driverIds.has(trip.driverId)).toBe(true);
      expect(customerIds.has(trip.customerId)).toBe(true);
      if (trip.trailerId) expect(trailerIds.has(trip.trailerId)).toBe(true);
    }
  });
});
