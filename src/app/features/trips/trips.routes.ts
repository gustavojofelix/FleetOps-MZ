import { Routes } from '@angular/router';

/** Implemented by pages that may hold unsaved changes (kept structural so the page stays lazy). */
interface LeaveGuarded {
  canLeave(): boolean | Promise<boolean>;
}

const confirmLeave = (component: LeaveGuarded | null) => component?.canLeave() ?? true;

export default [
  { path: '', loadComponent: () => import('./trips-page/trips-page').then((m) => m.TripsPage) },
  {
    path: 'new',
    loadComponent: () => import('./trip-form-page/trip-form-page').then((m) => m.TripFormPage),
    canDeactivate: [confirmLeave],
  },
  { path: ':id', loadComponent: () => import('./trip-detail-page/trip-detail-page').then((m) => m.TripDetailPage) },
  {
    path: ':id/edit',
    loadComponent: () => import('./trip-form-page/trip-form-page').then((m) => m.TripFormPage),
    canDeactivate: [confirmLeave],
  },
] satisfies Routes;
