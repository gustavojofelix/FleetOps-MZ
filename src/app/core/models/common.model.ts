/** ISO 8601 calendar date without time, e.g. `2026-10-24`. */
export type IsoDate = string;

/** ISO 8601 timestamp with offset, e.g. `2026-10-24T08:30:00+02:00`. */
export type IsoDateTime = string;

/** Every tenant-owned record carries its organization so the model maps cleanly to multi-tenant tables. */
export interface TenantScoped {
  id: string;
  organizationId: string;
}

export interface AuditStamps {
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type EntityType = 'vehicle' | 'driver' | 'trailer' | 'trip' | 'customer';

export const ENTITY_TYPES: readonly EntityType[] = ['vehicle', 'driver', 'trailer', 'trip', 'customer'];
