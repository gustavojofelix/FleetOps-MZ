import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from './translation.service';
import { TranslationParams } from './translation.types';

/**
 * `{{ 'vehicles.title' | t }}` or `{{ 'trips.summary' | t: { count: n } }}`.
 * Impure so it re-evaluates after a language switch; the lookup itself is a cheap map walk.
 */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(TranslationService);

  transform(key: string | null | undefined, params?: TranslationParams): string {
    if (!key) return '';
    return this.i18n.t(key, params);
  }
}
