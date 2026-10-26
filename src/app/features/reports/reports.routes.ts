import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./reports-page/reports-page').then((m) => m.ReportsPage) },
] satisfies Routes;
