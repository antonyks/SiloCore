-- CreateEnum
CREATE TYPE "LlmProviderConfigType" AS ENUM ('OLLAMA', 'OPENAI_COMPATIBLE');

-- CreateTable
CREATE TABLE "llm_provider_configs" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LlmProviderConfigType" NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultModel" TEXT NOT NULL,
    "timeoutMs" INTEGER,
    "extraHeaders" JSONB DEFAULT '{}',
    "apiKey" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_provider_configs_enabled_idx" ON "llm_provider_configs"("enabled");

-- CreateIndex
CREATE INDEX "llm_provider_configs_deletedAt_idx" ON "llm_provider_configs"("deletedAt");
