import { Signal, computed, effect, signal, untracked } from '@angular/core';

export interface QueryRef<T> {
  /** Latest successful value; kept while a refetch is running to avoid flicker. */
  readonly value: Signal<T | undefined>;
  /** True while the first load or any refetch is in flight. */
  readonly loading: Signal<boolean>;
  /** True only before the first value has arrived (use for skeletons). */
  readonly initialLoading: Signal<boolean>;
  readonly error: Signal<unknown>;
  reload(): void;
}

/**
 * Reactive async query. `params` is tracked: whenever a signal it reads changes (filters,
 * route params, repository `changes`), the loader runs again. Out-of-order responses are
 * discarded. Must be called in an injection context (field initialiser or constructor).
 */
export function createQuery<P, T>(params: () => P, loader: (params: P) => Promise<T>): QueryRef<T> {
  const value = signal<T | undefined>(undefined);
  const loading = signal(true);
  const error = signal<unknown>(null);
  const trigger = signal(0);
  let requestId = 0;

  effect(() => {
    trigger();
    const current = params();
    const id = ++requestId;
    untracked(() => {
      loading.set(true);
      error.set(null);
    });
    loader(current).then(
      (result) => {
        if (id !== requestId) return;
        value.set(result);
        loading.set(false);
      },
      (err: unknown) => {
        if (id !== requestId) return;
        console.error(err);
        error.set(err ?? new Error('Unknown error'));
        loading.set(false);
      },
    );
  });

  return {
    value: value.asReadonly(),
    loading: loading.asReadonly(),
    initialLoading: computed(() => loading() && value() === undefined),
    error: error.asReadonly(),
    reload: () => trigger.update((n) => n + 1),
  };
}
