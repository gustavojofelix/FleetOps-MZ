import { Injectable, computed, inject } from '@angular/core';
import { createQuery } from '../data-access/query';
import { NotificationRepository } from '../data-access/repositories';
import { AppNotification } from '../models';
import { TranslationService } from '../i18n/translation.service';

/** Shared notification state for the top-bar bell and the notifications page. */
@Injectable({ providedIn: 'root' })
export class NotificationCenterService {
  private readonly repository = inject(NotificationRepository);
  private readonly i18n = inject(TranslationService);
  private readonly query = createQuery(
    () => this.repository.changes(),
    () => this.repository.list({ sort: { field: 'createdAt', direction: 'desc' } }),
  );

  readonly notifications = computed<AppNotification[]>(() => this.query.value()?.items ?? []);
  readonly unreadCount = computed(() => this.notifications().filter((n) => !n.read).length);
  readonly loading = this.query.initialLoading;

  title(notification: AppNotification): string {
    return this.i18n.t(notification.titleKey, notification.params);
  }

  message(notification: AppNotification): string {
    return this.i18n.t(notification.messageKey, notification.params);
  }

  markRead(id: string, read = true): Promise<void> {
    return this.repository.markRead(id, read);
  }

  markAllRead(): Promise<void> {
    return this.repository.markAllRead();
  }
}
