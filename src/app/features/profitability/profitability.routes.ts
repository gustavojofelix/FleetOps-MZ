import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./profitability-page/profitability-page').then((m) => m.ProfitabilityPage) },
] satisfies Routes;
