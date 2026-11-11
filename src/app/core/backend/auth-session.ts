/** What the shell needs to know about authentication (implemented by SupabaseAuthService). */
export abstract class AuthSession {
  abstract signOut(): Promise<void>;
}
