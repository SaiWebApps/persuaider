-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "roleId" TEXT;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
