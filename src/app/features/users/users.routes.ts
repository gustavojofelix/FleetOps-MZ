import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./users-page/users-page').then((m) => m.UsersPage) },
] satisfies Routes;
