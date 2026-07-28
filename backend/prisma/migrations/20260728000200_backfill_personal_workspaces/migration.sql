-- Backfill one PERSONAL workspace and one active OWNER membership for every existing user.
-- This migration is intentionally idempotent so it can be safely re-applied in seed-like flows.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "workspaces" w
    JOIN "workspace_memberships" wm
      ON wm."workspaceId" = w."id"
    WHERE w."type" = 'PERSONAL'
      AND wm."role" = 'OWNER'
      AND wm."status" = 'ACTIVE'
      AND wm."userId" <> w."ownerUserId"
  ) THEN
    RAISE EXCEPTION 'Cannot backfill personal workspaces: active OWNER membership does not match canonical owner.';
  END IF;
END $$;

INSERT INTO "workspaces" ("name", "type", "status", "ownerUserId", "createdAt", "updatedAt")
SELECT
  'Personal Workspace',
  'PERSONAL',
  'ACTIVE',
  u."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1
  FROM "workspaces" w
  WHERE w."ownerUserId" = u."id"
    AND w."type" = 'PERSONAL'
);

UPDATE "workspaces"
SET
  "status" = 'ACTIVE',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "type" = 'PERSONAL'
  AND "status" <> 'ACTIVE';

UPDATE "workspace_memberships" wm
SET
  "role" = 'OWNER',
  "status" = 'ACTIVE',
  "updatedAt" = CURRENT_TIMESTAMP
FROM "workspaces" w
WHERE wm."workspaceId" = w."id"
  AND wm."userId" = w."ownerUserId"
  AND w."type" = 'PERSONAL'
  AND (
    wm."role" <> 'OWNER'
    OR wm."status" <> 'ACTIVE'
  );

INSERT INTO "workspace_memberships" (
  "workspaceId",
  "userId",
  "role",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  w."id",
  w."ownerUserId",
  'OWNER',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "workspaces" w
WHERE w."type" = 'PERSONAL'
  AND NOT EXISTS (
    SELECT 1
    FROM "workspace_memberships" wm
    WHERE wm."workspaceId" = w."id"
      AND wm."userId" = w."ownerUserId"
  );
