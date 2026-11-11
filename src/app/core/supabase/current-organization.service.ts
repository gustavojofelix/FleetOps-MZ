import { Injectable, inject, signal } from '@angular/core';
import { UserRole } from '../models';
import { SUPABASE, toError } from './supabase-client';
import { SupabaseAuthService } from './supabase-auth.service';

export interface Membership {
  /** organization_members.id — the AppUser id used across the app. */
  memberId: string;
  organizationId: string;
  role: UserRole;
  fullName: string;
  email: string;
}

/**
 * The organization (tenant) the signed-in user works in. A user normally belongs to one
 * organization; if there are several, the oldest membership is used until an organization
 * switcher exists.
 */
@Injectable({ providedIn: 'root' })
export class CurrentOrganization {
  private readonly client = inject(SUPABASE);
  private readonly auth = inject(SupabaseAuthService);
  private readonly state = signal<Membership | null>(null);
  private loadedFor: string | null = null;

  readonly membership = this.state.asReadonly();

  /** Loads (once per signed-in user) the active membership; null when the user has none yet. */
  async load(): Promise<Membership | null> {
    await this.auth.ready;
    const userId = this.auth.user()?.id ?? null;
    if (!userId) {
      this.state.set(null);
      this.loadedFor = null;
      return null;
    }
    if (this.loadedFor === userId) return this.state();

    // Pending invitations for this (confirmed) e-mail become memberships first.
    const claimed = await this.client.rpc('claim_invitations');
    if (claimed.error) console.error(toError(claimed.error));

    const { data, error } = await this.client
      .from('organization_members')
      .select('id, organization_id, role, full_name, email')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (error) throw toError(error);

    const membership: Membership | null = data
      ? { memberId: data.id, organizationId: data.organization_id, role: data.role as UserRole, fullName: data.full_name, email: data.email }
      : null;
    this.state.set(membership);
    this.loadedFor = userId;
    return membership;
  }

  /** Id of the active organization, for inserts. Throws if the user has no organization. */
  organizationId(): string {
    const membership = this.state();
    if (!membership) throw new Error('No active organization');
    return membership.organizationId;
  }

  /** Onboarding: creates the organization with the signed-in user as owner (one transaction). */
  async create(displayName: string, fullName: string): Promise<Membership> {
    const { error } = await this.client.rpc('create_organization', { p_display_name: displayName, p_full_name: fullName });
    if (error) throw toError(error);
    this.loadedFor = null;
    const membership = await this.load();
    if (!membership) throw new Error('Organization was created but the membership could not be read');
    return membership;
  }
}
