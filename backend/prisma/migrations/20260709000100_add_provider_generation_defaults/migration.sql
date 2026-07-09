ALTER TABLE "llm_provider_configs"
ADD COLUMN "generationDefaults" JSONB NOT NULL DEFAULT '{}';
