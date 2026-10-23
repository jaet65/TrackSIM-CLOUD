import { describe, expect, it } from 'vitest';
import { isVerifiedCorporateAdmin } from '../authorization';

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
