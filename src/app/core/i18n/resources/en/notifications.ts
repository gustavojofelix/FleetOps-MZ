import type { notifications as source } from '../pt-MZ/notifications';
import { TranslationOf } from '../../translation.types';

export const notifications: TranslationOf<typeof source> = {
  title: 'Notifications',
  subtitle: {
    one: 'Operational fleet alerts · {count} unread',
    other: 'Operational fleet alerts · {count} unread',
  },
  subtitleAllRead: 'Operational fleet alerts · all caught up',
  allCategories: 'All',
  categoryFilter: 'Filter by category',
  readFilter: {
    label: 'Filter by read state',
    all: 'All',
    unread: 'Unread',
  },
  markAllRead: 'Mark all as read',
  open: 'Open',
  openRecord: 'Open related record',
  unread: 'Unread',
  groups: {
    today: 'Today',
    yesterday: 'Yesterday',
  },
  groupCount: {
    one: '{count} notification',
    other: '{count} notifications',
  },
  preferencesLink: 'Notification preferences',
  demoNote: 'Notifications are generated from the demo data. Read state is stored in this browser only.',
  empty: {
    allTitle: 'No notifications',
    allDescription: 'Maintenance, document, trip and expense alerts will appear here.',
    unreadTitle: 'You are all caught up',
    unreadDescription: 'There are no unread notifications in this filter.',
    categoryTitle: 'No notifications in this category',
    categoryDescription: 'There are no “{category}” notifications right now.',
    showAll: 'Show all notifications',
  },
  toasts: {
    allRead: 'All notifications marked as read.',
    markedRead: 'Notification marked as read.',
    markedUnread: 'Notification marked as unread.',
  },
  categories: {
    maintenance: 'Maintenance',
    document: 'Documents',
    trip_delay: 'Trip delays',
    fuel_anomaly: 'Fuel',
    expense_approval: 'Expense approvals',
    system: 'System',
  },
  severity: {
    info: 'Information',
    warning: 'Warning',
    critical: 'Critical',
  },
  messages: {
    tripDelayed: {
      title: 'Trip {trip} delayed',
      body: 'The {route} trip is running behind schedule.',
    },
    fuelAnomaly: {
      title: 'Fuel reading to review',
      body: 'Fuel record {record} for vehicle {vehicle} has inconsistent values.',
    },
    expensesPending: {
      title: 'Expenses awaiting approval',
      body: '{count} expenses are awaiting approval.',
    },
    documentExpired: {
      title: 'Document expired',
      body: '{document} has expired and must be renewed.',
    },
    documentExpiring: {
      title: 'Document expiring',
      body: '{document} expires in {days} days.',
    },
    licenceExpiring: {
      title: 'Driving licence expiring',
      body: "{driver}'s driving licence expires in {days} days.",
    },
    maintenanceOverdue: {
      title: 'Maintenance overdue',
      body: 'Work order {workOrder} for vehicle {vehicle} is past its planned date.',
    },
    maintenanceUpcoming: {
      title: 'Maintenance scheduled',
      body: 'Work order {workOrder} for vehicle {vehicle} is scheduled for {date}.',
    },
    maintenanceStarted: {
      title: 'Vehicle in the workshop',
      body: 'Vehicle {vehicle} entered maintenance (work order {workOrder}).',
    },
    userInvited: {
      title: 'Invitation sent',
      body: '{user} was invited to the organization.',
    },
  },
};
