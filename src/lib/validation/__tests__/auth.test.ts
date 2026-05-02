import { validateEmail, validatePassword, validateUsername, validateRegistration } from '../auth';

describe('validateEmail', () => {
  it('passes valid email', () => expect(validateEmail('test@test.com')).toBeNull());
  it('fails empty string', () => expect(validateEmail('')).toBe('Email is required'));
  it('fails missing @', () => expect(validateEmail('testtest.com')).toBe('Invalid email format'));
  it('fails missing domain', () => expect(validateEmail('test@')).toBe('Invalid email format'));
  it('trims whitespace', () => expect(validateEmail(' test@test.com ')).toBeNull());
});

describe('validatePassword', () => {
  it('passes 8+ chars', () => expect(validatePassword('12345678')).toBeNull());
  it('fails empty', () => expect(validatePassword('')).toBe('Password is required'));
  it('fails 7 chars', () => expect(validatePassword('1234567')).toBe('Password must be at least 8 characters'));
  it('passes long password', () => expect(validatePassword('a'.repeat(100))).toBeNull());
});

describe('validateUsername', () => {
  it('passes 3+ chars', () => expect(validateUsername('abc')).toBeNull());
  it('fails empty', () => expect(validateUsername('')).toBe('Username is required'));
  it('fails 2 chars', () => expect(validateUsername('ab')).toBe('Username must be at least 3 characters'));
  it('trims whitespace', () => expect(validateUsername('  ab  ')).toBe('Username must be at least 3 characters'));
});

describe('validateRegistration', () => {
  const valid = { email: 'a@b.com', username: 'user', password: 'password1', confirmPassword: 'password1' };

  it('returns null for valid data', () => expect(validateRegistration(valid)).toBeNull());

  it('returns error for mismatched passwords', () => {
    const result = validateRegistration({ ...valid, confirmPassword: 'different' });
    expect(result?.confirmPassword).toBe('Passwords do not match');
  });

  it('returns multiple errors', () => {
    const result = validateRegistration({ email: '', username: '', password: '', confirmPassword: '' });
    expect(result).toHaveProperty('email');
    expect(result).toHaveProperty('username');
    expect(result).toHaveProperty('password');
  });

  it('skips confirm check when password itself is invalid', () => {
    const result = validateRegistration({ email: 'a@b.com', username: 'user', password: '', confirmPassword: '' });
    expect(result).toHaveProperty('password');
    expect(result).not.toHaveProperty('confirmPassword');
  });
});
