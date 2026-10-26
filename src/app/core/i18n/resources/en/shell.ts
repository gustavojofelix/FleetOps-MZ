import type { shell as source } from '../pt-MZ/shell';
import { TranslationOf } from '../../translation.types';

export const shell: TranslationOf<typeof source> = {
  skipToContent: 'Skip to content',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  collapseSidebar: 'Collapse sidebar',
  expandSidebar: 'Expand sidebar',
  moreOptions: 'More options',
  theme: {
    label: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    switchToDark: 'Switch to dark theme',
    switchToLight: 'Switch to light theme',
  },
  language: {
    label: 'Language',
  },
  currency: {
    label: 'Display currency',
    hint: 'Totals are calculated in {reporting}. Other currencies use simulated rates.',
    reportingBadge: 'Reporting',
  },
  notifications: {
    label: 'Notifications',
    unread: {
      one: '{count} unread notification',
      other: '{count} unread notifications',
    },
    empty: 'You are all caught up.',
    viewAll: 'View all notifications',
    markAllRead: 'Mark all as read',
  },
  profile: {
    menu: 'Profile menu',
    myPreferences: 'My preferences',
    companySettings: 'Company settings',
    resetDemo: 'Reset demo data',
    signOut: 'Sign out',
    signOutDemo: 'Authentication is not implemented in this demo version yet.',
    demoRole: 'Demo role',
  },
  demoBanner: 'Demo version — all data is fictional and stored only in this browser.',
  resetDemo: {
    title: 'Reset demo data?',
    message: 'All changes made in this browser (trips, expenses, settings…) will be replaced by the original data.',
    confirm: 'Reset data',
    done: 'Demo data restored.',
  },
  notFound: {
    title: 'Page not found',
    description: 'The address you opened does not exist or has moved.',
    action: 'Go to dashboard',
  },
  bootError: 'The application could not start.',
};
