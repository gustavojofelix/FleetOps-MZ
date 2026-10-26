import { ListQuery, PagedResult, SortSpec } from './query.model';

/** Accent- and case-insensitive normalisation for local search. */
export function normalizeSearch(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function matchesSearch(term: string | undefined, fields: readonly (string | number | null | undefined)[]): boolean {
  const needle = normalizeSearch(term);
  if (!needle) return true;
  const haystack = normalizeSearch(fields.filter((field) => field !== null && field !== undefined).join(' '));
  return needle.split(/\s+/).every((token) => haystack.includes(token));
}

export function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1;
  if (b === null || b === undefined || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'pt', { numeric: true, sensitivity: 'base' });
}

export function sortItems<T>(items: T[], sort: SortSpec | null | undefined, valueOf: (item: T, field: string) => unknown): T[] {
  if (!sort) return items;
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const left = valueOf(a, sort.field);
    const right = valueOf(b, sort.field);
    // Empty values always sink to the bottom regardless of direction.
    const emptyLeft = left === null || left === undefined || left === '';
    const emptyRight = right === null || right === undefined || right === '';
    if (emptyLeft !== emptyRight) return emptyLeft ? 1 : -1;
    return compareValues(left, right) * direction;
  });
}

export function paginate<T>(items: T[], query: ListQuery): PagedResult<T> {
  const total = items.length;
  if (!query.pageSize) {
    return { items, total, page: 1, pageSize: total };
  }
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount);
  const start = (page - 1) * query.pageSize;
  return { items: items.slice(start, start + query.pageSize), total, page, pageSize: query.pageSize };
}

/** Reads a (possibly nested, dotted) field for sorting. */
export function readField(item: unknown, field: string): unknown {
  return field.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[key];
    return undefined;
  }, item);
}
