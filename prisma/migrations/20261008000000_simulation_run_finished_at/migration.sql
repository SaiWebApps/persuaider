-- AlterTable
ALTER TABLE "simulation_runs" ADD COLUMN "finishedAt" TIMESTAMP(3);

-- Runs that already ended are never written after the end, so their last update is when they finished.
UPDATE "simulation_runs" SET "finishedAt" = "updatedAt" WHERE "status" <> 'running';

-- CreateIndex
CREATE INDEX "simulation_runs_userId_scenarioId_finishedAt_idx" ON "simulation_runs"("userId", "scenarioId", "finishedAt");
