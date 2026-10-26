import { Routes } from '@angular/router';

export default [{ path: '', loadComponent: () => import('./dispatch-page/dispatch-page').then((m) => m.DispatchPage) }] satisfies Routes;
