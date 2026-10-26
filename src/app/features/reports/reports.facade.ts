import { Injectable, inject } from '@angular/core';
import { COST_BUCKETS, CostBucket, costBucketOf } from '../../core/domain/profitability';
import { maintenanceDisplayStatus } from '../../core/domain/maintenance-rules';
import { CurrencyService } from '../../core/formatting/currency.service';
import { FormatService } from '../../core/formatting/format.service';
import { TranslationParams } from '../../core/i18n/translation.types';
import { TranslationService } from '../../core/i18n/translation.service';
import { CurrencyCode, FINISHED_TRIP_STATUSES, MAINTENANCE_TYPES, Money } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { EntityDirectory } from '../../core/services/entity-directory.service';
import { FleetAnalytics } from '../../core/services/fleet-analytics.service';
import { isWithinRange } from '../../core/formatting/date-utils';
import { RankingItem } from '../profitability/margin-ranking/margin-ranking';
import {
  BUCKET_COLORS,
  MEASURE_COLORS,
  ProfitabilityGroup,
  TripRow,
  chartMonths,
  groupRows,
  monthlyProfitability,
  round2,
  selectTripRows,
  totalsOf,
} from '../profitability/profitability-data';
import {
  CurrencyTotal,
  Period,
  cityCountries,
  customerPerformance,
  expensesByCategory,
  expensesByMonth,
  expensesInPeriod,
  fuelByMarket,
  fuelByVehicle,
  fuelInPeriod,
  maintenanceByType,
  maintenanceByVehicle,
  maintenanceCost,
  maintenanceDate,
  maintenanceInPeriod,
  monthLabels,
  monthlySum,
  periodMonths,
  revenueByMonthAndCurrency,
  routePerformance,
  totalsByCurrency,
  vehicleOperatingCosts,
} from './report-data';
import { ReportCell, ReportId, ReportRow, ReportView, barChart, donutChart, rankingChart } from './report.model';

/** Fixed slot per currency so a currency keeps its colour in every report. */
const CURRENCY_COLORS: Readonly<Record<CurrencyCode, 1 | 2 | 3 | 4 | 5 | 6>> = { MZN: 1, USD: 3, ZAR: 4, ZWL: 5 };

const TOP_N = 10;

export interface ReportContext {
  period: Period;
  /** Formats an amount held in the reporting currency in the report currency (compact). */
  compactMoney: (value: number) => string;
}

/**
 * Builds every financial report from the same read model as the rest of the app
 * (EntityDirectory + FleetAnalytics + domain rules), so totals match the dashboard and the
 * profitability page. Provided by the reports page.
 */
@Injectable()
export class ReportsFacade {
  private readonly directory = inject(EntityDirectory);
  private readonly analytics = inject(FleetAnalytics);
  private readonly currency = inject(CurrencyService);
  private readonly format = inject(FormatService);
  private readonly i18n = inject(TranslationService);
  private readonly clock = inject(ClockService);

  readonly loading = this.directory.loading;

  build(id: ReportId, context: ReportContext): ReportView {
    switch (id) {
      case 'revenue':
        return this.revenue(context);
      case 'expenses':
        return this.expenses(context);
      case 'profitability':
        return this.profitability(context);
      case 'fuel':
        return this.fuel(context);
      case 'maintenance':
        return this.maintenance(context);
      case 'vehicle-costs':
        return this.vehicleCosts(context);
      case 'customers':
        return this.customers(context);
      case 'routes':
        return this.routes(context);
    }
  }

  // ---- Reports -----------------------------------------------------------------------------

