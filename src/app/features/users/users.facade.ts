import { Injectable, inject } from '@angular/core';
import { UserRepository } from '../../core/data-access/repositories';
import { AppUser, UserRole } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';

export interface InviteInput {
  fullName: string;
  email: string;
  jobTitle: string;
  role: UserRole;
}

/**
 * Organization membership workflows (demo). Rules here mirror what the backend will enforce;
 * nothing in this facade grants or restricts real access.
 */
@Injectable({ providedIn: 'root' })
export class UsersFacade {
  private readonly users = inject(UserRepository);
  private readonly clock = inject(ClockService);

  isCurrentUser(user: AppUser): boolean {
    return user.id === this.users.currentUserId();
  }

  /** The owner cannot be demoted or deactivated. */
  isProtected(user: AppUser): boolean {
    return user.role === 'owner';
  }

  invite(input: InviteInput): Promise<AppUser> {
    return this.users.create({
      fullName: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: '',
      jobTitle: input.jobTitle.trim(),
      role: input.role,
      status: 'invited',
      lastActiveAt: null,
      invitedAt: this.clock.now(),
    });
  }

  /** Demo: no email is sent; only the invitation date is refreshed. */
  resendInvite(user: AppUser): Promise<AppUser> {
    return this.users.update(user.id, { invitedAt: this.clock.now() });
  }

  changeRole(user: AppUser, role: UserRole): Promise<AppUser> {
    this.assertNotProtected(user);
    if (role === 'owner') throw new Error('Ownership cannot be assigned from the UI.');
    return this.users.update(user.id, { role });
  }

  deactivate(user: AppUser): Promise<AppUser> {
    this.assertNotProtected(user);
    if (this.isCurrentUser(user)) throw new Error('The signed-in user cannot deactivate themselves.');
    return this.users.update(user.id, { status: 'inactive' });
  }

  reactivate(user: AppUser): Promise<AppUser> {
    return this.users.update(user.id, { status: 'active' });
  }

  deleteInvite(user: AppUser): Promise<void> {
    if (user.status !== 'invited') throw new Error('Only pending invitations can be deleted.');
    return this.users.delete(user.id);
  }

  private assertNotProtected(user: AppUser): void {
    if (this.isProtected(user)) throw new Error('The owner cannot be demoted or deactivated.');
  }
}
