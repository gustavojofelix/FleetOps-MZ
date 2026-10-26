import { CanDeactivateFn, Routes } from '@angular/router';
import type { SettingsPage } from './settings-page/settings-page';

/** Asks before leaving the page with unsaved company settings. */
const confirmUnsavedSettings: CanDeactivateFn<SettingsPage> = (component) => component.canLeave();

export default [
  {
    path: '',
    loadComponent: () => import('./settings-page/settings-page').then((m) => m.SettingsPage),
    canDeactivate: [confirmUnsavedSettings],
  },
] satisfies Routes;
