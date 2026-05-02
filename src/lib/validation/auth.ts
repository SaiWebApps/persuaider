export function validateEmail(email: string): string | null {
  if (!email || email.trim().length === 0) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Invalid email format';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  return null;
}

export function validateUsername(username: string): string | null {
  if (!username || username.trim().length === 0) return 'Username is required';
  if (username.trim().length < 3) return 'Username must be at least 3 characters';
  return null;
}

export interface RegistrationData {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export function validateRegistration(data: RegistrationData): Record<string, string> | null {
  const errors: Record<string, string> = {};

  const emailErr = validateEmail(data.email);
  if (emailErr) errors.email = emailErr;

  const usernameErr = validateUsername(data.username);
  if (usernameErr) errors.username = usernameErr;

  const passwordErr = validatePassword(data.password);
  if (passwordErr) errors.password = passwordErr;

  if (data.password && data.confirmPassword !== data.password) {
    errors.confirmPassword = 'Passwords do not match';
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
