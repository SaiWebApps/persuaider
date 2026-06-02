/**
 * @jest-environment node
 */

import { generateAvatarUrl } from '../dicebear';

describe('generateAvatarUrl', () => {
  it('returns a valid DiceBear URL with the name as seed', () => {
    const url = generateAvatarUrl('Alice');
    expect(url).toBe('https://api.dicebear.com/7.x/personas/svg?seed=Alice');
  });

  it('is deterministic - same name produces same URL', () => {
    const url1 = generateAvatarUrl('Bob');
    const url2 = generateAvatarUrl('Bob');
    expect(url1).toBe(url2);
  });

  it('produces different URLs for different names', () => {
    const url1 = generateAvatarUrl('Alice');
    const url2 = generateAvatarUrl('Bob');
    expect(url1).not.toBe(url2);
  });

  it('uses "default" seed for empty string', () => {
    const url = generateAvatarUrl('');
    expect(url).toContain('seed=default');
  });

  it('uses "default" seed for whitespace-only string', () => {
    const url = generateAvatarUrl('   ');
    expect(url).toContain('seed=default');
  });

  it('URL-encodes unicode names (emoji)', () => {
    const url = generateAvatarUrl('Hello 🌍');
    expect(url).toContain('seed=Hello%20%F0%9F%8C%8D');
  });

  it('URL-encodes CJK characters', () => {
    const url = generateAvatarUrl('\u4eba\u683c');
    // encodeURIComponent encodes each CJK char
    expect(url).toContain('seed=%E4%BA%BA%E6%A0%BC');
  });

  it('handles very long name (1000 chars) without error', () => {
    const longName = 'A'.repeat(1000);
    const url = generateAvatarUrl(longName);
    expect(url).toContain('seed=' + 'A'.repeat(1000));
    expect(url).toMatch(/^https:\/\/api\.dicebear\.com/);
  });

  it('URL-encodes XSS attempt in name', () => {
    const url = generateAvatarUrl('<script>alert("xss")</script>');
    expect(url).not.toContain('<script>');
    expect(url).toContain('seed=%3Cscript%3Ealert(%22xss%22)%3C%2Fscript%3E');
  });

  it('URL-encodes name with spaces', () => {
    const url = generateAvatarUrl('John Doe');
    expect(url).toContain('seed=John%20Doe');
  });

  it('handles null-like input gracefully', () => {
    // TypeScript would prevent null, but runtime defense
    const url = generateAvatarUrl(null as unknown as string);
    expect(url).toContain('seed=default');
  });

  it('handles undefined-like input gracefully', () => {
    const url = generateAvatarUrl(undefined as unknown as string);
    expect(url).toContain('seed=default');
  });

  it('uses custom style when provided', () => {
    const url = generateAvatarUrl('Alice', 'adventurer');
    expect(url).toBe('https://api.dicebear.com/7.x/adventurer/svg?seed=Alice');
  });

  it('uses default "personas" style when none specified', () => {
    const url = generateAvatarUrl('Alice');
    expect(url).toContain('/personas/svg');
  });

  it('trims whitespace from name before encoding', () => {
    const url = generateAvatarUrl('  Alice  ');
    expect(url).toContain('seed=Alice');
  });

  it('handles special URL characters (ampersand, question mark)', () => {
    const url = generateAvatarUrl('A&B?C');
    expect(url).toContain('seed=A%26B%3FC');
  });

  it('handles hash character in name', () => {
    const url = generateAvatarUrl('User#1');
    expect(url).toContain('seed=User%231');
  });
});
