import { IconName } from '../shared/ui/icon/icon-registry';

export interface NavItem {
  labelKey: string;
  icon: IconName;
  path: string;
}

export interface NavSection {
  labelKey: string;
  items: NavItem[];
}

export const NAVIGATION: readonly NavSection[] = [
  {
    labelKey: 'navigation.sections.overview',
    items: [{ labelKey: 'navigation.dashboard', icon: 'dashboard', path: '/dashboard' }],
  },
  {
    labelKey: 'navigation.sections.fleetOperations',
    items: [
      { labelKey: 'navigation.vehicles', icon: 'truck', path: '/vehicles' },
      { labelKey: 'navigation.drivers', icon: 'id-card', path: '/drivers' },
      { labelKey: 'navigation.trailers', icon: 'container', path: '/trailers' },
      { labelKey: 'navigation.trips', icon: 'route', path: '/trips' },
      { labelKey: 'navigation.dispatch', icon: 'kanban', path: '/dispatch' },
      { labelKey: 'navigation.customers', icon: 'building', path: '/customers' },
    ],
  },
  {
    labelKey: 'navigation.sections.fleetCosts',
    items: [
      { labelKey: 'navigation.fuel', icon: 'fuel', path: '/fuel' },
      { labelKey: 'navigation.expenses', icon: 'receipt', path: '/expenses' },
      { labelKey: 'navigation.maintenance', icon: 'wrench', path: '/maintenance' },
      { labelKey: 'navigation.profitability', icon: 'trending-up', path: '/profitability' },
      { labelKey: 'navigation.reports', icon: 'chart-column', path: '/reports' },
    ],
  },
  {
    labelKey: 'navigation.sections.administration',
    items: [
      { labelKey: 'navigation.documents', icon: 'file-text', path: '/documents' },
      { labelKey: 'navigation.notifications', icon: 'bell', path: '/notifications' },
      { labelKey: 'navigation.users', icon: 'users', path: '/users' },
      { labelKey: 'navigation.settings', icon: 'settings', path: '/settings' },
    ],
  },
];
