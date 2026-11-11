import { Routes } from '@angular/router';
import { authRoutes, shellGuards } from './core/backend/backend';
import { Shell } from './layout/shell/shell';

/** Every feature is lazy-loaded; `data.titleKey` drives the top bar and the document title. */
export const routes: Routes = [
  // Sign-in / onboarding (Supabase build only; empty in the demo).
  ...authRoutes,
  {
    path: '',
    component: Shell,
    canActivate: shellGuards,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', data: { titleKey: 'navigation.dashboard' }, loadChildren: () => import('./features/dashboard/dashboard.routes') },
      { path: 'vehicles', data: { titleKey: 'navigation.vehicles' }, loadChildren: () => import('./features/vehicles/vehicles.routes') },
      { path: 'drivers', data: { titleKey: 'navigation.drivers' }, loadChildren: () => import('./features/drivers/drivers.routes') },
      { path: 'trailers', data: { titleKey: 'navigation.trailers' }, loadChildren: () => import('./features/trailers/trailers.routes') },
      { path: 'trips', data: { titleKey: 'navigation.trips' }, loadChildren: () => import('./features/trips/trips.routes') },
      { path: 'dispatch', data: { titleKey: 'navigation.dispatch' }, loadChildren: () => import('./features/dispatch/dispatch.routes') },
      { path: 'customers', data: { titleKey: 'navigation.customers' }, loadChildren: () => import('./features/customers/customers.routes') },
      { path: 'fuel', data: { titleKey: 'navigation.fuel' }, loadChildren: () => import('./features/fuel/fuel.routes') },
      { path: 'expenses', data: { titleKey: 'navigation.expenses' }, loadChildren: () => import('./features/expenses/expenses.routes') },
      { path: 'maintenance', data: { titleKey: 'navigation.maintenance' }, loadChildren: () => import('./features/maintenance/maintenance.routes') },
      { path: 'profitability', data: { titleKey: 'navigation.profitability' }, loadChildren: () => import('./features/profitability/profitability.routes') },
      { path: 'reports', data: { titleKey: 'navigation.reports' }, loadChildren: () => import('./features/reports/reports.routes') },
      { path: 'documents', data: { titleKey: 'navigation.documents' }, loadChildren: () => import('./features/documents/documents.routes') },
      { path: 'notifications', data: { titleKey: 'navigation.notifications' }, loadChildren: () => import('./features/notifications/notifications.routes') },
      { path: 'users', data: { titleKey: 'navigation.users' }, loadChildren: () => import('./features/users/users.routes') },
      { path: 'settings', data: { titleKey: 'navigation.settings' }, loadChildren: () => import('./features/settings/settings.routes') },
      { path: '**', data: { titleKey: 'shell.notFound.title' }, loadComponent: () => import('./layout/not-found/not-found-page').then((m) => m.NotFoundPage) },
    ],
  },
];
