import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  const oauthProviders: Array<{ id: string; name: string }> = [];

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    oauthProviders.push({ id: 'google', name: 'Google' });
  }
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    oauthProviders.push({ id: 'microsoft-entra-id', name: 'Microsoft' });
  }

  return <LoginForm oauthProviders={oauthProviders} />;
}
