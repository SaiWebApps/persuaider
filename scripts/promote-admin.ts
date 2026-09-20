/**
 * Promote (or demote) a user by email.
 *
 *   npx tsx scripts/promote-admin.ts someone@example.com          # role -> admin
 *   npx tsx scripts/promote-admin.ts someone@example.com user     # role -> user
 *
 * The database role column is the only source of truth for authorization, so
 * this is the whole story: no Clerk dashboard step is needed.
 */
import { PrismaClient } from '@prisma/client';

const [email, role = 'admin'] = process.argv.slice(2);

if (!email || !['admin', 'user'].includes(role)) {
  console.error('usage: promote-admin.ts <email> [admin|user]');
  process.exit(2);
}

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`no user with email ${email}. They must sign in once first.`);
    process.exit(1);
  }
  await prisma.user.update({ where: { id: user.id }, data: { role } });
  console.log(`${email} is now ${role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
