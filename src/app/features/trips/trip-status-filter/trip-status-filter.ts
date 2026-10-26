import { ChangeDetectionStrategy, Component, computed, model } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TRIP_STATUSES, TripStatus } from '../../../core/models';
import { Dropdown, DropdownTrigger } from '../../../shared/ui/dropdown/dropdown';
import { Icon } from '../../../shared/ui/icon/icon';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { toggleStatus } from '../trip-filters';

/** Multi-select status filter: a menu of checkable statuses (role="menuitemcheckbox"). */
@Component({
  selector: 'app-trip-status-filter',
  imports: [TranslatePipe, Dropdown, DropdownTrigger, Icon, StatusBadge],
  templateUrl: './trip-status-filter.html',
  styleUrl: './trip-status-filter.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripStatusFilter {
  readonly statuses = model.required<TripStatus[]>();

  protected readonly options = TRIP_STATUSES;
  protected readonly single = computed(() => (this.statuses().length === 1 ? this.statuses()[0] : null));

  protected toggle(status: TripStatus): void {
    this.statuses.set(toggleStatus(this.statuses(), status));
  }

  protected clear(): void {
    this.statuses.set([]);
  }
}
