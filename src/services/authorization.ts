const ADMIN_EMAIL_DOMAIN = '@corporativomaf.com';

export function isVerifiedCorporateAdmin(email: string | null, emailVerified: boolean): boolean {
  return emailVerified && (email || '').trim().toLowerCase().endsWith(ADMIN_EMAIL_DOMAIN);
}
