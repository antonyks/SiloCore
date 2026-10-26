-- An enabled provider can hold the single effective default. Keep the source
-- alongside the flag so administrators can distinguish their choice from an
-- automatic selection.
CREATE TYPE "LlmDefaultSource" AS ENUM ('ADMIN', 'AUTO');
CREATE TYPE "LlmDefaultSwitchReason" AS ENUM (
  'INITIAL_SELECTION', 'PROVIDER_DISABLED', 'PROVIDER_DELETED', 'AVAILABILITY_FAILURE'
);

ALTER TABLE "llm_provider_configs"
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "defaultSource" "LlmDefaultSource";

ALTER TABLE "llm_provider_configs"
  ADD CONSTRAINT "llm_provider_configs_default_state_check"
  CHECK (
    ("isDefault" = false AND "defaultSource" IS NULL)
    OR ("isDefault" = true AND "defaultSource" IS NOT NULL
      AND "enabled" = true AND "deletedAt" IS NULL)
  );

CREATE UNIQUE INDEX "llm_provider_configs_one_default_idx"
  ON "llm_provider_configs" ("isDefault") WHERE "isDefault" = true;

CREATE TABLE "llm_default_provider_switches" (
  "id" SERIAL NOT NULL,
  "oldProviderId" INTEGER,
  "newProviderId" INTEGER NOT NULL,
  "reason" "LlmDefaultSwitchReason" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "llm_default_provider_switches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "llm_default_provider_switches_createdAt_idx"
  ON "llm_default_provider_switches" ("createdAt");
CREATE INDEX "llm_default_provider_switches_newProviderId_createdAt_idx"
  ON "llm_default_provider_switches" ("newProviderId", "createdAt");

ALTER TABLE "llm_default_provider_switches"
  ADD CONSTRAINT "llm_default_provider_switches_oldProviderId_fkey"
  FOREIGN KEY ("oldProviderId") REFERENCES "llm_provider_configs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "llm_default_provider_switches"
  ADD CONSTRAINT "llm_default_provider_switches_newProviderId_fkey"
  FOREIGN KEY ("newProviderId") REFERENCES "llm_provider_configs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve current behaviour for existing installations until an admin picks
-- a provider. Tie timestamps by ID so all API instances agree.
WITH first_provider AS (
  SELECT "id" FROM "llm_provider_configs"
  WHERE "enabled" = true AND "deletedAt" IS NULL
  ORDER BY "createdAt" ASC, "id" ASC LIMIT 1
), selected AS (
  UPDATE "llm_provider_configs" AS provider
  SET "isDefault" = true, "defaultSource" = 'AUTO'
  FROM first_provider
  WHERE provider."id" = first_provider."id"
  RETURNING provider."id"
)
INSERT INTO "llm_default_provider_switches" ("oldProviderId", "newProviderId", "reason")
SELECT NULL, "id", 'INITIAL_SELECTION' FROM selected;
