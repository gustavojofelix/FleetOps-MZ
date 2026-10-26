import { TranslationTree } from './translation.types';

export type LanguageCode = 'pt-MZ' | 'en';

export interface LanguageDefinition {
  code: LanguageCode;
  /** Name shown in the language selector, always in its own language. */
  nativeName: string;
  shortLabel: string;
  /** Locale passed to Intl formatters. */
  intlLocale: string;
  /** Lazy loader so only the active language is downloaded. */
  load: () => Promise<TranslationTree>;
}

/**
 * Supported languages. To add one (e.g. pt-PT or es): create
 * `resources/<code>/` mirroring `resources/pt-MZ/`, typed with TranslationOf, and register it here.
 */
export const LANGUAGES: readonly LanguageDefinition[] = [
  {
    code: 'pt-MZ',
    nativeName: 'Português (Moçambique)',
    shortLabel: 'PT',
    intlLocale: 'pt-MZ',
    load: () => import('./resources/pt-MZ').then((m) => m.translations as unknown as TranslationTree),
  },
  {
    code: 'en',
    nativeName: 'English',
    shortLabel: 'EN',
    intlLocale: 'en',
    load: () => import('./resources/en').then((m) => m.translations as unknown as TranslationTree),
  },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'pt-MZ';

export function findLanguage(code: string | null | undefined): LanguageDefinition | undefined {
  return LANGUAGES.find((language) => language.code === code);
}
