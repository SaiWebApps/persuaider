-- One in-progress conversation per user × persona, enforced by the database.
-- Prisma's schema language cannot express a partial index, so this lives in SQL only;
-- src/lib/conversation/start.ts catches P2002 and resumes the winner.
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_one_in_progress_per_user_persona"
  ON "conversations" ("userId", "personaId")
  WHERE "status" = 'in_progress';
