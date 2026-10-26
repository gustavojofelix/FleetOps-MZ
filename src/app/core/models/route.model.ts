import { TripLocation } from './trip.model';

/** A frequently operated corridor, used to prefill trips and to group profitability. */
export interface RouteDefinition {
  id: string;
  origin: TripLocation;
  destination: TripLocation;
  distanceKm: number;
  typicalDurationHours: number;
  crossBorder: boolean;
  borderPost: string | null;
}
