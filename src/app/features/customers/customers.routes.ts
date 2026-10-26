import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./customers-page/customers-page').then((m) => m.CustomersPage) },
  { path: ':id', loadComponent: () => import('./customer-detail-page/customer-detail-page').then((m) => m.CustomerDetailPage) },
] satisfies Routes;
