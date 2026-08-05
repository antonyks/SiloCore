-- Require every chat session to belong to a workspace.
-- Fail rather than guessing if any rows escaped the earlier backfill.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "chat_sessions"
    WHERE "workspaceId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot require chat session workspaceId: NULL chat session workspaceId values remain.';
  END IF;
END $$;

ALTER TABLE "chat_sessions" ALTER COLUMN "workspaceId" SET NOT NULL;
