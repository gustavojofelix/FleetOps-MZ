import { Injectable } from '@angular/core';
import { MockCollection, MockCollectionConfig } from '../data-access/mock-collection';
import { NotificationQuery, NotificationRepository } from '../data-access/repositories';
import { AppNotification } from '../models';

@Injectable()
export class MockNotificationsService
  extends MockCollection<AppNotification, NotificationQuery>
  implements NotificationRepository
{
  protected readonly config: MockCollectionConfig<AppNotification> = {
    storageKey: 'notifications',
    idPrefix: 'n',
    fixtures: () => import('../mock-data/notifications.json').then((m) => m.default as unknown as AppNotification[]),
    searchFields: (n) => Object.values(n.params).map(String),
    defaultSort: { field: 'createdAt', direction: 'desc' },
  };

  protected matchesFilters(notification: AppNotification, query: NotificationQuery): boolean {
    if (query.category && notification.category !== query.category) return false;
    if (query.unreadOnly && notification.read) return false;
    return true;
  }

  async markRead(id: string, read = true): Promise<void> {
    await this.update(id, { read });
  }

  async markAllRead(): Promise<void> {
    const items = await this.read();
    this.commit(items.map((item) => ({ ...item, read: true })));
  }
}
