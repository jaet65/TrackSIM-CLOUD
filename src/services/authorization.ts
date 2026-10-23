const ADMIN_EMAIL_DOMAIN = '@corporativomaf.com';
const MASS_DELETE_GOOGLE_EMAIL = 'magraz@corporativomaf.com';

export type MassDeleteReauthMethod = 'google' | 'unsupported';

export function isVerifiedCorporateAdmin(email: string | null, emailVerified: boolean): boolean {
  return emailVerified && (email || '').trim().toLowerCase().endsWith(ADMIN_EMAIL_DOMAIN);
}

export function getMassDeleteReauthMethod(
  email: string | null,
  providerIds: string[]
): MassDeleteReauthMethod {
  const normalizedEmail = (email || '').trim().toLowerCase();

  return normalizedEmail === MASS_DELETE_GOOGLE_EMAIL && providerIds.includes('google.com')
    ? 'google'
    : 'unsupported';
}
