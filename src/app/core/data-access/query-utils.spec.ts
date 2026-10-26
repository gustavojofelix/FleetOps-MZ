import { matchesSearch, normalizeSearch, paginate, sortItems } from './query-utils';

describe('query utilities', () => {
  it('searches accent- and case-insensitively across fields with every token required', () => {
    expect(normalizeSearch('  Joanesburgo ÁFRICA ')).toBe('joanesburgo africa');
    expect(matchesSearch('zobue', ['Zóbuè / Mwanza'])).toBe(true);
    expect(matchesSearch('beira tete', ['Beira', 'Tete'])).toBe(true);
    expect(matchesSearch('beira lusaka', ['Beira', 'Tete'])).toBe(false);
    expect(matchesSearch('', ['anything'])).toBe(true);
  });

  it('sorts in both directions and keeps empty values last', () => {
    const items = [{ v: 2 }, { v: null }, { v: 10 }, { v: 1 }];
    const asc = sortItems(items, { field: 'v', direction: 'asc' }, (item) => item.v);
    const desc = sortItems(items, { field: 'v', direction: 'desc' }, (item) => item.v);
    expect(asc.map((i) => i.v)).toEqual([1, 2, 10, null]);
    expect(desc.map((i) => i.v)).toEqual([10, 2, 1, null]);
  });

  it('paginates and clamps out-of-range pages', () => {
    const items = Array.from({ length: 23 }, (_, i) => i);
    expect(paginate(items, { page: 3, pageSize: 10 }).items).toEqual([20, 21, 22]);
    expect(paginate(items, { page: 9, pageSize: 10 }).page).toBe(3);
    expect(paginate(items, {}).items.length).toBe(23);
  });
});
