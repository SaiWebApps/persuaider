import { auth } from '@/lib/auth';
import { VerifyEmailPrompt } from '@/components/auth/VerifyEmailPrompt';

export default async function VerifyEmailPage() {
  const session = await auth();

  return <VerifyEmailPrompt email={session?.user?.email} />;
}
