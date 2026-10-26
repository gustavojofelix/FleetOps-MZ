/** A translation resource: nested objects whose leaves are strings. */
export interface TranslationTree {
  [key: string]: string | TranslationTree;
}

/**
 * Shape-preserving type used for every non-source language: it must define exactly the
 * same keys as the Portuguese (Mozambique) source dictionary, with any string values.
 */
export type TranslationOf<T> = {
  [K in keyof T]: T[K] extends string ? string : TranslationOf<T[K]>;
};

/** Interpolation parameters: `{name}` placeholders in a message are replaced by these values. */
export type TranslationParams = Record<string, string | number | null | undefined>;