  private revenue({ period }: ReportContext): ReportView {
    const t = this.t;
    const rows = this.tripRows(period);
    const totals = totalsOf(rows);
    const months = chartMonths(rows, period.from, period.to);
    const byMonth = revenueByMonthAndCurrency(rows, months);
    const byCurrency = totalsByCurrency(
      rows.map((row) => row.trip.revenue),
      this.reporting,
    );
    const reportingShare = byCurrency.find((entry) => entry.currency === this.reporting)?.reporting ?? 0;
    const customers = groupRows(rows, 'customer').sort((a, b) => b.revenue - a.revenue);

    return {
      id: 'revenue',
      empty: !rows.length,
      mixedCurrencies: byCurrency.length > 1 || byCurrency.some((entry) => entry.currency !== this.reporting),
      link: { label: t('reports.links.trips'), path: '/trips', queryParams: { status: FINISHED_TRIP_STATUSES.join(',') } },
      stats: [
        { label: t('reports.stats.totalRevenue'), value: totals.revenue, kind: 'money' },
        { label: t('reports.stats.trips'), value: totals.trips, kind: 'number' },
        { label: t('reports.stats.avgRevenuePerTrip'), value: totals.trips ? round2(totals.revenue / totals.trips) : null, kind: 'money' },
        { label: t('profitability.metrics.revenuePerKm'), value: totals.revenuePerKm, kind: 'moneyPrecise' },
        {
          label: t('reports.stats.foreignShare'),
          value: totals.revenue ? (totals.revenue - reportingShare) / totals.revenue : null,
          kind: 'percent',
          hint: t('reports.stats.foreignShareHint', { currency: this.reporting }),
        },
      ],
      charts: [
        barChart({
          id: 'revenue-month',
          title: t('reports.charts.revenueByMonth'),
          subtitle: t('reports.charts.byCurrencyConverted'),
          kind: 'money',
          stacked: true,
          categories: this.monthLabels(months),
          series: byCurrency.map((entry) => ({
            key: entry.currency,
            label: entry.currency,
            values: byMonth.get(entry.currency) ?? months.map(() => 0),
            color: CURRENCY_COLORS[entry.currency],
          })),
        }),
        donutChart({
          id: 'revenue-currency',
          title: t('reports.charts.revenueByCurrency'),
          subtitle: t('reports.charts.convertedShare'),
          kind: 'money',
          slices: byCurrency.map((entry) => ({ key: entry.currency, label: entry.currency, value: entry.reporting, color: CURRENCY_COLORS[entry.currency] })),
          centerLabel: t('common.labels.total'),
          centerValue: totals.revenue,
        }),
      ],
      tables: [
        this.currencyTable('revenue-currency', t('reports.tables.byCurrency'), byCurrency, totals.revenue, t('reports.columns.trips')),
        {
          id: 'revenue-customer',
          title: t('reports.tables.byCustomer'),
          defaultSort: { key: 'revenue', direction: 'desc' },
          columns: [
            { key: 'customer', label: t('common.labels.customer'), kind: 'text' },
            { key: 'trips', label: t('reports.columns.trips'), kind: 'number' },
            { key: 'revenue', label: t('profitability.metrics.revenue'), kind: 'money' },
            { key: 'share', label: t('reports.columns.share'), kind: 'percent' },
            { key: 'revenuePerKm', label: t('profitability.metrics.revenuePerKm'), kind: 'moneyPrecise' },
          ],
          rows: customers.map((group) => ({
            id: group.key,
            cells: {
              customer: { value: this.directory.customerName(group.key), link: ['/customers', group.key], sub: this.directory.customer(group.key)?.code },
              trips: { value: group.trips },
              revenue: { value: group.revenue },
              share: { value: totals.revenue ? group.revenue / totals.revenue : null },
              revenuePerKm: { value: group.revenuePerKm },
            },
          })),
        },
      ],
      notes: [t('reports.notes.tripBasis'), t('reports.notes.conversion')],
    };
  }

  private expenses({ period }: ReportContext): ReportView {
    const t = this.t;
    const expenses = expensesInPeriod(this.directory.expenses(), period);
    const months = periodMonths(
      expenses.map((e) => e.date),
      period,
    );
    const monthly = expensesByMonth(expenses, months, this.reporting);
    const categories = expensesByCategory(expenses, this.reporting);
    const byCurrency = totalsByCurrency(
      expenses.map((e) => e.amount),
      this.reporting,
    );
    const approved = round2(categories.reduce((sum, row) => sum + row.approved, 0));
    const pending = round2(categories.reduce((sum, row) => sum + row.pending, 0));
    const total = round2(approved + pending);
    const bucketTotals = new Map<CostBucket, number>();
    for (const row of categories) {
      const bucket = costBucketOf(row.category);
      bucketTotals.set(bucket, round2((bucketTotals.get(bucket) ?? 0) + row.total));
    }
    const pendingCount = expenses.filter((e) => e.approvalStatus === 'pending').length;

    return {
      id: 'expenses',
      empty: !expenses.length,
      mixedCurrencies: byCurrency.length > 1 || byCurrency.some((entry) => entry.currency !== this.reporting),
      link: { label: t('reports.links.expenses'), path: '/expenses', queryParams: { approval: 'pending' } },
      stats: [
        { label: t('reports.stats.totalExpenses'), value: total, kind: 'money' },
        { label: t('reports.stats.approved'), value: approved, kind: 'money' },
        { label: t('reports.stats.pending'), value: pending, kind: 'money', hint: t('reports.stats.pendingHint', { count: pendingCount }) },
        { label: t('reports.stats.records'), value: expenses.length, kind: 'number' },
      ],
      charts: [
        barChart({
          id: 'expenses-month',
          title: t('reports.charts.expensesByMonth'),
          subtitle: t('reports.charts.approvedVsPending'),
          kind: 'money',
          stacked: true,
          categories: this.monthLabels(months),
          series: [
            { key: 'approved', label: t('expenses.approval.approved'), values: monthly.approved, color: MEASURE_COLORS.directCosts },
            { key: 'pending', label: t('expenses.approval.pending'), values: monthly.pending, color: MEASURE_COLORS.pending },
          ],
        }),
        donutChart({
          id: 'expenses-bucket',
          title: t('reports.charts.expensesByBucket'),
          subtitle: t('reports.charts.bucketHint'),
          kind: 'money',
          slices: COST_BUCKETS.filter((bucket) => bucket !== 'fuel').map((bucket) => ({
            key: bucket,
            label: t(`profitability.buckets.${bucket}`),
            value: bucketTotals.get(bucket) ?? 0,
            color: BUCKET_COLORS[bucket],
          })),
          centerLabel: t('common.labels.total'),
          centerValue: total,
        }),
      ],
      tables: [
        {
          id: 'expenses-category',
          title: t('reports.tables.byCategory'),
          defaultSort: { key: 'total', direction: 'desc' },
          columns: [
            { key: 'category', label: t('reports.columns.category'), kind: 'text' },
            { key: 'count', label: t('reports.columns.records'), kind: 'number' },
            { key: 'approved', label: t('expenses.approval.approved'), kind: 'money' },
            { key: 'pending', label: t('expenses.approval.pending'), kind: 'money' },
            { key: 'total', label: t('common.labels.total'), kind: 'money' },
            { key: 'share', label: t('reports.columns.share'), kind: 'percent' },
          ],
          rows: categories.map((row) => ({
            id: row.category,
            cells: {
              category: { value: t(`expenses.categories.${row.category}`), sub: t(`profitability.buckets.${costBucketOf(row.category)}`) },
              count: { value: row.count },
              approved: { value: row.approved },
              pending: { value: row.pending },
              total: { value: row.total },
              share: { value: total ? row.total / total : null },
            },
          })),
          totals: {
            category: { value: t('common.labels.total') },
            count: { value: expenses.length },
            approved: { value: approved },
            pending: { value: pending },
            total: { value: total },
            share: { value: total ? 1 : null },
          },
        },
        this.currencyTable('expenses-currency', t('reports.tables.byCurrency'), byCurrency, total, t('reports.columns.records')),
      ],
      notes: [t('reports.notes.expenseBasis'), t('reports.notes.conversion')],
    };
  }

