import { InjectionToken } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

/*
 * Public project settings. The anon (publishable) key is meant to ship in the browser:
 * data is protected by Row Level Security, not by hiding this key.
 * NEVER put the service_role key in the frontend.
 */
export const SUPABASE_URL = 'https://wvyibznxvicorywiapgu.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2eWliem54dmljb3J5d2lhcGd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzNzk4MTMsImV4cCI6MjEwOTk1NTgxM30.Zb1QGEnLTlCXSDeihoPZqnszl1v-XEnsIfvpFwdLKrE';

export const SUPABASE = new InjectionToken<SupabaseClient>('SUPABASE', {
  providedIn: 'root',
  factory: () =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
});

/** Supabase/PostgREST errors are plain objects; rethrow them as real Errors with the original attached. */
export function toError(error: { message: string; code?: string }): Error {
  return Object.assign(new Error(error.message), { code: error.code, cause: error });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mock ids ("v-001") still circulate while modules migrate; they can never match a uuid column. */
export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID.test(value);
}
