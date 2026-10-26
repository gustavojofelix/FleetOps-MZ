import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { PreferencesService } from '../core/state/preferences.service';

/** Shell layout state: sidebar collapse (persisted) and the mobile navigation drawer. */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly preferences = inject(PreferencesService);
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(min-width: 1024px)') ?? null;
  private readonly desktop = signal(this.media?.matches ?? true);

  readonly isDesktop = this.desktop.asReadonly();
  readonly mobileNavOpen = signal(false);
  readonly searchOpen = signal(false);
  /** Collapsed only applies to the desktop sidebar; the mobile drawer is always full width. */
  readonly sidebarCollapsed = computed(() => this.desktop() && this.preferences.sidebarCollapsed());

  constructor() {
    this.media?.addEventListener('change', (event) => {
      this.desktop.set(event.matches);
      if (event.matches) this.mobileNavOpen.set(false);
    });
  }

  toggleSidebar(): void {
    this.preferences.update({ sidebarCollapsed: !this.preferences.sidebarCollapsed() });
  }

  openSearch(): void {
    this.mobileNavOpen.set(false);
    this.searchOpen.set(true);
  }
}
