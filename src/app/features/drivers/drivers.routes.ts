import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./drivers-page/drivers-page').then((m) => m.DriversPage) },
  { path: ':id', loadComponent: () => import('./driver-detail-page/driver-detail-page').then((m) => m.DriverDetailPage) },
] satisfies Routes;
