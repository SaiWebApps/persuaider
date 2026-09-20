import { SignIn } from '@clerk/nextjs';
import { safeRedirect } from '@/lib/auth/redirect';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redirect_url?: string }> }) {
  const { redirect_url } = await searchParams;
  const target = safeRedirect(redirect_url);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn routing="hash" forceRedirectUrl={target} fallbackRedirectUrl={target} />
    </div>
  );
}
