export const mockAuthFn = jest.fn();

export function authenticatedUser(overrides: Partial<{id: string, role: string, emailVerified: boolean}> = {}) {
  return { user: { id: 'test-user-1', role: 'user', emailVerified: true, ...overrides } };
}

export function adminUser(overrides: Partial<{id: string, role: string, emailVerified: boolean}> = {}) {
  return { user: { id: 'test-admin-1', role: 'admin', emailVerified: true, ...overrides } };
}

export function unauthenticated() {
  return null;
}
