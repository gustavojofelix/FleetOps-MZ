import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./maintenance-page/maintenance-page').then((m) => m.MaintenancePage) },
] satisfies Routes;
