/**
 * Uzbek phone in amoCRM's format `+998XXXXXXXXX` (8-bo'lim, 1-qoida), or null
 * when it is not an Uzbek number. Accepts what people type: spaces, dashes,
 * brackets, with or without +998 / 998.
 */
export function normalizePhone(input: string): string | null {
  if (!/^[\d\s()+-]*$/.test(input)) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  return null;
}
