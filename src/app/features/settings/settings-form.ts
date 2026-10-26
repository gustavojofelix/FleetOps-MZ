import { DestroyRef, Injectable, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormGroup } from '@angular/forms';
import { map } from 'rxjs';

export const SETTINGS_TABS = ['company', 'regional', 'notifications', 'preferences', 'data'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** Unsaved-changes flag of the active company settings panel (provided by SettingsPage). */
@Injectable()
export class SettingsUnsavedChanges {
  readonly dirty = signal(false);
}

type FlatValue = Record<string, string | number | boolean | null>;

function sameValues(a: FlatValue, b: FlatValue): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (String(a[key] ?? '') !== String(b[key] ?? '')) return false;
  }
  return true;
}

export interface TrackedSettingsForm {
  /** True while the form differs from the saved company settings. */
  readonly dirty: Signal<boolean>;
  /** Restores the saved values. */
  discard(): void;
}

/**
 * Keeps a company-settings form in sync with the saved values: resets it whenever the saved
 * organization changes (load, save, demo reset), derives a dirty flag by value comparison and
 * reports it to the settings page so tab switches and navigation can ask before discarding.
 * Call in an injection context.
 */
export function trackSettingsForm<T extends FlatValue>(form: FormGroup, saved: () => T | null): TrackedSettingsForm {
  const unsaved = inject(SettingsUnsavedChanges);
  const value = toSignal(form.valueChanges.pipe(map(() => form.getRawValue() as T)), { initialValue: form.getRawValue() as T });
  const dirty = computed(() => {
    const reference = saved();
    return !!reference && !sameValues(value(), reference);
  });

  effect(() => {
    const reference = saved();
    if (reference) untracked(() => form.reset(reference));
  });
  effect(() => unsaved.dirty.set(dirty()));
  inject(DestroyRef).onDestroy(() => unsaved.dirty.set(false));

  return {
    dirty,
    discard: () => {
      const reference = saved();
      if (reference) form.reset(reference);
    },
  };
}
