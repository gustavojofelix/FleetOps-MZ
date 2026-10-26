/**
 * Thin wrapper around localStorage that never throws (private mode, quota, disabled storage).
 * Only UI preferences and demo data are stored; never secrets or real personal data.
 */
export const localStore = {
  read<T>(key: string): T | null {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  write(key: string, value: unknown): void {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable: the app keeps working with in-memory state.
    }
  },

  remove(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // ignore
    }
  },

  /** Removes every key that starts with the prefix. */
  removeByPrefix(prefix: string): void {
    try {
      const storage = globalThis.localStorage;
      if (!storage) return;
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith(prefix)) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    } catch {
      // ignore
    }
  },
};
