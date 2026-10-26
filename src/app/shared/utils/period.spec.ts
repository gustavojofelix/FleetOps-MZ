import { previousPeriod, resolvePeriod } from './period';

describe('period presets', () => {
  const today = '2026-10-24';

  it('resolves relative ranges', () => {
    expect(resolvePeriod('last30Days', today)).toEqual({ preset: 'last30Days', from: '2026-09-25', to: today });
    expect(resolvePeriod('thisMonth', today)).toEqual({ preset: 'thisMonth', from: '2026-10-01', to: today });
    expect(resolvePeriod('lastMonth', today)).toEqual({ preset: 'lastMonth', from: '2026-09-01', to: '2026-09-30' });
    expect(resolvePeriod('last6Months', today).from).toBe('2026-05-01');
    expect(resolvePeriod('yearToDate', today).from).toBe('2026-01-01');
    expect(resolvePeriod('allTime', today)).toEqual({ preset: 'allTime', from: null, to: null });
  });

  it('computes the preceding period of equal length', () => {
    expect(previousPeriod({ preset: 'thisMonth', from: '2026-10-01', to: '2026-10-10' })).toEqual({ from: '2026-09-21', to: '2026-09-30' });
    expect(previousPeriod({ preset: 'allTime', from: null, to: null })).toBeNull();
  });
});
