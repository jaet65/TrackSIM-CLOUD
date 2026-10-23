import { describe, expect, it } from 'vitest';
import { getMassDeleteReauthMethod, isVerifiedCorporateAdmin } from '../authorization';

describe('isVerifiedCorporateAdmin', () => {
  it('recognizes verified corporate email addresses regardless of casing or surrounding whitespace', () => {
    expect(isVerifiedCorporateAdmin(' ADMIN@CORPORATIVOMAF.COM ', true)).toBe(true);
  });

  it('does not recognize an unverified corporate address as an administrator', () => {
    expect(isVerifiedCorporateAdmin('admin@corporativomaf.com', false)).toBe(false);
  });

  it('does not recognize addresses outside the exact corporate domain', () => {
    expect(isVerifiedCorporateAdmin('admin@corporativomaf.com.example', true)).toBe(false);
    expect(isVerifiedCorporateAdmin('admin@example.com', true)).toBe(false);
  });

  it('does not recognize users without an email address as administrators', () => {
    expect(isVerifiedCorporateAdmin(null, true)).toBe(false);
  });
});

describe('getMassDeleteReauthMethod', () => {
  it('requires Google reauthentication for the specifically authorized account', () => {
    expect(getMassDeleteReauthMethod('MAGRAZ@CORPORATIVOMAF.COM', ['google.com'])).toBe('google');
  });

  it('prefers Google for the specifically authorized account even when password is linked', () => {
    expect(getMassDeleteReauthMethod('magraz@corporativomaf.com', ['password', 'google.com'])).toBe('google');
  });

  it('rejects other administrators even when they have password and Google providers', () => {
    expect(getMassDeleteReauthMethod('admin@corporativomaf.com', ['password', 'google.com'])).toBe('unsupported');
  });

  it('rejects Google-only accounts other than the specifically authorized account', () => {
    expect(getMassDeleteReauthMethod('other@corporativomaf.com', ['google.com'])).toBe('unsupported');
  });

  it('requires the authorized account to have Google linked', () => {
    expect(getMassDeleteReauthMethod('magraz@corporativomaf.com', ['password'])).toBe('unsupported');
  });
});
