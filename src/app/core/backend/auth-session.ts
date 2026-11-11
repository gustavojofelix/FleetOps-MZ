import { Injectable } from '@angular/core';

/**
 * What the shell needs to know about authentication, independent of the backend.
 * The demo build binds `DemoAuthSession`; the Supabase build binds `SupabaseAuthService`.
 */
export abstract class AuthSession {
  /** False in the demo build: there is no real sign-in. */
  abstract readonly enabled: boolean;
  abstract signOut(): Promise<void>;
}

@Injectable()
export class DemoAuthSession extends AuthSession {
  readonly enabled = false;

  signOut(): Promise<void> {
    return Promise.resolve();
  }
}