  private profitability({ period, compactMoney }: ReportContext): ReportView {
    const t = this.t;
    const rows = this.tripRows(period);
    const totals = totalsOf(rows);
    const months = chartMonths(rows, period.from, period.to);
    const monthly = monthlyProfitability(rows, months);
    const labels = this.monthLabels(months);
    const tripsPerMonth = monthlySum(
      rows,
      months,
      (row) => row.trip.plannedDeparture,
      () => 1,
    );

    return {
      id: 'profitability',
      empty: !rows.length,
      mixedCurrencies: rows.some((row) => row.result.usesSimulatedConversion),
      link: { label: t('reports.links.profitability'), path: '/profitability' },
      stats: [
        { label: t('profitability.metrics.revenue'), value: totals.revenue, kind: 'money' },
        { label: t('profitability.metrics.directCosts'), value: totals.totalDirectCosts, kind: 'money' },
        { label: t('profitability.metrics.contributionMargin'), value: totals.contributionMargin, kind: 'money' },
        { label: t('profitability.metrics.grossMargin'), value: totals.marginRatio, kind: 'margin' },
        { label: t('profitability.metrics.costPerKm'), value: totals.costPerKm, kind: 'moneyPrecise' },
        { label: t('reports.stats.trips'), value: totals.trips, kind: 'number' },
      ],
      charts: [
        barChart({
          id: 'profit-month',
          title: t('profitability.charts.revenueVsCosts'),
          subtitle: t('profitability.charts.revenueVsCostsSubtitle'),
          kind: 'money',
          categories: labels,
          series: [
            { key: 'revenue', label: t('profitability.metrics.revenue'), values: monthly.revenue, color: MEASURE_COLORS.revenue },
            { key: 'directCosts', label: t('profitability.metrics.directCosts'), values: monthly.directCosts, color: MEASURE_COLORS.directCosts },
          ],
        }),
        rankingChart({
          id: 'profit-ranking',
          title: t('profitability.ranking.title', { dimension: t('profitability.groupByLower.customer') }),
          subtitle: t('profitability.ranking.subtitle'),
          items: this.rankingItems(groupRows(rows, 'customer'), 'customer', compactMoney),
        }),
      ],
      tables: [
        {
          id: 'profit-buckets',
          title: t('reports.tables.costStructure'),
          columns: [
            { key: 'bucket', label: t('reports.columns.bucket'), kind: 'text' },
            { key: 'amount', label: t('reports.columns.amount'), kind: 'money' },
            { key: 'share', label: t('reports.columns.shareOfCosts'), kind: 'percent' },
            { key: 'perKm', label: t('profitability.metrics.costPerKm'), kind: 'moneyPrecise' },
            { key: 'ofRevenue', label: t('reports.columns.shareOfRevenue'), kind: 'percent' },
          ],
          rows: COST_BUCKETS.map((bucket) => {
            const amount = totals.costs[bucket];
            return {
              id: bucket,
              cells: {
                bucket: { value: t(`profitability.buckets.${bucket}`) },
                amount: { value: amount },
                share: { value: totals.totalDirectCosts ? amount / totals.totalDirectCosts : null },
                perKm: { value: totals.distanceKm ? round2(amount / totals.distanceKm) : null },
                ofRevenue: { value: totals.revenue ? amount / totals.revenue : null },
              },
            };
          }),
          totals: {
            bucket: { value: t('profitability.table.totalDirectCosts') },
            amount: { value: totals.totalDirectCosts },
            share: { value: totals.totalDirectCosts ? 1 : null },
            perKm: { value: totals.costPerKm },
            ofRevenue: { value: totals.revenue ? totals.totalDirectCosts / totals.revenue : null },
          },
        },
        {
          id: 'profit-months',
          title: t('reports.tables.byMonth'),
          defaultSort: { key: 'month', direction: 'asc' },
          columns: [
            { key: 'month', label: t('reports.columns.month'), kind: 'text' },
            { key: 'trips', label: t('reports.columns.trips'), kind: 'number' },
            { key: 'revenue', label: t('profitability.metrics.revenue'), kind: 'money' },
            { key: 'costs', label: t('profitability.metrics.directCosts'), kind: 'money' },
            { key: 'margin', label: t('profitability.metrics.contributionMargin'), kind: 'money' },
            { key: 'marginRatio', label: t('profitability.table.marginPct'), kind: 'margin' },
          ],
          rows: months.map((month, i) => ({
            id: month,
            cells: {
              month: { value: this.format.date(`${month}-01`, 'monthYear') },
              trips: { value: tripsPerMonth[i] },
              revenue: { value: monthly.revenue[i] },
              costs: { value: monthly.directCosts[i] },
              margin: { value: monthly.margin[i] },
              marginRatio: { value: monthly.revenue[i] ? monthly.margin[i] / monthly.revenue[i] : null },
            },
          })),
          totals: {
            month: { value: t('common.labels.total') },
            trips: { value: totals.trips },
            revenue: { value: totals.revenue },
            costs: { value: totals.totalDirectCosts },
            margin: { value: totals.contributionMargin },
            marginRatio: { value: totals.marginRatio },
          },
        },
      ],
      notes: [
        t('profitability.disclaimer'),
        t('reports.notes.maintenanceExcluded', { amount: compactMoney(totals.maintenanceAllocation) }),
        t('reports.notes.tripBasis'),
        t('reports.notes.conversion'),
      ],
    };
  }

