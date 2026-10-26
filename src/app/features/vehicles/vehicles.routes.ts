import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./vehicles-page/vehicles-page').then((m) => m.VehiclesPage) },
  { path: ':id', loadComponent: () => import('./vehicle-detail-page/vehicle-detail-page').then((m) => m.VehicleDetailPage) },
] satisfies Routes;
