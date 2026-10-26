import { computed, effect, signal, untracked } from '@angular/core';
import { SortSpec } from '../../core/data-access/query.model';
import { IconName } from '../ui/icon/icon-registry';

export interface ListStateOptions {
  pageSize?: number;
  sort?: SortSpec | null;
  debounceMs?: number;
}

/**
 * UI state for a paged, sortable, searchable list. Create it in a field initialiser.
 * Bind the search box to `searchInput` (debounced into `search`); changing search, filters
 * (call `resetPage()`), sort or page size returns to the first page.
 */
export function createListState(options: ListStateOptions = {}) {
  const searchInput = signal('');
  const search = signal('');
  const page = signal(1);
  const pageSize = signal(options.pageSize ?? 10);
  const sort = signal<SortSpec | null>(options.sort ?? null);

  effect((onCleanup) => {
    const value = searchInput();
    const timer = setTimeout(() => {
      untracked(() => {
        if (search() !== value.trim()) {
          search.set(value.trim());
          page.set(1);
        }
      });
    }, options.debounceMs ?? 250);
    onCleanup(() => clearTimeout(timer));
  });

  return {
    searchInput,
    search: search.asReadonly(),
    page,
    pageSize,
    sort: sort.asReadonly(),
    hasSearch: computed(() => search().length > 0),

    setSearch(value: string): void {
      searchInput.set(value);
    },
    clearSearch(): void {
      searchInput.set('');
      search.set('');
      page.set(1);
    },
    setPageSize(size: number): void {
      pageSize.set(size);
      page.set(1);
    },
    resetPage(): void {
      page.set(1);
    },
    toggleSort(field: string): void {
      const current = sort();
      if (current?.field !== field) sort.set({ field, direction: 'asc' });
      else if (current.direction === 'asc') sort.set({ field, direction: 'desc' });
      else sort.set(options.sort ?? null);
      page.set(1);
    },
    isSorted(field: string): boolean {
      return sort()?.field === field;
    },
    sortIcon(field: string): IconName {
      const current = sort();
      if (current?.field !== field) return 'chevrons-up-down';
      return current.direction === 'asc' ? 'arrow-up' : 'arrow-down';
    },
    ariaSort(field: string): 'ascending' | 'descending' | null {
      const current = sort();
      if (current?.field !== field) return null;
      return current.direction === 'asc' ? 'ascending' : 'descending';
    },
  };
}

export type ListState = ReturnType<typeof createListState>;
