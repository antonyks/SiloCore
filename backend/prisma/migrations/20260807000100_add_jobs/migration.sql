-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'CANCELLED', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "jobs" (
    "id" SERIAL NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "errorCode" TEXT,
    "sanitizedError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "queueMessageId" TEXT,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_workspaceId_status_idx" ON "jobs"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "jobs_workspaceId_createdAt_idx" ON "jobs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_createdByUserId_idx" ON "jobs"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_queueMessageId_key" ON "jobs"("queueMessageId");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
