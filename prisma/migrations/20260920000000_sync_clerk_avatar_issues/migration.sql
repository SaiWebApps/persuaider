-- Brings the migration history in line with what `prisma db push` had already
-- applied (clerkId on users, avatarUrl on personas) and adds Scenario.issues.

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "clerkId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_clerkId_key" ON "users"("clerkId");

-- AlterTable
ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;

-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN IF NOT EXISTS "issues" TEXT NOT NULL DEFAULT '[]';
