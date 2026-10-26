import { IsoDate, MaintenanceDisplayStatus, MaintenanceRecord } from '../models';

/** Scheduled work whose planned date has passed is shown as overdue. */
export function maintenanceDisplayStatus(record: Pick<MaintenanceRecord, 'status' | 'plannedDate'>, today: IsoDate): MaintenanceDisplayStatus {
  if (record.status === 'scheduled' && record.plannedDate < today) return 'overdue';
  return record.status;
}

export function maintenanceTotalCost(record: Pick<MaintenanceRecord, 'partsCost' | 'labourCost'>): number {
  return (record.partsCost || 0) + (record.labourCost || 0);
}
