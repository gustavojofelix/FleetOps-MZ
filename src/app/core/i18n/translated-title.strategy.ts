import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslationService } from './translation.service';

/** Sets `<title>` from the deepest route's `data.titleKey`, re-translating on language change. */
@Injectable()
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly i18n = inject(TranslationService);
  private readonly key = signal<string | null>(null);

  constructor() {
    super();
    effect(() => {
      const key = this.key();
      const app = this.i18n.t('common.appName');
      this.title.setTitle(key ? `${this.i18n.t(key)} · ${app}` : app);
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    let route: ActivatedRouteSnapshot | null = snapshot.root;
    let key: string | null = null;
    while (route) {
      key = (route.data['titleKey'] as string | undefined) ?? key;
      route = route.firstChild;
    }
    this.key.set(key);
  }
}
