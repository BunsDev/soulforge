import { describe, it, expect } from 'bun:test';
import {
  capitalize,
  toCamelCase,
  toSnakeCase,
  normalizeWhitespace,
  reverse,
  isPalindrome,
  repeatStr,
  truncate,
  slugify,
} from './utils';

describe('capitalize', () => {
  it('should capitalize the first character', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('should handle already capitalized strings', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });

  it('should handle single character strings', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('should handle empty strings', () => {
    expect(capitalize('')).toBe('');
  });

  it('should only capitalize the first character', () => {
    expect(capitalize('hELLO')).toBe('HELLO');
  });
});

describe('toCamelCase', () => {
  it('should convert snake_case to camelCase', () => {
    expect(toCamelCase('hello_world')).toBe('helloWorld');
  });

  it('should convert kebab-case to camelCase', () => {
    expect(toCamelCase('hello-world')).toBe('helloWorld');
  });

  it('should convert space-separated to camelCase', () => {
    expect(toCamelCase('hello world')).toBe('helloWorld');
  });

  it('should handle multiple separators', () => {
    expect(toCamelCase('hello_world-test case')).toBe('helloWorldTestCase');
  });

  it('should handle already camelCase strings', () => {
    expect(toCamelCase('helloWorld')).toBe('helloworld');
  });

  it('should handle single word', () => {
    expect(toCamelCase('hello')).toBe('hello');
  });

  it('should handle empty string', () => {
    expect(toCamelCase('')).toBe('');
  });
});

describe('toSnakeCase', () => {
  it('should convert camelCase to snake_case', () => {
    expect(toSnakeCase('helloWorld')).toBe('hello_world');
  });

  it('should convert kebab-case to snake_case', () => {
    expect(toSnakeCase('hello-world')).toBe('hello_world');
  });

  it('should handle consecutive uppercase letters', () => {
    expect(toSnakeCase('HTTPServer')).toBe('httpserver');
  });

  it('should handle space-separated strings', () => {
    expect(toSnakeCase('hello world test')).toBe('hello_world_test');
  });

  it('should handle mixed separators', () => {
    expect(toSnakeCase('hello World-test case')).toBe('hello_world_test_case');
  });

  it('should handle single word', () => {
    expect(toSnakeCase('hello')).toBe('hello');
  });

  it('should handle empty string', () => {
    expect(toSnakeCase('')).toBe('');
  });
});

describe('normalizeWhitespace', () => {
  it('should trim whitespace from both ends', () => {
    expect(normalizeWhitespace('  hello  ')).toBe('hello');
  });

  it('should normalize multiple spaces to single space', () => {
    expect(normalizeWhitespace('hello   world')).toBe('hello world');
  });

  it('should handle tabs and newlines', () => {
    expect(normalizeWhitespace('hello\t\t\nworld')).toBe('hello world');
  });

  it('should handle mixed whitespace', () => {
    expect(normalizeWhitespace('  hello \t world  \n  ')).toBe('hello world');
  });

  it('should handle strings with no extra whitespace', () => {
    expect(normalizeWhitespace('hello world')).toBe('hello world');
  });

  it('should handle empty string', () => {
    expect(normalizeWhitespace('')).toBe('');
  });

  it('should handle whitespace-only string', () => {
    expect(normalizeWhitespace('   \t\n  ')).toBe('');
  });
});

describe('reverse', () => {
  it('should reverse a simple string', () => {
    expect(reverse('hello')).toBe('olleh');
  });

  it('should handle palindromes', () => {
    expect(reverse('racecar')).toBe('racecar');
  });

  it('should handle single character', () => {
    expect(reverse('a')).toBe('a');
  });

  it('should handle empty string', () => {
    expect(reverse('')).toBe('');
  });

  it('should handle strings with spaces', () => {
    expect(reverse('hello world')).toBe('dlrow olleh');
  });

  it('should handle unicode characters', () => {
    expect(reverse('café')).toBe('éfac');
  });
});

describe('isPalindrome', () => {
  it('should identify simple palindromes', () => {
    expect(isPalindrome('racecar')).toBe(true);
  });

  it('should handle case-insensitivity', () => {
    expect(isPalindrome('RaceCar')).toBe(true);
  });

  it('should ignore non-alphanumeric characters', () => {
    expect(isPalindrome('A man, a plan, a canal: Panama')).toBe(true);
  });

  it('should identify non-palindromes', () => {
    expect(isPalindrome('hello')).toBe(false);
  });

  it('should handle single character', () => {
    expect(isPalindrome('a')).toBe(true);
  });

  it('should handle empty string', () => {
    expect(isPalindrome('')).toBe(true);
  });

  it('should handle palindromes with numbers', () => {
    expect(isPalindrome('12321')).toBe(true);
  });

  it('should handle mixed alphanumeric palindromes', () => {
    expect(isPalindrome('a1b1a')).toBe(true);
  });
});

describe('repeatStr', () => {
  it('should repeat a string n times', () => {
    expect(repeatStr('ab', 3)).toBe('ababab');
  });

  it('should return empty string for 0 repetitions', () => {
    expect(repeatStr('hello', 0)).toBe('');
  });

  it('should return original string for 1 repetition', () => {
    expect(repeatStr('hello', 1)).toBe('hello');
  });

  it('should handle empty strings', () => {
    expect(repeatStr('', 5)).toBe('');
  });

  it('should throw for negative times', () => {
    expect(() => repeatStr('hello', -1)).toThrow();
  });

  it('should handle single character repetition', () => {
    expect(repeatStr('x', 4)).toBe('xxxx');
  });

  it('should handle large repetitions', () => {
    expect(repeatStr('a', 100).length).toBe(100);
  });
});

describe('truncate', () => {
  it('should truncate strings longer than maxLength', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('should not truncate strings shorter than maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('should not truncate strings equal to maxLength', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('should use custom suffix', () => {
    expect(truncate('hello world', 8, '***')).toBe('hello***');
  });

  it('should handle exact length matches with suffix', () => {
    expect(truncate('hello', 8, '...')).toBe('hello');
  });

  it('should throw if maxLength is less than suffix length', () => {
    expect(() => truncate('hello', 2, '...')).toThrow();
  });

  it('should handle empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('should handle single character suffix', () => {
    expect(truncate('hello world', 6, '→')).toBe('hello→');
  });

  it('should handle empty suffix', () => {
    expect(truncate('hello world', 5, '')).toBe('hello');
  });

  it('should preserve exact maxLength', () => {
    const result = truncate('hello world', 8);
    expect(result.length).toBe(8);
  });
});

