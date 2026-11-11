import { Injectable, computed, inject } from '@angular/core';
import { UserRepository } from '../data-access/repositories';
import { roleHasPermission } from '../domain/permissions';
import { Permission, UserRole } from '../models';
import { EntityDirectory } from './entity-directory.service';

/**
 * What the signed-in user may do, from their role in the organization. Used only to hide
 * actions the backend would refuse; the database enforces the same rules (RLS, triggers).
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly users = inject(UserRepository);
  private readonly directory = inject(EntityDirectory);

  /** Null until the members list has loaded: nothing privileged is shown meanwhile. */
  readonly role = computed<UserRole | null>(() => this.directory.user(this.users.currentUserId())?.role ?? null);

  /** True when the user has at least one of the permissions. */
  can(permissions: Permission | readonly Permission[]): boolean {
    const role = this.role();
    if (!role) return false;
    const list: readonly Permission[] = typeof permissions === 'string' ? [permissions] : permissions;
    return list.some((permission) => roleHasPermission(role, permission));
  }
}
