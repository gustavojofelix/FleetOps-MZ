import { CurrencyCode, Money } from '../../core/models';
import { ChartSeries, DonutSlice } from '../../shared/ui/charts/chart.model';
import { IconName } from '../../shared/ui/icon/icon-registry';
import { RankingItem } from '../profitability/margin-ranking/margin-ranking';

export type ReportId = 'revenue' | 'expenses' | 'profitability' | 'fuel' | 'maintenance' | 'vehicle-costs' | 'customers' | 'routes';

export const REPORT_IDS: readonly ReportId[] = ['revenue', 'expenses', 'profitability', 'fuel', 'maintenance', 'vehicle-costs', 'customers', 'routes'];

/** Translation key segment for a report id (`vehicle-costs` → `vehicleCosts`). */
export const REPORT_KEYS: Readonly<Record<ReportId, string>> = {
  revenue: 'revenue',
  expenses: 'expenses',
  profitability: 'profitability',
  fuel: 'fuel',
  maintenance: 'maintenance',
  'vehicle-costs': 'vehicleCosts',
  customers: 'customers',
  routes: 'routes',
};

export const REPORT_ICONS: Readonly<Record<ReportId, IconName>> = {
  revenue: 'banknote',
  expenses: 'receipt',
  profitability: 'percent',
  fuel: 'fuel',
  maintenance: 'wrench',
  'vehicle-costs': 'truck',
  customers: 'building',
  routes: 'signpost',
};

/**
 * How a value is formatted. Money kinds hold numbers in the REPORTING currency and are shown in
 * the report currency; `original` cells carry a Money in its transaction currency.
 */
export type ValueKind =
  | 'money'
  | 'moneyPrecise'
  | 'number'
  | 'decimal'
  | 'percent'
  | 'margin'
  | 'litres'
  | 'km'
  | 'hours'
  | 'text'
  | 'original'
  | 'rate';

export interface ReportStat {
  label: string;
  value: number | null;
  kind: ValueKind;
  hint?: string;
}

export type ChartType = 'bar' | 'donut' | 'ranking';

export interface ReportChart {
  id: string;
  type: ChartType;
  title: string;
  subtitle?: string;
  kind: ValueKind;
  stacked?: boolean;
  categories: string[];
  series: ChartSeries[];
  slices: DonutSlice[];
  items: RankingItem[];
  centerLabel?: string;
  centerValue?: number;
}

export interface ReportColumn {
  key: string;
  label: string;
  kind: ValueKind;
  muted?: boolean;
}

export interface ReportCell {
  /** Sort / CSV value: reporting-currency amount for money and original cells, text otherwise. */
  value: number | string | null;
  /** Original transaction amount (`original` cells). */
  money?: Money | null;
  /** Rate cells: the conversion pair. */
  rate?: { from: CurrencyCode; to: CurrencyCode } | null;
  link?: string[] | null;
  sub?: string | null;
}

export interface ReportRow {
  id: string;
  cells: Record<string, ReportCell>;
}

export interface ReportTable {
  id: string;
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: Record<string, ReportCell>;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
}

export interface ReportView {
  id: ReportId;
  stats: ReportStat[];
  charts: ReportChart[];
  tables: ReportTable[];
  /** Method notes printed under the report. */
  notes: string[];
  /** True when the underlying records mix currencies (aggregates are converted). */
  mixedCurrencies: boolean;
  empty: boolean;
  /** Optional deep link to the operational screen behind the report. */
  link?: { label: string; path: string; queryParams?: Record<string, string> };
}

export function barChart(chart: Pick<ReportChart, 'id' | 'title' | 'subtitle' | 'kind' | 'stacked' | 'categories' | 'series'>): ReportChart {
  return { type: 'bar', slices: [], items: [], ...chart };
}

export function donutChart(
  chart: Pick<ReportChart, 'id' | 'title' | 'subtitle' | 'kind' | 'slices' | 'centerLabel' | 'centerValue'>,
): ReportChart {
  return { type: 'donut', categories: [], series: [], items: [], ...chart };
}

export function rankingChart(chart: Pick<ReportChart, 'id' | 'title' | 'subtitle' | 'items'>): ReportChart {
  return { type: 'ranking', kind: 'percent', categories: [], series: [], slices: [], ...chart };
}
