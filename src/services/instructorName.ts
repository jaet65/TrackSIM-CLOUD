/** Reduce un nombre completo a "Primer nombre + Primer apellido" (p. ej. Mario Alberto Agraz Martinez → Mario Agraz). */
export function shortInstructorName(fullName: string | null | undefined): string {
  const raw = (fullName || '').trim();
  if (!raw) return '';
  if (raw.includes('@')) return raw.split('@')[0];

  const parts = raw.split(/\s+/);
  if (parts.length <= 2) return parts.join(' ');
  // Con 4+ palabras se asume dos nombres y dos apellidos; con 3, un nombre y dos apellidos.
  return `${parts[0]} ${parts.length >= 4 ? parts[2] : parts[1]}`;
}
