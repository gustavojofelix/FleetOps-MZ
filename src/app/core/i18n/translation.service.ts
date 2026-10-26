import { DOCUMENT, Injectable, computed, inject, isDevMode, signal } from '@angular/core';
import { PreferencesService } from '../state/preferences.service';
import { DEFAULT_LANGUAGE, LANGUAGES, LanguageCode, LanguageDefinition, findLanguage } from './languages';
import { resolveTranslation } from './translate';
import { TranslationParams, TranslationTree } from './translation.types';

@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly document = inject(DOCUMENT);
  private readonly preferences = inject(PreferencesService);
  private readonly cache = new Map<LanguageCode, TranslationTree>();
  private readonly reportedMissing = new Set<string>();
  private readonly dictionary = signal<TranslationTree>({});
  private readonly activeCode = signal<LanguageCode>(DEFAULT_LANGUAGE);
  private companyDefault: LanguageCode = DEFAULT_LANGUAGE;

  readonly languages = LANGUAGES;
  readonly language = this.activeCode.asReadonly();
  readonly definition = computed<LanguageDefinition>(() => findLanguage(this.activeCode()) ?? LANGUAGES[0]);
  readonly locale = computed(() => this.definition().intlLocale);
  /** Changes whenever the dictionary changes; read it to re-evaluate translated computeds. */
  readonly revision = computed(() => this.dictionary());

  /** Loads the user's language, falling back to the company default. Called at bootstrap. */
  async init(companyDefault: string | null | undefined): Promise<void> {
    this.companyDefault = findLanguage(companyDefault)?.code ?? DEFAULT_LANGUAGE;
    const preferred = findLanguage(this.preferences.language())?.code ?? this.companyDefault;
    await this.activate(preferred);
  }

  /** Switches language immediately (no reload) and remembers it as a personal preference. */
  async use(code: LanguageCode): Promise<void> {
    await this.activate(code);
    this.preferences.update({ language: code });
  }

  /** Applies a new company default when the user has no personal language preference. */
  async applyCompanyDefault(code: string): Promise<void> {
    this.companyDefault = findLanguage(code)?.code ?? DEFAULT_LANGUAGE;
    if (!this.preferences.language()) await this.activate(this.companyDefault);
  }

  /** Translates a key. Reads signals, so templates and computeds update on language change. */
  t(key: string, params?: TranslationParams): string {
    const message = resolveTranslation(this.dictionary(), key, params, this.locale());
    if (message !== null) return message;
    if (isDevMode() && !this.reportedMissing.has(key) && Object.keys(this.dictionary()).length) {
      this.reportedMissing.add(key);
      console.warn(`[i18n] Missing translation for "${key}" (${this.activeCode()})`);
    }
    return key;
  }

  has(key: string): boolean {
    return resolveTranslation(this.dictionary(), key, undefined, this.locale()) !== null;
  }

  private async activate(code: LanguageCode): Promise<void> {
    const definition = findLanguage(code) ?? LANGUAGES[0];
    let tree = this.cache.get(definition.code);
    if (!tree) {
      tree = await definition.load();
      this.cache.set(definition.code, tree);
    }
    this.dictionary.set(tree);
    this.activeCode.set(definition.code);
    this.document.documentElement.setAttribute('lang', definition.code);
  }
}
