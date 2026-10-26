import { InjectionToken, inject, signal } from '@angular/core';
import { ClockService } from '../services/clock.service';
import { localStore } from '../state/local-storage';
import { matchesSearch, paginate, readField, sortItems } from './query-utils';
import { EntityInput, ListQuery, PagedResult, SortSpec } from './query.model';

/** Simulated network latency for the mock repositories (0 in unit tests). */
export const MOCK_LATENCY_MS = new InjectionToken<number>('MOCK_LATENCY_MS', {
  providedIn: 'root',
  factory: () => 180,
});

export const DEMO_ORGANIZATION_ID = 'org-kuyenda';
export const DEMO_STORAGE_PREFIX = 'fleetops.demo.v1.';

export const delay = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

export interface MockCollectionConfig<T> {
  /** localStorage key suffix for persisted demo changes. */
  storageKey: string;
  idPrefix: string;
  /** Lazily imports the JSON fixture so fixtures stay out of the initial bundle. */
  fixtures: () => Promise<T[]>;
  searchFields: (item: T) => readonly (string | number | null | undefined)[];
  defaultSort?: SortSpec;
}

/**
 * In-memory collection backed by JSON fixtures, persisting mutations to localStorage so demo
 * changes survive a reload. Returns clones so callers can never mutate the store directly.
 */
export abstract class MockCollection<T extends { id: string }, Q extends ListQuery = ListQuery> {
  protected readonly clock = inject(ClockService);
  private readonly latency = inject(MOCK_LATENCY_MS);
  private readonly version = signal(0);
  private items: T[] | null = null;
  private loading: Promise<T[]> | null = null;

  readonly changes = this.version.asReadonly();

  protected abstract readonly config: MockCollectionConfig<T>;

  /** Entity-specific filters; search, sorting and paging are handled by the base class. */
  protected abstract matchesFilters(item: T, query: Q): boolean;

  protected sortValue(item: T, field: string): unknown {
    return readField(item, field);
  }

  async list(query: Q = {} as Q): Promise<PagedResult<T>> {
    const items = await this.read();
    const filtered = items.filter(
      (item) => matchesSearch(query.search, this.config.searchFields(item)) && this.matchesFilters(item, query),
    );
    const sorted = sortItems(filtered, query.sort ?? this.config.defaultSort, (item, field) => this.sortValue(item, field));
    return clone(paginate(sorted, query));
  }

  async all(): Promise<T[]> {
    return clone(await this.read());
  }

  async getById(id: string): Promise<T | undefined> {
    const item = (await this.read()).find((entry) => entry.id === id);
    return item ? clone(item) : undefined;
  }

  async create(input: EntityInput<T>): Promise<T> {
    const items = await this.read();
    const now = this.clock.now();
    const record = {
      ...clone(input),
      id: `${this.config.idPrefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      organizationId: DEMO_ORGANIZATION_ID,
      createdAt: now,
      updatedAt: now,
    } as unknown as T;
    this.commit([record, ...items]);
    return clone(record);
  }

  async update(id: string, changes: Partial<EntityInput<T>>): Promise<T> {
    const items = await this.read();
    const index = items.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error(`Record ${id} not found`);
    const updated = { ...items[index], ...clone(changes), updatedAt: this.clock.now() } as T;
    const next = [...items];
    next[index] = updated;
    this.commit(next);
    return clone(updated);
  }

  async delete(id: string): Promise<void> {
    const items = await this.read();
    this.commit(items.filter((entry) => entry.id !== id));
  }

  reset(): void {
    localStore.remove(DEMO_STORAGE_PREFIX + this.config.storageKey);
    this.items = null;
    this.loading = null;
    this.version.update((v) => v + 1);
  }

  /** Loads the collection once (persisted demo state first, then fixtures) and simulates latency. */
  protected async read(): Promise<T[]> {
    await delay(this.latency);
    if (this.items) return this.items;
    this.loading ??= (async () => {
      const persisted = localStore.read<T[]>(DEMO_STORAGE_PREFIX + this.config.storageKey);
      const data = persisted ?? (await this.config.fixtures());
      this.items = data;
      return data;
    })();
    return this.loading;
  }

  protected commit(items: T[]): void {
    this.items = items;
    localStore.write(DEMO_STORAGE_PREFIX + this.config.storageKey, items);
    this.version.update((v) => v + 1);
  }
}

function clone<V>(value: V): V {
  return structuredClone(value);
}
