import { execSync } from 'child_process';
import { clerkSetup } from '@clerk/testing/playwright';

// Peeraxis Demonstration setup. Runs against the throwaway database only.
// No Clerk user is created or deleted, no LLM is called.
const DEMO_USERS = ['demo@persuaider.com', 'admin@persuaider.dev'];

export default async function peeraxisSetup() {
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!/[?&]host=\//.test(dbUrl)) {
    throw new Error('peeraxis-setup: DATABASE_URL must be the local unix-socket demo database.');
  }

  // Browser testing token for the Clerk development instance.
  await clerkSetup({ dotenv: false }); // never read .env.local (LLM keys, Neon URLs)

  // Seed the fresh database (repo seed: plain Prisma upserts, no network). `node --import tsx`,
  // not the tsx CLI: the CLI opens an IPC socket under $TMPDIR, and Peeraxis's stage TMPDIR is
  // too long for a unix socket path.
  execSync('node --import tsx prisma/seed.ts', { stdio: 'inherit' });

  // Link the seeded rows to the existing Clerk test users (read-only on Clerk).
  const { createClerkClient } = await import('@clerk/backend');
  const { PrismaClient } = await import('@prisma/client');
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  const db = new PrismaClient();
  try {
    for (const email of DEMO_USERS) {
      const found = await clerk.users.getUserList({ emailAddress: [email] });
      const user = found.data?.[0];
      if (!user) throw new Error(`peeraxis-setup: Clerk test user ${email} does not exist; not creating it.`);
      await db.user.update({ where: { email }, data: { clerkId: user.id } });
    }
  } finally {
    await db.$disconnect();
  }
}
