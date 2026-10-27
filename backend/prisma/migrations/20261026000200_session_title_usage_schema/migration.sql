CREATE TYPE "ChatSessionTitleSource" AS ENUM ('PLACEHOLDER', 'GENERATED', 'USER');
CREATE TYPE "GenerationUsageOperation" AS ENUM ('CHAT_REPLY', 'SESSION_TITLE');

ALTER TABLE "chat_sessions"
  ADD COLUMN "titleSource" "ChatSessionTitleSource" NOT NULL DEFAULT 'USER',
  ADD COLUMN "latestEligibleAssistantMessageId" INTEGER,
  ADD COLUMN "latestAttemptedAssistantMessageId" INTEGER;

-- Historical title ownership was not recorded. Treat only exact "New Chat"
-- titles as placeholders; a historical manual rename to that text is indistinguishable.
UPDATE "chat_sessions"
SET "titleSource" = 'PLACEHOLDER'
WHERE "title" = 'New Chat';

ALTER TABLE "chat_messages"
  ADD COLUMN "triggeringUserMessageId" INTEGER;

-- The default classifies both historical rows and existing chat usage writes.
ALTER TABLE "generation_usages"
  ADD COLUMN "operation" "GenerationUsageOperation" NOT NULL DEFAULT 'CHAT_REPLY';

-- The later scheduler can page only sessions with a newer eligible reply.
CREATE INDEX "chat_sessions_title_eligibility_idx"
  ON "chat_sessions" ("id")
  WHERE "titleSource" = 'PLACEHOLDER'
    AND "latestEligibleAssistantMessageId" IS NOT NULL
    AND (
      "latestAttemptedAssistantMessageId" IS NULL
      OR "latestEligibleAssistantMessageId" > "latestAttemptedAssistantMessageId"
    );

-- The active title-job lookup matches workspace and session ID from its minimal payload.
CREATE INDEX "jobs_title_active_session_lookup_idx"
  ON "jobs" ("workspaceId", ("payload" ->> 'sessionId'))
  WHERE "type" = 'chat.session_title'
    AND "status" IN (
      'QUEUED'::"JobStatus", 'RUNNING'::"JobStatus", 'CANCEL_REQUESTED'::"JobStatus"
    );

CREATE INDEX "generation_usages_operation_createdAt_idx"
  ON "generation_usages" ("operation", "createdAt");
