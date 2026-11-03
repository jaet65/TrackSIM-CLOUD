import { describe, expect, it } from 'vitest';
import { shortInstructorName } from '../instructorName';

describe('shortInstructorName', () => {
  it('reduce a primer nombre y primer apellido', () => {
    expect(shortInstructorName('Mario Alberto Agraz Martinez')).toBe('Mario Agraz');
    expect(shortInstructorName('Mario Agraz Martinez')).toBe('Mario Agraz');
    expect(shortInstructorName('Mario Agraz')).toBe('Mario Agraz');
  });

  it('maneja vacíos y correos', () => {
    expect(shortInstructorName('')).toBe('');
    expect(shortInstructorName(null)).toBe('');
    expect(shortInstructorName('mario@empresa.com')).toBe('mario');
  });
});
