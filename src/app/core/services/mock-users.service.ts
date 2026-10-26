import { Injectable } from '@angular/core';
import { MockCollection, MockCollectionConfig } from '../data-access/mock-collection';
import { UserQuery, UserRepository } from '../data-access/repositories';
import { AppUser } from '../models';

/** Demo signed-in user (owner). Replace with the authenticated identity from Supabase Auth. */
export const DEMO_CURRENT_USER_ID = 'u01';

@Injectable()
export class MockUsersService extends MockCollection<AppUser, UserQuery> implements UserRepository {
  protected readonly config: MockCollectionConfig<AppUser> = {
    storageKey: 'users',
    idPrefix: 'u',
    fixtures: () => import('../mock-data/users.json').then((m) => m.default as unknown as AppUser[]),
    searchFields: (u) => [u.fullName, u.email, u.jobTitle],
    defaultSort: { field: 'fullName', direction: 'asc' },
  };

  protected matchesFilters(user: AppUser, query: UserQuery): boolean {
    if (query.role && user.role !== query.role) return false;
    if (query.status && user.status !== query.status) return false;
    return true;
  }

  currentUserId(): string {
    return DEMO_CURRENT_USER_ID;
  }
}
