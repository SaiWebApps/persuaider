import { safeRedirect, sharePath } from '../redirect';

describe('safeRedirect', () => {
  it('honours a same-origin path with query', () => {
    expect(safeRedirect('/s/EXAMPLE1?join=1')).toBe('/s/EXAMPLE1?join=1');
  });
  it.each([
    ['https://evil.example/phish'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['/\t/evil.example/x'],
    ['/\t\\evil.example'],
    ['javascript:alert(1)'],
    ['/s/x\r\nSet-Cookie: a=b'],
    [''],
    [undefined],
    [null],
  ])('falls back to the dashboard for %p', (value) => {
    expect(safeRedirect(value as string | null | undefined)).toBe('/dashboard');
  });
  it('keeps an encoded tab as a literal path segment on this origin', () => {
    expect(safeRedirect('/%09/evil.example/x')).toBe('/%09/evil.example/x');
  });
});

describe('sharePath', () => {
  it('builds the share page path, with join on request', () => {
    expect(sharePath('EXAMPLE1')).toBe('/s/EXAMPLE1');
    expect(sharePath('EXAMPLE1', true)).toBe('/s/EXAMPLE1?join=1');
  });
});
