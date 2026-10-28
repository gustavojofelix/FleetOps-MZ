import { Driver, Trip, TripStatus } from '../models';

/** [latitude, longitude] in decimal degrees. */
export type LatLng = [number, number];

/**
 * Area the fleet map shows: the Beira corridor from Sofala through Manica and Tete to Zimbabwe,
 * Malawi and Zambia. The map cannot be panned or zoomed out beyond it.
 */
export const MAP_REGION: { southWest: LatLng; northEast: LatLng } = {
  southWest: [-21.4, 27.6],
  northEast: [-12.9, 36.0],
};

/**
 * Approximate coordinates of the towns, border posts and road junctions on the Beira corridor
 * routes inside MAP_REGION. Shape-only points (junctions, bridges) keep the drawn lines close to the
 * real roads. Replace with GPS telematics once the backend provides vehicle positions.
 */
export const PLACES: Readonly<Record<string, LatLng>> = {
  Beira: [-19.8436, 34.8389],
  Dondo: [-19.6094, 34.7431],
  Nhamatanda: [-19.2667, 34.2167],
  Inchope: [-19.2097, 33.9333],
  Chimoio: [-19.1164, 33.4833],
  Vanduzi: [-18.95, 33.27],
  Catandica: [-18.0667, 33.1667],
  Changara: [-16.8333, 33.2667],
  Tete: [-16.1564, 33.5867],
  Moatize: [-16.1167, 33.7333],
  'Zóbuè': [-15.6, 34.42],
  Mwanza: [-15.6, 34.52],
  Blantyre: [-15.7861, 35.0058],
  Machipanda: [-18.99, 32.74],
  Mutare: [-18.9707, 32.6709],
  Rusape: [-18.5333, 32.1167],
  Marondera: [-18.1853, 31.5519],
  Harare: [-17.8292, 31.0522],
  Cassacatiza: [-14.3, 32.33],
  Chipata: [-13.6333, 32.65],
  Petauke: [-14.2426, 31.3253],
  Nyimba: [-14.5566, 30.8149],
  'Luangwa Bridge': [-14.97, 30.22],
  Lusaka: [-15.4167, 28.2833],
};

const BEIRA_INCHOPE = ['Beira', 'Dondo', 'Nhamatanda', 'Inchope'];
const BEIRA_TETE = [...BEIRA_INCHOPE, 'Vanduzi', 'Catandica', 'Changara', 'Tete'];
const BEIRA_MUTARE = [...BEIRA_INCHOPE, 'Chimoio', 'Machipanda', 'Mutare'];

/**
 * Road geometry of the corridors inside MAP_REGION (see routes.json), as an ordered list of places.
 * Southern routes (Maputo, Joanesburgo) are outside the mapped region and are not tracked.
 */
export const ROUTE_PATHS: Readonly<Record<string, readonly string[]>> = {
  'r-bei-don': ['Beira', 'Dondo'],
  'r-bei-chi': [...BEIRA_INCHOPE, 'Chimoio'],
  'r-bei-tet': [...BEIRA_TETE, 'Moatize'],
  'r-bei-mut': BEIRA_MUTARE,
  'r-bei-hre': [...BEIRA_MUTARE, 'Rusape', 'Marondera', 'Harare'],
  'r-bei-bly': [...BEIRA_TETE, 'Moatize', 'Zóbuè', 'Mwanza', 'Blantyre'],
  'r-bei-lun': [...BEIRA_TETE, 'Cassacatiza', 'Chipata', 'Petauke', 'Nyimba', 'Luangwa Bridge', 'Lusaka'],
  'r-tet-bei': ['Moatize', ...[...BEIRA_TETE].reverse()],
  'r-chi-bei': ['Chimoio', ...[...BEIRA_INCHOPE].reverse()],
};

/** Base where available drivers wait when their home town has no known coordinates. */
export const DEFAULT_BASE = 'Beira';