  private fuel({ period }: ReportContext): ReportView {
    const t = this.t;
    const records = fuelInPeriod(this.directory.fuel(), period);
    const months = periodMonths(
      records.map((r) => r.timestamp),
      period,
    );
    const vehicles = fuelByVehicle(records, this.reporting);
    const markets = fuelByMarket(records, cityCountries(this.directory.routes(), this.directory.trips()), this.reporting);
    const litres = round2(records.reduce((sum, r) => sum + r.litres, 0));
    const cost = round2(vehicles.reduce((sum, row) => sum + row.cost, 0));
    const toReporting = (money: Money) => this.currency.toReporting(money).converted.amount;

    return {
      id: 'fuel',
      empty: !records.length,
      mixedCurrencies: new Set(records.map((r) => r.totalAmount.currency)).size > 1 || records.some((r) => r.totalAmount.currency !== this.reporting),
      link: { label: t('reports.links.fuel'), path: '/fuel' },
      stats: [
        { label: t('reports.stats.litres'), value: litres, kind: 'litres' },
        { label: t('reports.stats.fuelCost'), value: cost, kind: 'money' },
        { label: t('reports.stats.avgPricePerLitre'), value: litres ? round2(cost / litres) : null, kind: 'moneyPrecise' },
        { label: t('reports.stats.fillUps'), value: records.length, kind: 'number' },
      ],
      charts: [
        barChart({
          id: 'fuel-litres',
          title: t('reports.charts.litresByMonth'),
          kind: 'litres',
          categories: this.monthLabels(months),
          series: [{ key: 'litres', label: t('reports.stats.litres'), values: monthlySum(records, months, (r) => r.timestamp, (r) => r.litres), color: MEASURE_COLORS.fuel }],
        }),
        barChart({
          id: 'fuel-cost',
          title: t('reports.charts.fuelCostByMonth'),
          kind: 'money',
          categories: this.monthLabels(months),
          series: [
            { key: 'cost', label: t('reports.stats.fuelCost'), values: monthlySum(records, months, (r) => r.timestamp, (r) => toReporting(r.totalAmount)), color: MEASURE_COLORS.fuel },
          ],
        }),
      ],
      tables: [
        {
          id: 'fuel-market',
          title: t('reports.tables.fuelByMarket'),
          subtitle: t('reports.tables.fuelByMarketHint'),
          defaultSort: { key: 'litres', direction: 'desc' },
          columns: [
            { key: 'country', label: t('common.labels.country'), kind: 'text' },
            { key: 'records', label: t('reports.columns.records'), kind: 'number' },
            { key: 'litres', label: t('reports.stats.litres'), kind: 'litres' },
            { key: 'original', label: t('reports.columns.originalTotal'), kind: 'original' },
            { key: 'avgOriginal', label: t('reports.columns.avgPriceOriginal'), kind: 'original' },
            { key: 'reporting', label: t('reports.columns.convertedTotal'), kind: 'money' },
            { key: 'avgReporting', label: t('reports.columns.avgPriceConverted'), kind: 'moneyPrecise' },
            { key: 'rate', label: t('common.money.rateUsed'), kind: 'rate' },
          ],
          rows: markets.map((row) => ({
            id: `${row.country}-${row.currency}`,
            cells: {
              country: { value: row.country ? t(`countries.${row.country}`) : t('common.labels.unknown'), sub: row.currency },
              records: { value: row.records },
              litres: { value: row.litres },
              original: { value: row.reporting, money: { amount: row.original, currency: row.currency } },
              avgOriginal: { value: row.avgPriceReporting, money: row.avgPriceOriginal === null ? null : { amount: row.avgPriceOriginal, currency: row.currency } },
              reporting: { value: row.reporting },
              avgReporting: { value: row.avgPriceReporting },
              rate: { value: row.rate, rate: { from: row.currency, to: this.reporting } },
            },
          })),
        },
        {
          id: 'fuel-vehicle',
          title: t('reports.tables.byVehicle'),
          defaultSort: { key: 'cost', direction: 'desc' },
          columns: [
            { key: 'vehicle', label: t('common.labels.vehicle'), kind: 'text' },
            { key: 'records', label: t('reports.columns.records'), kind: 'number' },
            { key: 'litres', label: t('reports.stats.litres'), kind: 'litres' },
            { key: 'cost', label: t('reports.stats.fuelCost'), kind: 'money' },
            { key: 'price', label: t('reports.stats.avgPricePerLitre'), kind: 'moneyPrecise' },
          ],
          rows: vehicles.map((row) => ({
            id: row.vehicleId,
            cells: {
              vehicle: this.vehicleCell(row.vehicleId),
              records: { value: row.records },
              litres: { value: row.litres },
              cost: { value: row.cost },
              price: { value: row.pricePerLitre },
            },
          })),
          totals: {
            vehicle: { value: t('common.labels.total') },
            records: { value: records.length },
            litres: { value: litres },
            cost: { value: cost },
            price: { value: litres ? round2(cost / litres) : null },
          },
        },
      ],
      notes: [t('reports.notes.fuelBasis'), t('reports.notes.conversion')],
    };
  }

