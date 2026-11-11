import { Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { AuthSession } from '../backend/auth-session';
import { SUPABASE, toError } from './supabase-client';

export interface SignUpResult {
  /** True when Supabase requires the user to confirm the e-mail before signing in. */
  needsConfirmation: boolean;
}

@Injectable({ providedIn: 'root' })
export class SupabaseAuthService extends AuthSession {

  private readonly client = inject(SUPABASE);
  private readonly state = signal<Session | null>(null);

  readonly session = this.state.asReadonly();
  readonly user = computed(() => this.state()?.user ?? null);
  /** Resolves once the persisted session (if any) has been restored. Guards await it. */
  readonly ready: Promise<void>;

  constructor() {
    super();
    this.ready = this.client.auth.getSession().then(({ data }) => this.state.set(data.session));
    // Keep the callback synchronous: awaiting Supabase calls inside it can deadlock the client.
    this.client.auth.onAuthStateChange((event, session) => {
      this.state.set(session);
      // Full reload: no cached data of the previous user survives in memory.
      if (event === 'SIGNED_OUT') location.assign('/login');
    });
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw toError(error);
  }

  async signUp(email: string, password: string, fullName: string): Promise<SignUpResult> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${location.origin}/login` },
    });
    if (error) throw toError(error);
    return { needsConfirmation: !data.session };
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw toError(error);
  }
}
