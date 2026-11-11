import { Injectable, inject } from '@angular/core';
import { SortSpec } from '../../data-access/query.model';
import { OrganizationRepository, UserQuery, UserRepository } from '../../data-access/repositories';
import { AppUser, Organization } from '../../models';
import { CurrentOrganization } from '../current-organization.service';
import { SUPABASE, toError } from '../supabase-client';
import { FilterBuilder, SupabaseCollection, eqIf, toCamel, toSnake } from '../supabase-collection';

/** Company profile and settings: the `organizations` row of the active tenant. */
@Injectable()
export class SupabaseOrganizationRepository implements OrganizationRepository {
  private readonly client = inject(SUPABASE);
  private readonly organization = inject(CurrentOrganization);

  async get(): Promise<Organization> {
    const membership = await this.organization.load();
    if (!membership) throw new Error('No active organization');
    const { data, error } = await this.client.from('organizations').select('*').eq('id', membership.organizationId).single();
    if (error) throw toError(error);
    return fromRow(data as Record<string, unknown>);
  }

  async update(changes: Partial<Omit<Organization, 'id' | 'createdAt'>>): Promise<Organization> {
    const row = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined).map(([k, v]) => [toSnake(k), v]));
    const { data, error } = await this.client.from('organizations').update(row).eq('id', this.organization.organizationId()).select('*').single();
    if (error) throw toError(error);
    return fromRow(data as Record<string, unknown>);
  }

  reset(): void {}
}

function fromRow(row: Record<string, unknown>): Organization {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v])) as unknown as Organization;
}

/** Organization members (AppUser). Demo members created by the seed have no login (user_id null). */
@Injectable()
export class SupabaseUserRepository extends SupabaseCollection<AppUser, UserQuery> implements UserRepository {
  protected readonly table = 'organization_members';
  protected readonly searchColumns = ['full_name', 'email', 'job_title'];
  protected readonly defaultSort: SortSpec = { field: 'fullName', direction: 'asc' };
  protected override readonly readOnlyFields = ['userId'];

  protected applyFilters(request: FilterBuilder, query: UserQuery): FilterBuilder {
    return eqIf(eqIf(request, 'role', query.role), 'status', query.status);
  }

  /** The signed-in user's membership id (loaded by the organization guard before any page). */
  currentUserId(): string {
    return this.organization.membership()?.memberId ?? '';
  }
}
