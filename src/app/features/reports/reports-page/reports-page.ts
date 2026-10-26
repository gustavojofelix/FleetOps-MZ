import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CURRENCIES, convertMoney, exchangeRate, SIMULATED_RATES_EFFECTIVE_DATE } from '../../../core/formatting/currency';
import { CurrencyService } from '../../../core/formatting/currency.service';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { CurrencyCode } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { BarChart } from '../../../shared/ui/charts/bar-chart/bar-chart';
import { ValueFormatter } from '../../../shared/ui/charts/chart.model';
import { DonutChart } from '../../../shared/ui/charts/donut-chart/donut-chart';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icon-registry';
import { Money } from '../../../shared/ui/money/money';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { PeriodFilter } from '../../../shared/ui/period-filter/period-filter';
import { TableSkeleton } from '../../../shared/ui/table-skeleton/table-skeleton';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { TooltipDirective } from '../../../shared/ui/tooltip/tooltip.directive';
import { downloadCsv } from '../../../shared/utils/csv';
import { PeriodSelection, resolvePeriod } from '../../../shared/utils/period';
import { MarginRanking } from '../../profitability/margin-ranking/margin-ranking';
import { marginTone, marginToneLabel, sortBy } from '../../profitability/profitability-data';
import { REPORT_ICONS, REPORT_IDS, REPORT_KEYS, ReportCell, ReportColumn, ReportId, ReportTable, ValueKind } from '../report.model';
import { ReportsFacade } from '../reports.facade';

interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

type CsvValue = string | number | null;

const MONEY_KINDS: readonly ValueKind[] = ['money', 'moneyPrecise'];
const TEXT_KINDS: readonly ValueKind[] = ['text'];