  private maintenance({ period }: ReportContext): ReportView {
    const t = this.t;
    const records = maintenanceInPeriod(this.directory.maintenance(), period);
    const months = periodMonths(records.map(maintenanceDate), period);
    const byVehicle = maintenanceByVehicle(records, this.reporting);
    const byType = maintenanceByType(records, this.reporting);
    const cost = round2(byType.reduce((sum, row) => sum + row.cost, 0));
    const downtime = round2(byType.reduce((sum, row) => sum + row.downtimeHours, 0));
    const today = this.clock.today();
    const open = this.directory
      .maintenance()
      .filter((record) => ['scheduled', 'in_progress', 'overdue'].includes(maintenanceDisplayStatus(record, today)) && isWithinRange(record.plannedDate, period.from, period.to));
    const typeCost = new Map(byType.map((row) => [row.key, row.cost]));

    return {
      id: 'maintenance',
      empty: !records.length,
      mixedCurrencies: new Set(records.map((r) => r.currency)).size > 1 || records.some((r) => r.currency !== this.reporting),
      link: { label: t('reports.links.maintenance'), path: '/maintenance' },
      stats: [
        { label: t('reports.stats.maintenanceCost'), value: cost, kind: 'money' },
        { label: t('reports.stats.completedOrders'), value: records.length, kind: 'number' },
        { label: t('reports.stats.avgCostPerOrder'), value: records.length ? round2(cost / records.length) : null, kind: 'money' },
        { label: t('reports.stats.downtime'), value: downtime, kind: 'hours' },
        { label: t('reports.stats.openOrders'), value: open.length, kind: 'number', hint: t('reports.stats.openOrdersHint') },
      ],
      charts: [
        barChart({
          id: 'maintenance-month',
          title: t('reports.charts.maintenanceByMonth'),
          kind: 'money',
          categories: this.monthLabels(months),
          series: [
            {
              key: 'maintenance',
              label: t('reports.stats.maintenanceCost'),
              values: monthlySum(records, months, maintenanceDate, (r) => maintenanceCost(r, this.reporting)),
              color: MEASURE_COLORS.maintenance,
            },
          ],
        }),
        barChart({
          id: 'maintenance-type',
          title: t('reports.charts.maintenanceByType'),
          kind: 'money',
          categories: MAINTENANCE_TYPES.map((type) => t(`maintenance.types.${type}`)),
          series: [
            { key: 'maintenance', label: t('reports.stats.maintenanceCost'), values: MAINTENANCE_TYPES.map((type) => typeCost.get(type) ?? 0), color: MEASURE_COLORS.maintenance },
          ],
        }),
      ],
      tables: [
        {
          id: 'maintenance-vehicle',
          title: t('reports.tables.byVehicle'),
          defaultSort: { key: 'cost', direction: 'desc' },
          columns: [
            { key: 'vehicle', label: t('common.labels.vehicle'), kind: 'text' },
            { key: 'orders', label: t('reports.columns.orders'), kind: 'number' },
            { key: 'cost', label: t('reports.stats.maintenanceCost'), kind: 'money' },
            { key: 'downtime', label: t('reports.stats.downtime'), kind: 'hours' },
            { key: 'share', label: t('reports.columns.share'), kind: 'percent' },
          ],
          rows: byVehicle.map((row) => ({
            id: row.key,
            cells: {
              vehicle: this.vehicleCell(row.key),
              orders: { value: row.orders },
              cost: { value: row.cost },
              downtime: { value: row.downtimeHours },
              share: { value: cost ? row.cost / cost : null },
            },
          })),
          totals: {
            vehicle: { value: t('common.labels.total') },
            orders: { value: records.length },
            cost: { value: cost },
            downtime: { value: downtime },
            share: { value: cost ? 1 : null },
          },
        },
        {
          id: 'maintenance-type',
          title: t('reports.tables.byType'),
          defaultSort: { key: 'cost', direction: 'desc' },
          columns: [
            { key: 'type', label: t('common.labels.type'), kind: 'text' },
            { key: 'orders', label: t('reports.columns.orders'), kind: 'number' },
            { key: 'cost', label: t('reports.stats.maintenanceCost'), kind: 'money' },
            { key: 'downtime', label: t('reports.stats.downtime'), kind: 'hours' },
            { key: 'avg', label: t('reports.stats.avgCostPerOrder'), kind: 'money' },
          ],
          rows: byType.map((row) => ({
            id: row.key,
            cells: {
              type: { value: t(`maintenance.types.${row.key}`) },
              orders: { value: row.orders },
              cost: { value: row.cost },
              downtime: { value: row.downtimeHours },
              avg: { value: row.orders ? round2(row.cost / row.orders) : null },
            },
          })),
        },
      ],
      notes: [t('reports.notes.maintenanceBasis'), t('reports.notes.conversion')],
    };
  }