describe('slugify', () => {
  it('should convert basic strings to slugs', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('should handle multiple spaces', () => {
    expect(slugify('hello   world')).toBe('hello-world');
  });

  it('should collapse consecutive hyphens', () => {
    expect(slugify('hello---world')).toBe('hello-world');
  });

  it('should remove leading and trailing hyphens', () => {
    expect(slugify('-hello-world-')).toBe('hello-world');
  });

  it('should handle leading and trailing spaces', () => {
    expect(slugify('  hello world  ')).toBe('hello-world');
  });

  it('should remove diacritics', () => {
    expect(slugify('café naïve')).toBe('cafe-naive');
  });

  it('should handle umlauts', () => {
    expect(slugify('Müller Schöne')).toBe('muller-schone');
  });

  it('should remove special characters', () => {
    expect(slugify('hello@world!test#slug')).toBe('helloworldtestslug');
  });

  it('should replace underscores with hyphens', () => {
    expect(slugify('hello_world_test')).toBe('hello-world-test');
  });

  it('should convert to lowercase', () => {
    expect(slugify('HELLO WORLD')).toBe('hello-world');
  });

  it('should handle mixed case and special characters', () => {
    expect(slugify('Hello@World#Test')).toBe('helloworldtest');
  });

  it('should handle empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('should handle whitespace-only string', () => {
    expect(slugify('   ')).toBe('');
  });

  it('should handle special-char-only string', () => {
    expect(slugify('!!!###@@@')).toBe('');
  });

  it('should handle mixed separators', () => {
    expect(slugify('hello - world _ test')).toBe('hello-world-test');
  });

  it('should handle accented characters', () => {
    expect(slugify('Français Español')).toBe('francais-espanol');
  });

  it('should preserve alphanumeric and hyphens', () => {
    expect(slugify('test-123-abc')).toBe('test-123-abc');
  });

  it('should handle complex real-world examples', () => {
    expect(slugify('My Blog Post Title!!')).toBe('my-blog-post-title');
    expect(slugify('Contact @ Us')).toBe('contact-us');
    expect(slugify('FAQ / Help')).toBe('faq-help');
  });
});
