import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { PERMISSIONS, Permission, USER_ROLES, UserRole } from '../../../core/models';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { Icon } from '../../../shared/ui/icon/icon';
import { ROLE_PERMISSIONS, roleHasPermission } from '../role-permissions';

/** Read-only roles × permissions matrix with role descriptions (demo mapping). */
@Component({
  selector: 'app-permissions-matrix',
  imports: [TranslatePipe, Icon],
  templateUrl: './permissions-matrix.html',
  styleUrl: './permissions-matrix.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PermissionsMatrix {
  private readonly directory = inject(EntityDirectory);

  protected readonly roles = USER_ROLES;
  protected readonly permissions = PERMISSIONS;

  /** Members per role, excluding deactivated users. */
  protected readonly memberCounts = computed(() => {
    const counts = new Map<UserRole, number>();
    for (const user of this.directory.users()) {
      if (user.status === 'inactive') continue;
      counts.set(user.role, (counts.get(user.role) ?? 0) + 1);
    }
    return counts;
  });

  protected allowed(role: UserRole, permission: Permission): boolean {
    return roleHasPermission(role, permission);
  }

  protected permissionCount(role: UserRole): number {
    return ROLE_PERMISSIONS[role].length;
  }
}
