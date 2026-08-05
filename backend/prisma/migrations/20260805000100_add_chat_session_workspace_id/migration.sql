-- Add nullable workspace tenancy field for chat sessions.
-- The column remains nullable until a later task enforces workspace-aware creation/access paths.

ALTER TABLE "chat_sessions" ADD COLUMN "workspaceId" INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "chat_sessions" cs
    LEFT JOIN "workspaces" w
      ON w."ownerUserId" = cs."userId"
     AND w."type" = 'PERSONAL'
     AND w."status" = 'ACTIVE'
    WHERE w."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot backfill chat session workspaces: a session owner is missing an active PERSONAL workspace.';
  END IF;
END $$;

UPDATE "chat_sessions" cs
SET "workspaceId" = w."id"
FROM "workspaces" w
WHERE cs."userId" = w."ownerUserId"
  AND w."type" = 'PERSONAL'
  AND w."status" = 'ACTIVE'
  AND cs."workspaceId" IS NULL;

CREATE INDEX "chat_sessions_workspaceId_idx" ON "chat_sessions"("workspaceId");

ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