@Component({
  selector: 'app-reports-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ...FORMAT_PIPES,
    PageHeader,
    PeriodFilter,
    BarChart,
    DonutChart,
    MarginRanking,
    EmptyState,
    Icon,
    Money,
    TableSkeleton,
    TooltipDirective,
  ],
  providers: [ReportsFacade],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPage {
  /** Query param bound by the router: `?report=revenue|expenses|…`. */
  readonly report = input<string | undefined>();

  private readonly facade = inject(ReportsFacade);
  private readonly currency = inject(CurrencyService);
  private readonly format = inject(FormatService);
  private readonly i18n = inject(TranslationService);
  private readonly clock = inject(ClockService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);

  protected readonly reports = REPORT_IDS;
  protected readonly reportKeys = REPORT_KEYS;
  protected readonly icons = REPORT_ICONS;
  protected readonly currencies = this.currency.activeCurrencies;
  protected readonly loading = this.facade.loading;
  protected readonly reportingCurrency = this.currency.reporting;
  protected readonly ratesDate = SIMULATED_RATES_EFFECTIVE_DATE;

  protected readonly active = linkedSignal<ReportId>(() => (REPORT_IDS.includes(this.report() as ReportId) ? (this.report() as ReportId) : 'revenue'));
  protected readonly period = signal<PeriodSelection>(resolvePeriod('last6Months', this.clock.today()));
  /** Report currency: the user's display currency unless overridden for this report session. */
  protected readonly reportCurrency = linkedSignal<CurrencyCode>(() => this.currency.display());
  protected readonly sorts = linkedSignal<Record<string, SortState>>(() => {
    this.active();
    return {};
  });

  protected readonly activeKey = computed(() => REPORT_KEYS[this.active()]);

  protected readonly view = computed(() =>
    this.facade.build(this.active(), {
      period: this.period(),
      compactMoney: (value) => this.formatMoney(value, true),
    }),
  );

  protected readonly tables = computed(() => {
    const sorts = this.sorts();
    return this.view().tables.map((table) => {
      const sort = sorts[table.id] ?? table.defaultSort;
      if (!sort) return table;
      const kind = table.columns.find((column) => column.key === sort.key)?.kind;
      return {
        ...table,
        rows: sortBy(table.rows, (row) => (kind === 'text' ? String(row.cells[sort.key]?.value ?? '') : row.cells[sort.key]?.value ?? null), sort.direction),
      };
    });
  });

  protected readonly conversion = computed(() => {
    const from = this.reportingCurrency();
    const to = this.reportCurrency();
    if (from === to) return null;
    return { from, to, rate: this.format.number(exchangeRate(from, to).rate, 6) };
  });

  protected readonly periodText = computed(() => {
    const period = this.period();
    if (!period.from || !period.to) return this.i18n.t('common.periods.allTime');
    return `${this.format.date(period.from, 'medium')} – ${this.format.date(period.to, 'medium')}`;
  });

  protected readonly generatedAt = computed(() => this.format.date(this.clock.now(), 'datetime'));

  // ---- Navigation ---------------------------------------------------------------------

  protected select(report: ReportId): void {
    this.active.set(report);
    void this.router.navigate([], { queryParams: { report }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onNavKeydown(event: KeyboardEvent, index: number): void {
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
    const backward = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
    let next: number | null = null;
    if (forward) next = (index + 1) % REPORT_IDS.length;
    else if (backward) next = (index - 1 + REPORT_IDS.length) % REPORT_IDS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = REPORT_IDS.length - 1;
    if (next === null) return;
    event.preventDefault();
    const report = REPORT_IDS[next];
    this.select(report);
    queueMicrotask(() => this.document.getElementById(`report-tab-${report}`)?.focus());
  }

  protected setPeriod(period: PeriodSelection): void {
    this.period.set(period);
  }

  protected showAllTime(): void {
    this.period.set(resolvePeriod('allTime', this.clock.today()));
  }

  protected setCurrency(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as CurrencyCode;
    if (CURRENCIES[value]) this.reportCurrency.set(value);
  }

  protected print(): void {
    this.document.defaultView?.print();
  }

  // ---- Sorting ------------------------------------------------------------------------

  protected toggleSort(table: ReportTable, column: ReportColumn): void {
    const current = this.sorts()[table.id] ?? table.defaultSort;
    const direction: 'asc' | 'desc' =
      current?.key === column.key ? (current.direction === 'asc' ? 'desc' : 'asc') : TEXT_KINDS.includes(column.kind) ? 'asc' : 'desc';
    this.sorts.set({ ...this.sorts(), [table.id]: { key: column.key, direction } });
  }

  protected sortIcon(table: ReportTable, key: string): IconName {
    const current = this.sorts()[table.id] ?? table.defaultSort;
    if (current?.key !== key) return 'chevrons-up-down';
    return current.direction === 'asc' ? 'arrow-up' : 'arrow-down';
  }

  protected ariaSort(table: ReportTable, key: string): 'ascending' | 'descending' | null {
    const current = this.sorts()[table.id] ?? table.defaultSort;
    if (current?.key !== key) return null;
    return current.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected isSorted(table: ReportTable, key: string): boolean {
    return (this.sorts()[table.id] ?? table.defaultSort)?.key === key;
  }

  // ---- Formatting ---------------------------------------------------------------------

  protected hasRate(table: ReportTable): boolean {
    return table.columns.some((column) => column.kind === 'rate');
  }

  protected isNumeric(kind: ValueKind): boolean {
    return kind !== 'text';
  }

  protected display(cell: ReportCell | undefined, kind: ValueKind): string {
    if (!cell) return '';
    if (kind === 'rate') return cell.rate ? this.rateText(cell.rate.from, cell.rate.to) : '—';
    return this.formatValue(cell.value, kind);
  }

  protected tone(ratio: number | string | null): { cls: string; label: string } {
    const tone = marginTone(typeof ratio === 'number' ? ratio : null);
    return { cls: `badge badge--${tone === 'neutral' ? 'outline' : tone}`, label: `profitability.tones.${marginToneLabel(tone)}` };
  }

  protected formatValue(value: number | string | null | undefined, kind: ValueKind): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'string') return value;
    switch (kind) {
      case 'money':
        return this.formatMoney(value);
      case 'moneyPrecise':
        return this.formatMoney(value, false, true);
      case 'percent':
      case 'margin':
        return this.format.percent(value);
      case 'litres':
        return this.format.volume(value, 0);
      case 'km':
        return this.format.distance(value);
      case 'hours':
        return this.i18n.t('reports.units.hours', { value: this.format.number(value, 1) });
      case 'decimal':
        return this.format.number(value, 1);
      case 'number':
      case 'original':
      case 'rate':
      case 'text':
        return this.format.number(value);
    }
  }

  /** Stable formatter references per kind for the charts. */
  private readonly formatters = new Map<string, ValueFormatter>();

  protected chartFormat(kind: ValueKind): ValueFormatter {
    return this.cachedFormatter(`v-${kind}`, (value) => this.formatValue(value, kind));
  }

  protected axisFormat(kind: ValueKind): ValueFormatter {
    return this.cachedFormatter(`a-${kind}`, (value) =>
      MONEY_KINDS.includes(kind) ? this.formatMoney(value, true) : kind === 'percent' ? this.format.percent(value, 0) : this.format.compact(value),
    );
  }

  protected percentFormat(): ValueFormatter {
    return this.cachedFormatter('pct', (ratio) => this.format.percent(ratio, 0));
  }

  private cachedFormatter(key: string, factory: ValueFormatter): ValueFormatter {
    let formatter = this.formatters.get(key);
    if (!formatter) {
      formatter = factory;
      this.formatters.set(key, formatter);
    }
    return formatter;
  }

  /** Converts an amount in the reporting currency to the report currency (simulated rates). */
  private toReportCurrency(value: number): number {
    return convertMoney({ amount: value, currency: this.reportingCurrency() }, this.reportCurrency()).converted.amount;
  }

  private formatMoney(value: number, compact = false, precise = false): string {
    const target = this.reportCurrency();
    const converted = this.toReportCurrency(value);
    return this.format.amount(converted, target, compact ? { compact: true } : precise ? undefined : { wholeUnits: true });
  }

  private rateText(from: CurrencyCode, to: CurrencyCode): string {
    return `1 ${from} = ${this.format.number(exchangeRate(from, to).rate, 4)} ${to}`;
  }

  // ---- CSV ----------------------------------------------------------------------------

  protected exportCsv(): void {
    const t = (key: string, params?: Record<string, string | number>) => this.i18n.t(key, params);
    const view = this.view();
    const reporting = this.reportingCurrency();
    const target = this.reportCurrency();
    const converted = target !== reporting;
    const title = t(`reports.library.${this.activeKey()}.title`);
    const rows: CsvValue[][] = [
      [t('common.labels.period'), this.period().from ?? '', this.period().to ?? ''],
      [t('common.money.reporting'), reporting],
      ...(converted ? [[t('reports.csv.reportCurrency'), target, t('common.money.rateUsed'), exchangeRate(reporting, target).rate, t('common.money.simulated')]] : []),
      [t('reports.csv.generated'), this.clock.now()],
    ];

    for (const table of this.tables()) {
      const hasRate = this.hasRate(table);
      const headers: CsvValue[] = [];
      for (const column of table.columns) headers.push(...this.csvHeaders(column, reporting, target, hasRate));
      rows.push([], [table.title], headers);
      const toRow = (cells: Record<string, ReportCell>) => {
        const line: CsvValue[] = [];
        for (const column of table.columns) line.push(...this.csvValues(cells[column.key], column, reporting, target, hasRate));
        return line;
      };
      for (const row of table.rows) rows.push(toRow(row.cells));
      if (table.totals) rows.push(toRow(table.totals));
    }

    if (view.notes.length) rows.push([], [t('reports.viewer.notes')], ...view.notes.map((note) => [note]));

    downloadCsv(`${t('reports.csv.fileName')}-${this.active()}-${this.clock.today()}`, [title], rows);
    this.toast.success(t('common.toasts.exported'));
  }

  private csvHeaders(column: ReportColumn, reporting: CurrencyCode, target: CurrencyCode, hasRate: boolean): string[] {
    const t = (key: string) => this.i18n.t(key);
    switch (column.kind) {
      case 'money':
      case 'moneyPrecise':
        return target !== reporting ? [`${column.label} (${reporting})`, `${column.label} (${target}, ${t('common.money.simulated')})`] : [`${column.label} (${reporting})`];
      case 'original':
        return [
          `${column.label} — ${t('common.money.original')}`,
          `${column.label} — ${t('common.labels.currency')}`,
          ...(hasRate ? [] : [`${column.label} (${reporting})`, t('common.money.rateUsed')]),
        ];
      case 'rate':
        return [`${column.label} (${reporting})`];
      case 'percent':
      case 'margin':
        return [`${column.label} (%)`];
      default:
        return [column.label];
    }
  }

  private csvValues(cell: ReportCell | undefined, column: ReportColumn, reporting: CurrencyCode, target: CurrencyCode, hasRate: boolean): CsvValue[] {
    const value = cell?.value ?? null;
    const numeric = typeof value === 'number' ? value : null;
    switch (column.kind) {
      case 'money':
      case 'moneyPrecise':
        return target !== reporting ? [numeric, numeric === null ? null : this.toReportCurrency(numeric)] : [numeric];
      case 'original': {
        const money = cell?.money ?? null;
        const base: CsvValue[] = [money?.amount ?? null, money?.currency ?? null];
        if (hasRate) return base;
        return [...base, numeric, money ? exchangeRate(money.currency, reporting).rate : null];
      }
      case 'rate':
        return [numeric];
      case 'percent':
      case 'margin':
        return [numeric === null ? null : Math.round(numeric * 1000) / 10];
      default:
        return [value];
    }
  }
}
