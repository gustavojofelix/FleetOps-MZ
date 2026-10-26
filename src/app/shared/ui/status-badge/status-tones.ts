export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

export type StatusKind =
  | 'vehicle'
  | 'driver'
  | 'trailer'
  | 'customer'
  | 'trip'
  | 'expense'
  | 'maintenance'
  | 'document'
  | 'user'
  | 'severity';

interface StatusVocabulary {
  /** Translation key prefix; the status value is appended. */
  keyPrefix: string;
  tones: Record<string, Tone>;
}

/** Single source of truth for how each domain status is labelled and coloured. */
export const STATUS_VOCABULARIES: Readonly<Record<StatusKind, StatusVocabulary>> = {
  vehicle: {
    keyPrefix: 'vehicles.status.',
    tones: { available: 'success', in_transit: 'info', maintenance: 'warning', inactive: 'neutral' },
  },
  driver: {
    keyPrefix: 'drivers.status.',
    tones: { active: 'success', on_trip: 'info', on_leave: 'warning', inactive: 'neutral' },
  },
  trailer: {
    keyPrefix: 'trailers.status.',
    tones: { available: 'success', in_use: 'info', maintenance: 'warning', inactive: 'neutral' },
  },
  customer: {
    keyPrefix: 'customers.status.',
    tones: { active: 'success', inactive: 'neutral' },
  },
  trip: {
    keyPrefix: 'trips.status.',
    tones: {
      planned: 'neutral',
      preparing: 'accent',
      in_transit: 'info',
      delayed: 'danger',
      delivered: 'success',
      completed: 'success',
      cancelled: 'neutral',
    },
  },
  expense: {
    keyPrefix: 'expenses.approval.',
    tones: { pending: 'warning', approved: 'success', rejected: 'danger' },
  },
  maintenance: {
    keyPrefix: 'maintenance.status.',
    tones: { scheduled: 'info', overdue: 'danger', in_progress: 'warning', completed: 'success', cancelled: 'neutral' },
  },
  document: {
    keyPrefix: 'documents.status.',
    tones: { valid: 'success', expiring: 'warning', expired: 'danger', no_expiry: 'neutral' },
  },
  user: {
    keyPrefix: 'users.status.',
    tones: { active: 'success', invited: 'info', inactive: 'neutral' },
  },
  severity: {
    keyPrefix: 'notifications.severity.',
    tones: { info: 'info', warning: 'warning', critical: 'danger' },
  },
};

export function statusTone(kind: StatusKind, value: string): Tone {
  return STATUS_VOCABULARIES[kind].tones[value] ?? 'neutral';
}

export function statusLabelKey(kind: StatusKind, value: string): string {
  return STATUS_VOCABULARIES[kind].keyPrefix + value;
}
