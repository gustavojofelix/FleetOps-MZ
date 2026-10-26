import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { createQuery } from '../../../core/data-access/query';
import { NotificationRepository } from '../../../core/data-access/repositories';
import { addDays, dateOfTimestamp } from '../../../core/formatting/date-utils';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { AppNotification, NOTIFICATION_CATEGORIES, NotificationCategory } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { NotificationCenterService } from '../../../core/services/notification-center.service';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icon-registry';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ToastService } from '../../../shared/ui/toast/toast.service';

type ReadFilter = 'all' | 'unread';

interface NotificationGroup {
  date: string;
  label: string;
  items: AppNotification[];
}

const CATEGORY_ICONS: Readonly<Record<NotificationCategory, IconName>> = {
  maintenance: 'wrench',
  document: 'file-text',
  trip_delay: 'clock',
  fuel_anomaly: 'fuel',
  expense_approval: 'receipt',
  system: 'info',
};

/** Notification center: category and read filters, list grouped by day, read state per item. */
@Component({
  selector: 'app-notifications-page',
  imports: [RouterLink, TranslatePipe, ...FORMAT_PIPES, PageHeader, EmptyState, Icon, StatusBadge],
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPage {
  private readonly repository = inject(NotificationRepository);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  private readonly clock = inject(ClockService);
  protected readonly center = inject(NotificationCenterService);

  /** Query params bound by the router (deep links from the dashboard and the top bar). */
  readonly category = input<string | undefined>();
  readonly read = input<string | undefined>();

  protected readonly categories = NOTIFICATION_CATEGORIES;
  protected readonly categoryFilter = linkedSignal<NotificationCategory | null>(() => this.asCategory(this.category()));
  protected readonly readFilter = linkedSignal<ReadFilter>(() => (this.read() === 'unread' ? 'unread' : 'all'));
  /** Ids with a pending read/unread request, to avoid double submissions. */
  protected readonly busy = signal<ReadonlySet<string>>(new Set());
  protected readonly markingAll = signal(false);

  protected readonly query = createQuery(
    () => this.repository.changes(),
    () => this.repository.list({ sort: { field: 'createdAt', direction: 'desc' } }),
  );

  private readonly all = computed(() => this.query.value()?.items ?? []);

  /** Category counts follow the read filter so the chips match what is listed. */
  protected readonly counts = computed(() => {
    const unreadOnly = this.readFilter() === 'unread';
    const byCategory = new Map<NotificationCategory, number>();
    let total = 0;
    for (const item of this.all()) {
      if (unreadOnly && item.read) continue;
      total++;
      byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + 1);
    }
    return { total, byCategory };
  });

  protected readonly unreadCount = computed(() => this.all().filter((n) => !n.read).length);
  protected readonly totalCount = computed(() => this.all().length);

  protected readonly visible = computed(() => {
    const category = this.categoryFilter();
    const unreadOnly = this.readFilter() === 'unread';
    return this.all().filter((n) => (!category || n.category === category) && (!unreadOnly || !n.read));
  });

  protected readonly groups = computed<NotificationGroup[]>(() => {
    const today = this.clock.today();
    const yesterday = addDays(today, -1);
    const groups: NotificationGroup[] = [];
    for (const item of this.visible()) {
      const date = dateOfTimestamp(item.createdAt);
      let group = groups.at(-1);
      if (!group || group.date !== date) {
        const label =
          date === today
            ? this.i18n.t('notifications.groups.today')
            : date === yesterday
              ? this.i18n.t('notifications.groups.yesterday')
              : this.format.date(date, 'long');
        group = { date, label, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  });

  protected readonly hasFilters = computed(() => !!this.categoryFilter() || this.readFilter() === 'unread');

  protected subtitle(): string {
    const unread = this.unreadCount();
    return unread ? this.i18n.t('notifications.subtitle', { count: unread }) : this.i18n.t('notifications.subtitleAllRead');
  }

  protected icon(category: NotificationCategory): IconName {
    return CATEGORY_ICONS[category] ?? 'bell';
  }

  protected isBusy(id: string): boolean {
    return this.busy().has(id);
  }

  protected setCategory(category: NotificationCategory | null): void {
    this.categoryFilter.set(category);
    this.syncUrl();
  }

  protected setReadFilter(filter: ReadFilter): void {
    this.readFilter.set(filter);
    this.syncUrl();
  }

  protected clearFilters(): void {
    this.categoryFilter.set(null);
    this.readFilter.set('all');
    this.syncUrl();
  }

  protected async toggleRead(item: AppNotification): Promise<void> {
    if (this.isBusy(item.id)) return;
    this.busy.update((set) => new Set(set).add(item.id));
    try {
      await this.center.markRead(item.id, !item.read);
      this.toast.success(this.i18n.t(item.read ? 'notifications.toasts.markedUnread' : 'notifications.toasts.markedRead'));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.busy.update((set) => {
        const next = new Set(set);
        next.delete(item.id);
        return next;
      });
    }
  }

  /** Opening the related record marks the notification as read. */
  protected async open(item: AppNotification): Promise<void> {
    if (!item.link) return;
    if (!item.read) {
      try {
        await this.center.markRead(item.id, true);
      } catch {
        // Read state is cosmetic; navigation still proceeds.
      }
    }
    void this.router.navigate(item.link);
  }

  protected async markAllRead(): Promise<void> {
    this.markingAll.set(true);
    try {
      await this.center.markAllRead();
      this.toast.success(this.i18n.t('notifications.toasts.allRead'));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.markingAll.set(false);
    }
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      queryParams: { category: this.categoryFilter(), read: this.readFilter() === 'unread' ? 'unread' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private asCategory(value: string | null | undefined): NotificationCategory | null {
    return NOTIFICATION_CATEGORIES.includes(value as NotificationCategory) ? (value as NotificationCategory) : null;
  }
}
