import { findLanguage, LANGUAGES } from './languages';
import { translations as en } from './resources/en';
import { translations as ptMZ } from './resources/pt-MZ';
import { collectKeys, resolveTranslation } from './translate';
import { TranslationTree } from './translation.types';

const pt = ptMZ as unknown as TranslationTree;
const english = en as unknown as TranslationTree;

describe('translations', () => {
  it('defines exactly the same keys in every language', () => {
    expect(collectKeys(english).sort()).toEqual(collectKeys(pt).sort());
  });

  it('does not leave any message empty', () => {
    for (const tree of [pt, english]) {
      const empty = collectKeys(tree).filter((key) => !resolveTranslation(tree, key, {}, 'en'));
      expect(empty).toEqual([]);
    }
  });

  it('interpolates parameters', () => {
    expect(resolveTranslation(english, 'common.pagination.summary', { from: 1, to: 10, total: 42 }, 'en')).toBe('1–10 of 42');
  });

  it('selects plural forms with Intl.PluralRules', () => {
    expect(resolveTranslation(pt, 'documents.expiresIn', { count: 1 }, 'pt-MZ')).toBe('Expira em 1 dia');
    expect(resolveTranslation(pt, 'documents.expiresIn', { count: 5 }, 'pt-MZ')).toBe('Expira em 5 dias');
    expect(resolveTranslation(english, 'documents.expiresIn', { count: 1 }, 'en')).toBe('Expires in 1 day');
  });

  it('returns null for unknown keys and for non-leaf nodes', () => {
    expect(resolveTranslation(pt, 'does.not.exist', {}, 'pt-MZ')).toBeNull();
    expect(resolveTranslation(pt, 'common.actions', {}, 'pt-MZ')).toBeNull();
  });

  it('registers pt-MZ and en with Intl locales', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['pt-MZ', 'en']);
    expect(findLanguage('en')?.intlLocale).toBe('en');
    expect(findLanguage('xx')).toBeUndefined();
  });
});
