import { getAuthSession, signOut, requireAdmin, requireVerifiedUser, isAdmin } from './clerk';
import type { AuthSession } from './clerk';

export type { AuthSession };
export { signOut, requireAdmin, requireVerifiedUser, isAdmin };

export const auth = getAuthSession;
