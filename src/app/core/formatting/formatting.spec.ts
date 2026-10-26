import { convertMoney, exchangeRate, sumInCurrency } from './currency';
import { addDays, daysBetween, monthsInRange } from './date-utils';
import { formatDate, formatDistance, formatMoney, formatPercent, formatVolume } from './formatters';

// Intl output uses narrow / non-breaking spaces depending on the runtime; normalise for comparison.
const clean = (value: string) => value.replace(/[  ]/g, ' ');

describe('currency formatting', () => {
  it('formats MZN in pt-MZ with the metical symbol and locale separators', () => {
    expect(clean(formatMoney(1234567.5, 'MZN', 'pt-MZ'))).toBe('1 234 567,50 MTn');
  });

  it('formats USD in English', () => {
    expect(formatMoney(1234.5, 'USD', 'en')).toBe('$1,234.50');
  });

  it('supports whole units and compact notation', () => {
    expect(formatMoney(1234.56, 'USD', 'en', { wholeUnits: true })).toBe('$1,235');
    expect(formatMoney(1_250_000, 'USD', 'en', { compact: true })).toBe('$1.3M');
  });

  it('formats percentages, distances and volumes', () => {
    expect(clean(formatPercent(0.256, 'pt-MZ'))).toBe('25,6%');
    expect(clean(formatDistance(1190, 'pt-MZ'))).toBe('1190 km');
    expect(clean(formatDistance(1609.344, 'en', 'mi'))).toBe('1,000 mi');
    expect(formatVolume(100, 'en')).toBe('100 L');
  });
});

describe('date formatting', () => {
  it('never shifts calendar dates across time zones', () => {
    expect(formatDate('2026-10-24', 'pt-MZ', 'short', 'dd/MM/yyyy')).toBe('24/10/2026');
    expect(formatDate('2026-10-24', 'en', 'short', 'yyyy-MM-dd')).toBe('2026-10-24');
    expect(formatDate('2026-10-24', 'en', 'short', 'MM/dd/yyyy')).toBe('10/24/2026');
  });

  it('renders timestamps in the company time zone', () => {
    expect(formatDate('2026-10-24T22:30:00Z', 'pt-MZ', 'datetime', 'dd/MM/yyyy', 'Africa/Maputo')).toBe('25/10/2026 00:30');
  });

  it('returns a dash for missing values', () => {
    expect(formatDate(null, 'en')).toBe('—');
  });

  it('does calendar arithmetic', () => {
    expect(addDays('2026-10-24', 10)).toBe('2026-11-03');
    expect(daysBetween('2026-10-24', '2026-11-03')).toBe(10);
    expect(monthsInRange('2026-11-15', '2027-02-01')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});

describe('simulated currency conversion', () => {
  it('converts without altering the original amount', () => {
    const original = { amount: 100, currency: 'USD' as const };
    const result = convertMoney(original, 'MZN');
    expect(result.converted).toEqual({ amount: 6390, currency: 'MZN' });
    expect(result.original).toEqual({ amount: 100, currency: 'USD' });
    expect(original).toEqual({ amount: 100, currency: 'USD' });
    expect(result.simulated).toBe(true);
  });

  it('marks same-currency conversion as not simulated', () => {
    expect(convertMoney({ amount: 5, currency: 'MZN' }, 'MZN').simulated).toBe(false);
    expect(exchangeRate('MZN', 'MZN').rate).toBe(1);
  });

  it('sums mixed currencies into a target currency', () => {
    expect(sumInCurrency([{ amount: 1, currency: 'USD' }, { amount: 10, currency: 'ZAR' }, { amount: 100, currency: 'MZN' }], 'MZN')).toBe(199.4);
  });
});
