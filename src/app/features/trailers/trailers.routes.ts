import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./trailers-page/trailers-page').then((m) => m.TrailersPage) },
  { path: ':id', loadComponent: () => import('./trailer-detail-page/trailer-detail-page').then((m) => m.TrailerDetailPage) },
] satisfies Routes;