export interface GeoPath {
  points: LatLng[];
  /** Place name of each point, used to locate timeline events on the path. */
  names: string[];
  /** Cumulative length in km at each point (first is 0). */
  cumulativeKm: number[];
  lengthKm: number;
}

/** What the unit is doing at the simulated instant. */
export type TrackingPhase = 'moving' | 'stopped' | 'loading' | 'arrived' | 'idle';

export interface TrackedUnit {
  driverId: string;
  vehicleId: string | null;
  trip: Trip | null;
  phase: TrackingPhase;
  position: LatLng;
  /** 0–1 along the trip path; 0 when there is no trip. */
  progress: number;
  path: GeoPath | null;
  /** Planned trip kilometres still to drive. */
  remainingKm: number;
  /** Average speed while moving, km/h; 0 otherwise. */
  speedKmh: number;
  /** Simulated arrival instant (epoch ms) while the trip is under way. */
  etaMs: number | null;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function buildPath(names: readonly string[]): GeoPath | null {
  const known = names.filter((name) => PLACES[name]);
  if (known.length < 2) return null;
  const points = known.map((name) => PLACES[name]);
  const cumulativeKm = [0];
  for (let i = 1; i < points.length; i++) cumulativeKm.push(cumulativeKm[i - 1] + distanceKm(points[i - 1], points[i]));
  return { points, names: known, cumulativeKm, lengthKm: cumulativeKm[cumulativeKm.length - 1] };
}

/** The corridor geometry for a trip, falling back to a straight origin → destination line. */
export function tripPath(trip: Trip): GeoPath | null {
  const names = (trip.routeId && ROUTE_PATHS[trip.routeId]) || [trip.origin.city, trip.destination.city];
  return buildPath(names);
}

/** Closest known place to a position, with the straight-line distance to it. */
export function nearestPlace(position: LatLng): { name: string; km: number } {
  let best = { name: DEFAULT_BASE, km: Infinity };
  for (const [name, point] of Object.entries(PLACES)) {
    const km = distanceKm(position, point);
    if (km < best.km) best = { name, km };
  }
  return best;
}

/** True when every point of the path lies inside MAP_REGION. */
export function isInMapRegion(path: GeoPath | null): boolean {
  const { southWest, northEast } = MAP_REGION;
  return (
    !!path &&
    path.points.every(([lat, lng]) => lat >= southWest[0] && lat <= northEast[0] && lng >= southWest[1] && lng <= northEast[1])
  );
}

/** Point at `fraction` (0–1) of the path length. */
export function pointAlong(path: GeoPath, fraction: number): LatLng {
  const target = clamp01(fraction) * path.lengthKm;
  for (let i = 1; i < path.points.length; i++) {
    if (target <= path.cumulativeKm[i]) {
      const segment = path.cumulativeKm[i] - path.cumulativeKm[i - 1];
      const t = segment === 0 ? 0 : (target - path.cumulativeKm[i - 1]) / segment;
      const [a, b] = [path.points[i - 1], path.points[i]];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return path.points[path.points.length - 1];
}

/** Splits the path at `fraction` into the driven part and the part still ahead. */
export function splitPath(path: GeoPath, fraction: number): { done: LatLng[]; ahead: LatLng[] } {
  const target = clamp01(fraction) * path.lengthKm;
  const cut = pointAlong(path, fraction);
  const done: LatLng[] = [];
  const ahead: LatLng[] = [cut];
  path.points.forEach((point, i) => (path.cumulativeKm[i] < target ? done : ahead).push(point));
  done.push(cut);
  return { done, ahead };
}

/** Fraction of the path at which the named place lies, or null when it is not on the path. */
export function fractionOfPlace(path: GeoPath, place: string): number | null {
  const index = path.names.lastIndexOf(place);
  return index < 0 || path.lengthKm === 0 ? null : path.cumulativeKm[index] / path.lengthKm;
}

const TRACKED_TRIP_STATUSES: readonly TripStatus[] = ['preparing', 'in_transit', 'delayed'];

/**
 * Simulated position of a trip at instant `nowMs`. Trips move at a constant pace between their
 * (actual or planned) departure and the planned duration; delayed trips stay where the delay
 * was reported; trips in preparation load at the origin until their planned departure.
 */
export function trackTrip(trip: Trip, nowMs: number): TrackedUnit {
  const path = tripPath(trip);
  const plannedStart = Date.parse(trip.plannedDeparture);
  const durationMs = Math.max(Date.parse(trip.plannedArrival) - plannedStart, 1);
  const start = trip.actualDeparture ? Date.parse(trip.actualDeparture) : plannedStart;
  const averageSpeed = trip.plannedDistanceKm / (durationMs / 3_600_000);

  let phase: TrackingPhase;
  let progress: number;
  if (trip.status === 'delayed') {
    const delayEvent = [...trip.timeline].reverse().find((event) => event.type === 'delay');
    const located = path && delayEvent ? fractionOfPlace(path, delayEvent.location) : null;
    phase = 'stopped';
    progress = located ?? clamp01((nowMs - start) / durationMs) * 0.5;
  } else if (nowMs < start) {
    phase = 'loading';
    progress = 0;
  } else {
    progress = clamp01((nowMs - start) / durationMs);
    phase = progress >= 1 ? 'arrived' : 'moving';
  }

  const position = path ? pointAlong(path, progress) : (PLACES[trip.origin.city] ?? PLACES[DEFAULT_BASE]);
  return {
    driverId: trip.driverId,
    vehicleId: trip.vehicleId,
    trip,
    phase,
    position,
    progress,
    path,
    remainingKm: Math.max(0, trip.plannedDistanceKm * (1 - progress)),
    speedKmh: phase === 'moving' ? averageSpeed : 0,
    etaMs: phase === 'moving' || phase === 'loading' ? Math.max(start, nowMs) + durationMs * (1 - progress) : null,
  };
}

/** Trips in preparation, in transit or delayed — the ones a driver is committed to. */
export function activeTrackableTrips(trips: readonly Trip[]): Trip[] {
  return trips.filter((trip) => TRACKED_TRIP_STATUSES.includes(trip.status));
}

/**
 * Every on-duty driver with a simulated position inside MAP_REGION: drivers on an active trip in
 * the region follow it, the others wait in their home town. Drivers on leave or inactive, and
 * drivers on trips outside the region, are not tracked.
 */
export function trackFleet(trips: readonly Trip[], drivers: readonly Driver[], nowMs: number): TrackedUnit[] {
  const active = activeTrackableTrips(trips);
  const units = active.filter((trip) => isInMapRegion(tripPath(trip))).map((trip) => trackTrip(trip, nowMs));
  const busy = new Set(active.map((trip) => trip.driverId));
  const idle = drivers.filter((driver) => !busy.has(driver.id) && (driver.status === 'active' || driver.status === 'on_trip'));

  // Spread drivers waiting in the same town on a small ring so their markers do not overlap.
  const perTown = new Map<string, number>();
  for (const driver of idle) {
    const town = PLACES[driver.city] ? driver.city : DEFAULT_BASE;
    const slot = perTown.get(town) ?? 0;
    perTown.set(town, slot + 1);
    const [lat, lng] = PLACES[town];
    const angle = slot * 2.4;
    const radius = slot === 0 ? 0 : 0.035 + 0.012 * Math.floor(slot / 6);
    units.push({
      driverId: driver.id,
      vehicleId: driver.assignedVehicleId,
      trip: null,
      phase: 'idle',
      position: [lat + Math.sin(angle) * radius, lng + Math.cos(angle) * radius],
      progress: 0,
      path: null,
      remainingKm: 0,
      speedKmh: 0,
      etaMs: null,
    });
  }
  return units;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
