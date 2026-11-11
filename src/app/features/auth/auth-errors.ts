/** Maps a Supabase Auth / API error to a translation key under `auth.errors`. */
export function authErrorKey(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) return 'auth.errors.invalidCredentials';
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) return 'auth.errors.emailNotConfirmed';
  if (code === 'user_already_exists' || code === 'email_exists' || message.includes('already registered')) return 'auth.errors.alreadyRegistered';
  if (code === 'weak_password') return 'auth.errors.weakPassword';
  if (code.startsWith('over_') || message.includes('rate limit')) return 'auth.errors.rateLimited';
  return 'auth.errors.generic';
}
