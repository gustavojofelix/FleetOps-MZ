import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';
import { PreferencesService, ThemePreference } from './preferences.service';

export type ResolvedTheme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly preferences = inject(PreferencesService);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
  private readonly systemPrefersDark = signal(this.media?.matches ?? false);

  readonly preference = this.preferences.theme;
  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this.preference();
    if (preference === 'system') return this.systemPrefersDark() ? 'dark' : 'light';
    return preference;
  });

  constructor() {
    this.media?.addEventListener('change', (event) => this.systemPrefersDark.set(event.matches));
    effect(() => {
      const theme = this.resolved();
      const root = this.document.documentElement;
      root.setAttribute('data-theme', theme);
      root.style.colorScheme = theme;
    });
  }

  setPreference(theme: ThemePreference): void {
    this.preferences.update({ theme });
  }

  /** Toggles between light and dark, leaving "system" mode. */
  toggle(): void {
    this.setPreference(this.resolved() === 'dark' ? 'light' : 'dark');
  }
}