  private vehicleCosts({ period }: ReportContext): ReportView {
    const t = this.t;
    const trips = this.directory
      .trips()
      .filter((trip) => FINISHED_TRIP_STATUSES.includes(trip.status) && isWithinRange(trip.plannedDeparture, period.from, period.to));
    const rows = vehicleOperatingCosts(
      {
        vehicleIds: this.directory.vehicles().map((v) => v.id),
        fuel: fuelInPeriod(this.directory.fuel(), period),
        expenses: expensesInPeriod(this.directory.expenses(), period),
        maintenance: maintenanceInPeriod(this.directory.maintenance(), period),
        trips,
      },
      this.reporting,
    );
    const sum = (pick: (row: (typeof rows)[number]) => number) => round2(rows.reduce((total, row) => total + pick(row), 0));
    const fuel = sum((r) => r.fuel);
    const expenses = sum((r) => r.expenses);
    const maintenance = sum((r) => r.maintenance);
    const total = round2(fuel + expenses + maintenance);
    const km = sum((r) => r.distanceKm);
    const top = rows.slice(0, TOP_N);
    const perKm = rows.filter((row) => row.costPerKm !== null).sort((a, b) => (b.costPerKm ?? 0) - (a.costPerKm ?? 0)).slice(0, TOP_N);
    const fleetNo = (id: string) => this.directory.vehicle(id)?.fleetNumber ?? this.directory.plate(id);

    return {
      id: 'vehicle-costs',
      empty: !rows.length,
      mixedCurrencies: true,
      link: { label: t('reports.links.vehicles'), path: '/vehicles' },
      stats: [
        { label: t('reports.stats.operatingCost'), value: total, kind: 'money' },
        { label: t('profitability.buckets.fuel'), value: fuel, kind: 'money' },
        { label: t('reports.stats.directExpenses'), value: expenses, kind: 'money' },
        { label: t('reports.stats.maintenanceCost'), value: maintenance, kind: 'money' },
        { label: t('reports.stats.fleetCostPerKm'), value: km ? round2(total / km) : null, kind: 'moneyPrecise', hint: t('reports.stats.fleetCostPerKmHint') },
      ],
      charts: [
        barChart({
          id: 'vehicle-cost-stack',
          title: t('reports.charts.vehicleCosts', { count: top.length }),
          subtitle: t('reports.charts.vehicleCostsHint'),
          kind: 'money',
          stacked: true,
          categories: top.map((row) => fleetNo(row.vehicleId)),
          series: [
            { key: 'fuel', label: t('profitability.buckets.fuel'), values: top.map((r) => r.fuel), color: MEASURE_COLORS.fuel },
            { key: 'expenses', label: t('reports.stats.directExpenses'), values: top.map((r) => r.expenses), color: MEASURE_COLORS.directCosts },
            { key: 'maintenance', label: t('reports.stats.maintenanceCost'), values: top.map((r) => r.maintenance), color: MEASURE_COLORS.maintenance },
          ],
        }),
        barChart({
          id: 'vehicle-cost-km',
          title: t('reports.charts.vehicleCostPerKm', { count: perKm.length }),
          kind: 'moneyPrecise',
          categories: perKm.map((row) => fleetNo(row.vehicleId)),
          series: [{ key: 'costPerKm', label: t('profitability.metrics.costPerKm'), values: perKm.map((r) => r.costPerKm ?? 0), color: MEASURE_COLORS.directCosts }],
        }),
      ],
      tables: [
        {
          id: 'vehicle-costs',
          title: t('reports.tables.byVehicle'),
          defaultSort: { key: 'total', direction: 'desc' },
          columns: [
            { key: 'vehicle', label: t('common.labels.vehicle'), kind: 'text' },
            { key: 'trips', label: t('reports.columns.trips'), kind: 'number' },
            { key: 'km', label: t('reports.columns.distance'), kind: 'km' },
            { key: 'fuel', label: t('profitability.buckets.fuel'), kind: 'money' },
            { key: 'expenses', label: t('reports.stats.directExpenses'), kind: 'money' },
            { key: 'maintenance', label: t('reports.stats.maintenanceCost'), kind: 'money' },
            { key: 'total', label: t('common.labels.total'), kind: 'money' },
            { key: 'costPerKm', label: t('profitability.metrics.costPerKm'), kind: 'moneyPrecise' },
          ],
          rows: rows.map((row) => ({
            id: row.vehicleId,
            cells: {
              vehicle: this.vehicleCell(row.vehicleId),
              trips: { value: row.trips },
              km: { value: row.distanceKm },
              fuel: { value: row.fuel },
              expenses: { value: row.expenses },
              maintenance: { value: row.maintenance },
              total: { value: row.total },
              costPerKm: { value: row.costPerKm },
            },
          })),
          totals: {
            vehicle: { value: t('common.labels.total') },
            trips: { value: trips.length },
            km: { value: km },
            fuel: { value: fuel },
            expenses: { value: expenses },
            maintenance: { value: maintenance },
            total: { value: total },
            costPerKm: { value: km ? round2(total / km) : null },
          },
        },
      ],
      notes: [t('reports.notes.vehicleCostBasis'), t('reports.notes.conversion')],
    };
  }

