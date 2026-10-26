import { TRIP_STATUSES, TripStatus } from '../../core/models';

/** Quick status segments on the trips list. Each maps to a fixed set of statuses. */
export type TripQuickFilter = 'all' | 'active' | 'planned' | 'finished' | 'cancelled';

export const TRIP_QUICK_FILTERS: readonly TripQuickFilter[] = ['all', 'active', 'planned', 'finished', 'cancelled'];

export const QUICK_FILTER_STATUSES: Readonly<Record<TripQuickFilter, readonly TripStatus[]>> = {
  all: [],
  active: ['preparing', 'in_transit', 'delayed'],
  planned: ['planned'],
  finished: ['delivered', 'completed'],
  cancelled: ['cancelled'],
};

/** Only trips that have not started can be edited (resources are not yet on the road). */
export const EDITABLE_TRIP_STATUSES: readonly TripStatus[] = ['planned', 'preparing'];

/** Trips with operational history (costs, events) must be kept; only these can be deleted. */
export const DELETABLE_TRIP_STATUSES: readonly TripStatus[] = ['planned', 'cancelled'];

export function isTripEditable(status: TripStatus): boolean {
  return EDITABLE_TRIP_STATUSES.includes(status);
}

export function isTripDeletable(status: TripStatus): boolean {
  return DELETABLE_TRIP_STATUSES.includes(status);
}

/** Parses `?status=a,b` into known statuses, de-duplicated and in canonical order. */
export function parseStatusList(value: string | null | undefined): TripStatus[] {
  if (!value) return [];
  const requested = new Set(value.split(',').map((part) => part.trim()));
  return TRIP_STATUSES.filter((status) => requested.has(status));
}

/** Inverse of parseStatusList; `null` removes the query param. */
export function serializeStatusList(statuses: readonly TripStatus[]): string | null {
  const ordered = TRIP_STATUSES.filter((status) => statuses.includes(status));
  return ordered.length ? ordered.join(',') : null;
}

export function toggleStatus(statuses: readonly TripStatus[], status: TripStatus): TripStatus[] {
  const next = statuses.includes(status) ? statuses.filter((s) => s !== status) : [...statuses, status];
  return TRIP_STATUSES.filter((s) => next.includes(s));
}

/** The quick segment matching exactly the selected statuses, or null for a custom selection. */
export function quickFilterOf(statuses: readonly TripStatus[]): TripQuickFilter | null {
  const selected = new Set(statuses);
  for (const filter of TRIP_QUICK_FILTERS) {
    const group = QUICK_FILTER_STATUSES[filter];
    if (group.length === selected.size && group.every((status) => selected.has(status))) return filter;
  }
  return null;
}
