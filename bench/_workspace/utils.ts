/**
 * Capitalize the first character of a string
 */
export function capitalize(input: string): string {
  if (!input) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
}

/**
 * Convert string to camelCase
 */
export function toCamelCase(input: string): string {
  if (!input) return input;
  return input
    .toLowerCase()
    .replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''));
}

/**
 * Convert string to snake_case
 */
export function toSnakeCase(input: string): string {
  if (!input) return input;
  return input
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

/**
 * Normalize whitespace by trimming and collapsing multiple spaces
 */
export function normalizeWhitespace(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Reverse a string
 */
export function reverse(input: string): string {
  return input.split('').reverse().join('');
}

/**
 * Check if a string is a palindrome (case-insensitive, ignoring non-alphanumeric)
 */
export function isPalindrome(input: string): boolean {
  const clean = input.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean === clean.split('').reverse().join('');
}

/**
 * Repeat a string n times
 */
export function repeatStr(input: string, times: number): string {
  if (times < 0) throw new Error('times must be non-negative');
  return input.repeat(times);
}

/**
 * Truncate a string to maxLength with optional suffix
 */
export function truncate(input: string, maxLength: number, suffix = '...'): string {
  if (suffix.length > maxLength) {
    throw new Error('suffix length cannot exceed maxLength');
  }
  if (input.length <= maxLength) return input;
  return input.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Convert a string to a URL-safe slug
 * @param input - The string to slugify
 * @returns A lowercase, hyphen-separated slug with no special characters
 */
export function slugify(input: string): string {
  // Edge case 1: Multiple consecutive spaces/hyphens should become single hyphen
  // Edge case 2: Leading/trailing whitespace and special chars should be stripped
  // Edge case 3: Unicode characters (e.g., accents) may not convert predictably without polyfills
  
  return input
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^\w\s-]/g, '') // Remove special characters, keep alphanumeric, spaces, hyphens
    .replace(/[_\s]+/g, '-') // Replace underscores and spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}
