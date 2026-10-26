import type { navigation as source } from '../pt-MZ/navigation';
import { TranslationOf } from '../../translation.types';

export const navigation: TranslationOf<typeof source> = {
  sections: {
    overview: 'Overview',
    fleetOperations: 'Fleet operations',
    fleetCosts: 'Fleet costs',
    administration: 'Administration',
  },
  dashboard: 'Dashboard',
  vehicles: 'Vehicles',
  drivers: 'Drivers',
  trailers: 'Trailers',
  trips: 'Trips',
  dispatch: 'Dispatch board',
  customers: 'Customers',
  fuel: 'Fuel management',
  expenses: 'Expenses',
  maintenance: 'Maintenance',
  profitability: 'Trip profitability',
  reports: 'Financial reports',
  documents: 'Documents',
  notifications: 'Notifications',
  users: 'Users & permissions',
  settings: 'Company settings',
  home: 'Home',
  mainNavigation: 'Main navigation',
  breadcrumb: 'Breadcrumb',
};
