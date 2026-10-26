import { Routes } from '@angular/router';

export default [{ path: '', loadComponent: () => import('./fuel-page/fuel-page').then((m) => m.FuelPage) }] satisfies Routes;
