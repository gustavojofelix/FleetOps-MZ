import { TranslationParams, TranslationTree } from './translation.types';

const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

function lookup(tree: TranslationTree, key: string): string | TranslationTree | undefined {
  let node: string | TranslationTree | undefined = tree;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return node;
}

function isPluralNode(node: TranslationTree): boolean {
  return typeof node['other'] === 'string' && Object.keys(node).every((key) => PLURAL_CATEGORIES.includes(key));
}

function interpolate(message: string, params: TranslationParams | undefined): string {
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}

/**
 * Resolves a dotted key against a dictionary. Plural nodes ({ one, other }) are selected
 * with Intl.PluralRules using `params.count`. Returns null when the key is missing.
 */
export function resolveTranslation(
  tree: TranslationTree,
  key: string,
  params: TranslationParams | undefined,
  locale: string,
): string | null {
  const node = lookup(tree, key);
  if (node === undefined) return null;
  if (typeof node === 'string') return interpolate(node, params);
  if (isPluralNode(node)) {
    const count = Number(params?.['count'] ?? 0);
    const category = new Intl.PluralRules(locale).select(count);
    const form = node[category] ?? node['other'];
    return typeof form === 'string' ? interpolate(form, params) : null;
  }
  return null;
}

/** Lists every leaf key of a dictionary (used by tests to compare languages). */
export function collectKeys(tree: TranslationTree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [path] : collectKeys(value, path);
  });
}