  private customers({ period, compactMoney }: ReportContext): ReportView {
    const t = this.t;
    const rows = this.tripRows(period);
    const performance = customerPerformance(rows, this.directory.customers(), this.reporting);
    const totals = totalsOf(rows);
    const outstanding = this.currency.sumToReporting(
      this.directory
        .customers()
        .map((c) => c.outstandingBalance)
        .filter((m) => m.amount > 0),
    );

    return {
      id: 'customers',
      empty: !rows.length,
      mixedCurrencies: true,
      link: { label: t('reports.links.customers'), path: '/customers' },
      stats: [
        { label: t('reports.stats.activeCustomers'), value: performance.length, kind: 'number' },
        { label: t('profitability.metrics.revenue'), value: totals.revenue, kind: 'money' },
        { label: t('profitability.metrics.grossMargin'), value: totals.marginRatio, kind: 'margin' },
        { label: t('reports.stats.outstanding'), value: outstanding, kind: 'money', hint: t('reports.stats.outstandingHint') },
      ],
      charts: [
        rankingChart({
          id: 'customer-ranking',
          title: t('profitability.ranking.title', { dimension: t('profitability.groupByLower.customer') }),
          subtitle: t('profitability.ranking.subtitle'),
          items: this.rankingItems(performance, 'customer', compactMoney),
        }),
      ],
      tables: [
        {
          id: 'customers',
          title: t('reports.tables.customerPerformance'),
          defaultSort: { key: 'revenue', direction: 'desc' },
          columns: [
            { key: 'customer', label: t('common.labels.customer'), kind: 'text' },
            { key: 'trips', label: t('reports.columns.trips'), kind: 'number' },
            { key: 'revenue', label: t('profitability.metrics.revenue'), kind: 'money' },
            { key: 'costs', label: t('profitability.metrics.directCosts'), kind: 'money' },
            { key: 'margin', label: t('profitability.metrics.contributionMargin'), kind: 'money' },
            { key: 'marginRatio', label: t('profitability.table.marginPct'), kind: 'margin' },
            { key: 'outstanding', label: t('reports.columns.outstanding'), kind: 'original' },
          ],
          rows: performance.map<ReportRow>((row) => ({
            id: row.key,
            cells: {
              customer: { value: this.directory.customerName(row.key), link: ['/customers', row.key], sub: this.directory.customer(row.key)?.code },
              trips: { value: row.trips },
              revenue: { value: row.revenue },
              costs: { value: row.totalDirectCosts },
              margin: { value: row.contributionMargin },
              marginRatio: { value: row.marginRatio },
              outstanding: { value: row.outstandingReporting, money: row.outstanding },
            },
          })),
        },
      ],
      notes: [t('reports.notes.outstandingDemo'), t('reports.notes.tripBasis'), t('reports.notes.conversion')],
    };
  }

