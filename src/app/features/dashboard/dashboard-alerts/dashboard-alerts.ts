import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icon-registry';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AlertSeverity } from '../dashboard-metrics';

/** A translated, ready-to-render operational alert. */
export interface AlertView {
  id: string;
  severity: AlertSeverity;
  icon: IconName;
  title: string;
  description: string;
  link: string | string[];
  queryParams: Record<string, string> | null;
}

const COLLAPSED_COUNT = 6;

/** Card listing operational alerts (most severe first), each linking to the page that resolves it. */
@Component({
  selector: 'app-dashboard-alerts',
  imports: [RouterLink, TranslatePipe, Icon, StatusBadge, EmptyState],
  templateUrl: './dashboard-alerts.html',
  styleUrl: './dashboard-alerts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardAlerts {
  readonly alerts = input.required<readonly AlertView[]>();
  readonly loading = input(false, { transform: booleanAttribute });

  protected readonly expanded = signal(false);
  protected readonly skeletonRows = [0, 1, 2, 3];
  protected readonly hiddenCount = computed(() => Math.max(0, this.alerts().length - COLLAPSED_COUNT));
  protected readonly visible = computed(() => (this.expanded() ? this.alerts() : this.alerts().slice(0, COLLAPSED_COUNT)));
  protected readonly criticalCount = computed(() => this.alerts().filter((alert) => alert.severity === 'critical').length);
}
