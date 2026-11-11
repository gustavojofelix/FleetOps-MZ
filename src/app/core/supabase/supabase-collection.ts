import { inject, signal } from '@angular/core';
import { EntityInput, ListQuery, PagedResult, SortSpec } from '../data-access/query.model';
import { CurrencyCode, Money } from '../models';
import { CurrentOrganization } from './current-organization.service';
import { SUPABASE, isUuid, toError } from './supabase-client';

type Row = Record<string, unknown>;

/** The PostgREST filter builder, kept loose so subclasses can chain any filter. */
export type FilterBuilder = any;

export const toSnake = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
export const toCamel = (key: string): string => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/**
 * Generic Supabase-backed CrudRepository for one tenant table.
 *
 * Mapping conventions (keep tables aligned with them):
 * - columns are the snake_case form of the model fields (`plateNumber` ↔ `plate_number`);
 * - `Money` fields listed in `moneyFields` are stored as `<field>_amount` + `<field>_currency`;
 * - `organization_id` is set from the signed-in user's organization on insert;
 * - `id`, `organization_id`, `created_at`, `updated_at` are never written by the client.
 * Tenant isolation and write permissions are enforced by RLS, not here.
 */
export abstract class SupabaseCollection<T extends { id: string }, Q extends ListQuery = ListQuery> {
  protected readonly client = inject(SUPABASE);
  protected readonly organization = inject(CurrentOrganization);
  private readonly version = signal(0);

  readonly changes = this.version.asReadonly();

  protected abstract readonly table: string;
  /** PostgREST select, e.g. `'*, vehicle_status_changes(*)'`. */
  protected readonly select: string = '*';
  /** Columns matched (ilike) by the free-text search. */
  protected abstract readonly searchColumns: readonly string[];
  protected abstract readonly defaultSort: SortSpec;
  /** Frontend sort fields that are not a plain snake_case column (e.g. `name` → `last_name`). */
  protected readonly sortAliases: Record<string, string> = {};
  protected readonly moneyFields: readonly string[] = [];
  /** Model fields that are not columns of this table (embedded relations, derived values). */
  protected readonly readOnlyFields: readonly string[] = [];
  /** Write '' as null (optional date/number columns whose forms send ''). */
  protected readonly emptyAsNull: readonly string[] = [];
  /** Read null as '' (nullable columns whose model type is a non-null string). */
  protected readonly nullAsEmpty: readonly string[] = [];
  /** Embedded relations to order, e.g. `[{ table: 'trip_events', column: 'timestamp' }]`. */
  protected readonly embeddedOrder: readonly { table: string; column: string }[] = [];

  /** Entity-specific filters (status, type, …). */
  protected abstract applyFilters(request: FilterBuilder, query: Q): FilterBuilder;

  async list(query: Q = {} as Q): Promise<PagedResult<T>> {
    let request = this.client.from(this.table).select(this.select, { count: 'exact' });
    request = this.applyFilters(request, query);

    const term = sanitizeSearch(query.search);
    if (term && this.searchColumns.length) {
      request = request.or(this.searchColumns.map((column) => `${column}.ilike.%${term}%`).join(','));
    }

    const sort = query.sort ?? this.defaultSort;
    request = this.order(request.order(this.sortColumn(sort.field), { ascending: sort.direction === 'asc' }).order('id'));

    const page = Math.max(1, query.page ?? 1);
    if (query.pageSize) {
      const from = (page - 1) * query.pageSize;
      request = request.range(from, from + query.pageSize - 1);
    }

    const { data, error, count } = await request;
    if (error) throw toError(error);
    const items = (data as unknown as Row[]).map((row) => this.fromRow(row));
    const total = count ?? items.length;
    return { items, total, page: query.pageSize ? page : 1, pageSize: query.pageSize ?? total };
  }

  async all(): Promise<T[]> {
    const sort = this.defaultSort;
    const request = this.client
      .from(this.table)
      .select(this.select)
      .order(this.sortColumn(sort.field), { ascending: sort.direction === 'asc' });
    const { data, error } = await this.order(request);
    if (error) throw toError(error);
    return (data as unknown as Row[]).map((row) => this.fromRow(row));
  }

  async getById(id: string): Promise<T | undefined> {
    if (!isUuid(id)) return undefined;
    const { data, error } = await this.order(this.client.from(this.table).select(this.select).eq('id', id)).maybeSingle();
    if (error) throw toError(error);
    return data ? this.fromRow(data as unknown as Row) : undefined;
  }

  async create(input: EntityInput<T>): Promise<T> {
    const row = { ...this.toRow(input as Partial<EntityInput<T>>), organization_id: this.organization.organizationId() };
    const { data, error } = await this.client.from(this.table).insert(row).select(this.select).single();
    if (error) throw toError(error);
    this.bump();
    return this.fromRow(data as unknown as Row);
  }

  async update(id: string, changes: Partial<EntityInput<T>>): Promise<T> {
    const { data, error } = await this.client.from(this.table).update(this.toRow(changes)).eq('id', id).select(this.select).single();
    if (error) throw toError(error);
    this.bump();
    return this.fromRow(data as unknown as Row);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.client.from(this.table).delete().eq('id', id);
    if (error) throw toError(error);
    this.bump();
  }

  /** Demo-only operation in the contract: real data is never reset from the browser. */
  reset(): void {}

  /** Call after any mutation (including RPCs) so reactive queries refetch. */
  protected bump(): void {
    this.version.update((v) => v + 1);
  }

  protected fromRow(row: Row): T {
    const item: Row = {};
    for (const [column, value] of Object.entries(row)) item[toCamel(column)] = value;
    for (const field of this.moneyFields) {
      item[field] = { amount: Number(item[`${field}Amount`] ?? 0), currency: item[`${field}Currency`] as CurrencyCode } satisfies Money;
      delete item[`${field}Amount`];
      delete item[`${field}Currency`];
    }
    for (const field of this.nullAsEmpty) if (item[field] === null) item[field] = '';
    return item as unknown as T;
  }

  protected toRow(input: Partial<EntityInput<T>>): Row {
    const row: Row = {};
    const skip = new Set(['id', 'organizationId', 'createdAt', 'updatedAt', ...this.readOnlyFields]);
    for (const [field, value] of Object.entries(input as Row)) {
      if (skip.has(field) || value === undefined) continue;
      if (this.moneyFields.includes(field)) {
        const money = value as Money | null;
        row[`${toSnake(field)}_amount`] = money?.amount ?? 0;
        row[`${toSnake(field)}_currency`] = money?.currency ?? 'MZN';
        continue;
      }
      row[toSnake(field)] = this.emptyAsNull.includes(field) && value === '' ? null : value;
    }
    return row;
  }

  private sortColumn(field: string): string {
    return this.sortAliases[field] ?? toSnake(field);
  }

  private order(request: FilterBuilder): FilterBuilder {
    for (const embedded of this.embeddedOrder) request = request.order(embedded.column, { referencedTable: embedded.table });
    return request;
  }
}

/** Adds `.eq(column, value)` only when a filter value is set. */
export function eqIf(request: FilterBuilder, column: string, value: unknown): FilterBuilder {
  return value === null || value === undefined || value === '' ? request : request.eq(column, value);
}

/** Characters with meaning in PostgREST `or=(…)` / ilike filters are dropped from user search. */
export function sanitizeSearch(search: string | undefined): string {
  return (search ?? '').replace(/[,()*%\\"]/g, ' ').trim();
}
