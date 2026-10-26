import { Injectable, computed, signal } from '@angular/core';
import { CurrencyCode } from '../models';
import { localStore } from './local-storage';

export type ThemePreference = 'light' | 'dark' | 'system';

/** Personal preferences of the signed-in user (distinct from company settings). */
export interface UserPreferences {
  theme: ThemePreference;
  /** null = follow the company default language. */
  language: string | null;
  /** null = show aggregates in the company reporting currency. */
  displayCurrency: CurrencyCode | null;
  sidebarCollapsed: boolean;
}

/** Keep in sync with the boot script in src/index.html. */
export const PREFERENCES_STORAGE_KEY = 'fleetops.preferences.v1';

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  language: null,
  displayCurrency: null,
  sidebarCollapsed: false,
};

@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly state = signal<UserPreferences>({
    ...DEFAULT_PREFERENCES,
    ...(localStore.read<Partial<UserPreferences>>(PREFERENCES_STORAGE_KEY) ?? {}),
  });

  readonly preferences = this.state.asReadonly();
  readonly theme = computed(() => this.state().theme);
  readonly language = computed(() => this.state().language);
  readonly displayCurrency = computed(() => this.state().displayCurrency);
  readonly sidebarCollapsed = computed(() => this.state().sidebarCollapsed);

  update(changes: Partial<UserPreferences>): void {
    this.state.update((current) => ({ ...current, ...changes }));
    localStore.write(PREFERENCES_STORAGE_KEY, this.state());
  }

  reset(): void {
    this.state.set({ ...DEFAULT_PREFERENCES });
    localStore.remove(PREFERENCES_STORAGE_KEY);
  }
}
