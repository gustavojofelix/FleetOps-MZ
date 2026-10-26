import { AuditStamps, EntityType, IsoDate, TenantScoped } from './common.model';

export type DocumentType =
  | 'vehicle_registration'
  | 'insurance'
  | 'inspection'
  | 'road_tax'
  | 'cross_border_permit'
  | 'driver_licence'
  | 'medical_certificate'
  | 'waybill'
  | 'customs_declaration'
  | 'delivery_note'
  | 'contract';
/** Derived from the expiry date, never stored. */
export type DocumentStatus = 'valid' | 'expiring' | 'expired' | 'no_expiry';

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  'vehicle_registration',
  'insurance',
  'inspection',
  'road_tax',
  'cross_border_permit',
  'driver_licence',
  'medical_certificate',
  'waybill',
  'customs_declaration',
  'delivery_note',
  'contract',
];
export const DOCUMENT_STATUSES: readonly DocumentStatus[] = ['valid', 'expiring', 'expired', 'no_expiry'];

export interface FleetDocument extends TenantScoped, AuditStamps {
  reference: string;
  type: DocumentType;
  title: string;
  entityType: EntityType;
  entityId: string;
  issuer: string;
  issueDate: IsoDate;
  expiryDate: IsoDate | null;
  /** Placeholder for a future storage object; nothing is uploaded in this phase. */
  fileName: string | null;
  fileSizeKb: number | null;
  notes: string;
}
