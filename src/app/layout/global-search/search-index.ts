import { matchesSearch, normalizeSearch } from '../../core/data-access/query-utils';
import { Customer, Driver, FleetDocument, Trailer, Trip, Vehicle } from '../../core/models';
import { IconName } from '../../shared/ui/icon/icon-registry';

export type SearchGroupKey = 'vehicles' | 'drivers' | 'trailers' | 'trips' | 'customers' | 'documents';

export interface SearchResult {
  id: string;
  group: SearchGroupKey;
  icon: IconName;
  title: string;
  subtitle: string;
  link: string[];
  queryParams?: Record<string, string>;
}

export interface SearchGroup {
  key: SearchGroupKey;
  results: SearchResult[];
}

export interface SearchSources {
  vehicles: readonly Vehicle[];
  drivers: readonly Driver[];
  trailers: readonly Trailer[];
  trips: readonly Trip[];
  customers: readonly Customer[];
  documents: readonly FleetDocument[];
  customerName: (id: string) => string;
}

const MAX_PER_GROUP = 5;

/** Local, accent-insensitive search across the main entities. Pure for testability. */
export function searchEverything(term: string, sources: SearchSources): SearchGroup[] {
  if (normalizeSearch(term).length < 2) return [];
  const take = <T>(items: readonly T[], fields: (item: T) => (string | null | undefined)[], map: (item: T) => SearchResult) =>
    items.filter((item) => matchesSearch(term, fields(item))).slice(0, MAX_PER_GROUP).map(map);

  const groups: SearchGroup[] = [
    {
      key: 'vehicles',
      results: take(
        sources.vehicles,
        (v) => [v.plateNumber, v.plateNumber.replace(/-/g, ''), v.fleetNumber, v.make, v.model],
        (v) => ({ id: v.id, group: 'vehicles', icon: 'truck', title: v.plateNumber, subtitle: `${v.fleetNumber} · ${v.make} ${v.model}`, link: ['/vehicles', v.id] }),
      ),
    },
    {
      key: 'drivers',
      results: take(
        sources.drivers,
        (d) => [`${d.firstName} ${d.lastName}`, d.employeeNumber, d.phone, d.licenceNumber],
        (d) => ({ id: d.id, group: 'drivers', icon: 'id-card', title: `${d.firstName} ${d.lastName}`, subtitle: `${d.employeeNumber} · ${d.phone}`, link: ['/drivers', d.id] }),
      ),
    },
    {
      key: 'trips',
      results: take(
        sources.trips,
        (t) => [t.reference, t.customerReference, `${t.origin.city} ${t.destination.city}`, t.cargo.containerRef, sources.customerName(t.customerId)],
        (t) => ({
          id: t.id,
          group: 'trips',
          icon: 'route',
          title: t.reference,
          subtitle: `${t.origin.city} → ${t.destination.city} · ${sources.customerName(t.customerId)}${t.cargo.containerRef ? ` · ${t.cargo.containerRef}` : ''}`,
          link: ['/trips', t.id],
        }),
      ),
    },
    {
      key: 'customers',
      results: take(
        sources.customers,
        (c) => [c.name, c.legalName, c.code, c.city, c.contactName],
        (c) => ({ id: c.id, group: 'customers', icon: 'building', title: c.name, subtitle: `${c.code} · ${c.city}`, link: ['/customers', c.id] }),
      ),
    },
    {
      key: 'trailers',
      results: take(
        sources.trailers,
        (t) => [t.plateNumber, t.plateNumber.replace(/-/g, ''), t.fleetNumber, t.make],
        (t) => ({ id: t.id, group: 'trailers', icon: 'container', title: t.plateNumber, subtitle: `${t.fleetNumber} · ${t.make}`, link: ['/trailers', t.id] }),
      ),
    },
    {
      key: 'documents',
      results: take(
        sources.documents,
        (d) => [d.reference, d.title, d.fileName],
        (d) => ({ id: d.id, group: 'documents', icon: 'file-text', title: d.title, subtitle: d.reference, link: ['/documents'], queryParams: { q: d.reference } }),
      ),
    },
  ];
  return groups.filter((group) => group.results.length > 0);
}
