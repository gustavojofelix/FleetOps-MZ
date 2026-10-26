import {
  isTripDeletable,
  isTripEditable,
  parseStatusList,
  quickFilterOf,
  serializeStatusList,
  toggleStatus,
} from './trip-filters';

describe('trip list filters', () => {
  it('parses status lists from query params', () => {
    expect(parseStatusList(undefined)).toEqual([]);
    expect(parseStatusList('')).toEqual([]);
    expect(parseStatusList('delayed, in_transit,bogus,in_transit')).toEqual(['in_transit', 'delayed']);
  });

  it('serializes statuses in canonical order', () => {
    expect(serializeStatusList([])).toBeNull();
    expect(serializeStatusList(['delayed', 'preparing'])).toBe('preparing,delayed');
  });

  it('toggles a status on and off', () => {
    expect(toggleStatus(['delayed'], 'planned')).toEqual(['planned', 'delayed']);
    expect(toggleStatus(['planned', 'delayed'], 'planned')).toEqual(['delayed']);
  });

  it('recognises quick segments only on exact matches', () => {
    expect(quickFilterOf([])).toBe('all');
    expect(quickFilterOf(['delayed', 'in_transit', 'preparing'])).toBe('active');
    expect(quickFilterOf(['completed', 'delivered'])).toBe('finished');
    expect(quickFilterOf(['in_transit'])).toBeNull();
  });

  it('limits editing and deletion by status', () => {
    expect(isTripEditable('planned')).toBe(true);
    expect(isTripEditable('preparing')).toBe(true);
    expect(isTripEditable('in_transit')).toBe(false);
    expect(isTripDeletable('cancelled')).toBe(true);
    expect(isTripDeletable('preparing')).toBe(false);
  });
});