  private routes({ period, compactMoney }: ReportContext): ReportView {
    const t = this.t;
    const rows = this.tripRows(period);
    const routes = routePerformance(rows, this.clock.now());
    const totals = totalsOf(rows);
    const delayed = routes.reduce((sum, route) => sum + (route.onTimeRatio === null ? 0 : Math.round((1 - route.onTimeRatio) * route.trips)), 0);

    return {
      id: 'routes',
      empty: !rows.length,
      mixedCurrencies: rows.some((row) => row.result.usesSimulatedConversion),
      link: { label: t('reports.links.profitabilityRoutes'), path: '/profitability', queryParams: { groupBy: 'route' } },
      stats: [
        { label: t('reports.stats.routes'), value: routes.length, kind: 'number' },
        { label: t('reports.stats.trips'), value: totals.trips, kind: 'number' },
        { label: t('profitability.metrics.grossMargin'), value: totals.marginRatio, kind: 'margin' },
        { label: t('reports.stats.onTime'), value: totals.trips ? (totals.trips - delayed) / totals.trips : null, kind: 'percent', hint: t('reports.stats.onTimeHint') },
      ],
      charts: [
        rankingChart({
          id: 'route-ranking',
          title: t('profitability.ranking.title', { dimension: t('profitability.groupByLower.route') }),
          subtitle: t('profitability.ranking.subtitle'),
          items: this.rankingItems(routes, 'route', compactMoney),
        }),
      ],
      tables: [
        {
          id: 'routes',
          title: t('reports.tables.routePerformance'),
          defaultSort: { key: 'revenue', direction: 'desc' },
          columns: [
            { key: 'route', label: t('common.labels.route'), kind: 'text' },
            { key: 'trips', label: t('reports.columns.trips'), kind: 'number' },
            { key: 'km', label: t('reports.columns.distance'), kind: 'km' },
            { key: 'revenue', label: t('profitability.metrics.revenue'), kind: 'money' },
            { key: 'marginRatio', label: t('profitability.table.marginPct'), kind: 'margin' },
            { key: 'duration', label: t('reports.columns.avgDuration'), kind: 'hours' },
            { key: 'delay', label: t('reports.columns.avgDelay'), kind: 'hours' },
            { key: 'onTime', label: t('reports.columns.onTime'), kind: 'percent' },
          ],
          rows: routes.map((route) => ({
            id: route.key,
            cells: {
              route: { value: route.key },
              trips: { value: route.trips },
              km: { value: route.distanceKm },
              revenue: { value: route.revenue },
              marginRatio: { value: route.marginRatio },
              duration: { value: route.avgDurationHours },
              delay: { value: route.avgDelayHours },
              onTime: { value: route.onTimeRatio },
            },
          })),
        },
      ],
      notes: [t('reports.notes.routeBasis'), t('reports.notes.tripBasis'), t('reports.notes.conversion')],
    };
  }

  // ---- Helpers -----------------------------------------------------------------------------

  private readonly t = (key: string, params?: TranslationParams): string => this.i18n.t(key, params);

  private get reporting(): CurrencyCode {
    return this.currency.reporting();
  }

  /** Finished trips with a planned departure in the period, as on the profitability page. */
  private tripRows(period: Period): TripRow[] {
    return selectTripRows(this.directory.trips(), this.analytics.tripProfitability(), { from: period.from, to: period.to, scope: 'finished' });
  }

  private monthLabels(months: readonly string[]): string[] {
    return monthLabels(months, (date) => this.format.date(date, 'month'));
  }

  private vehicleCell(vehicleId: string): ReportCell {
    const vehicle = this.directory.vehicle(vehicleId);
    return {
      value: this.directory.plate(vehicleId),
      link: ['/vehicles', vehicleId],
      sub: vehicle ? `${vehicle.fleetNumber} · ${vehicle.make} ${vehicle.model}` : null,
    };
  }

  private rankingItems(groups: readonly ProfitabilityGroup[], dimension: 'customer' | 'route', compactMoney: (value: number) => string): RankingItem[] {
    return groups.map((group) => ({
      key: group.key,
      label: dimension === 'customer' ? this.directory.customerName(group.key) : group.key,
      marginRatio: group.marginRatio,
      revenue: group.revenue,
      link: dimension === 'customer' ? ['/customers', group.key] : null,
      sub: this.t('profitability.ranking.sub', { count: group.trips, revenue: compactMoney(group.revenue) }),
    }));
  }

  private currencyTable(id: string, title: string, totals: readonly CurrencyTotal[], grandTotal: number, countLabel: string) {
    const t = this.t;
    return {
      id,
      title,
      subtitle: t('reports.tables.byCurrencyHint'),
      defaultSort: { key: 'reporting', direction: 'desc' as const },
      columns: [
        { key: 'currency', label: t('common.labels.currency'), kind: 'text' as const },
        { key: 'count', label: countLabel, kind: 'number' as const },
        { key: 'original', label: t('reports.columns.originalTotal'), kind: 'original' as const },
        { key: 'rate', label: t('common.money.rateUsed'), kind: 'rate' as const },
        { key: 'reporting', label: t('reports.columns.convertedTotal'), kind: 'money' as const },
        { key: 'share', label: t('reports.columns.share'), kind: 'percent' as const },
      ],
      rows: totals.map<ReportRow>((entry) => ({
        id: entry.currency,
        cells: {
          currency: { value: entry.currency, sub: t(`currencies.${entry.currency}`) },
          count: { value: entry.count },
          original: { value: entry.reporting, money: { amount: entry.original, currency: entry.currency } },
          rate: { value: entry.rate, rate: { from: entry.currency, to: this.reporting } },
          reporting: { value: entry.reporting },
          share: { value: grandTotal ? entry.reporting / grandTotal : null },
        },
      })),
      totals: {
        currency: { value: t('common.labels.total') },
        count: { value: totals.reduce((sum, entry) => sum + entry.count, 0) },
        reporting: { value: round2(totals.reduce((sum, entry) => sum + entry.reporting, 0)) },
        share: { value: grandTotal ? 1 : null },
      },
    };
  }
}
