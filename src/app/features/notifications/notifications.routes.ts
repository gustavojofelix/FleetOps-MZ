import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./notifications-page/notifications-page').then((m) => m.NotificationsPage) },
] satisfies Routes;
