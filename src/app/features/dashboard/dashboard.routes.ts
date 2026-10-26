import { Routes } from '@angular/router';

export default [{ path: '', loadComponent: () => import('./dashboard-page/dashboard-page').then((m) => m.DashboardPage) }] satisfies Routes;
