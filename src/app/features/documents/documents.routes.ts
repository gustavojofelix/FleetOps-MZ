import { Routes } from '@angular/router';

export default [
  { path: '', loadComponent: () => import('./documents-page/documents-page').then((m) => m.DocumentsPage) },
] satisfies Routes;
