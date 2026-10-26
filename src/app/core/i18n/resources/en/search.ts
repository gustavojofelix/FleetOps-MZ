import type { search as source } from '../pt-MZ/search';
import { TranslationOf } from '../../translation.types';

export const search: TranslationOf<typeof source> = {
  placeholder: 'Search plate, driver, trip, container…',
  shortPlaceholder: 'Search…',
  label: 'Global search',
  shortcut: 'Ctrl K',
  hint: 'Search by registration, driver name, trip reference, customer, route, container or document.',
  noResults: 'No results for “{term}”.',
  minChars: 'Type at least 2 characters.',
  resultsCount: {
    one: '{count} result',
    other: '{count} results',
  },
  navigateHint: '↑↓ to navigate · Enter to open · Esc to close',
  groups: {
    vehicles: 'Vehicles',
    drivers: 'Drivers',
    trailers: 'Trailers',
    trips: 'Trips',
    customers: 'Customers',
    documents: 'Documents',
  },
};
