import { TrackedUnit } from '../../../core/domain/fleet-tracking';

/** A tracked unit with the display data the map, the list and the driver popup need. */
export interface UnitView {
  unit: TrackedUnit;
  name: string;
  initials: string;
  plate: string;
  place: string;
  badge: string;
}
