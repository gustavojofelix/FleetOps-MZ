import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./expenses-page/expenses-page').then((m) => m.ExpensesPage) },
] satisfies Routes;
