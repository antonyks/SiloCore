import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { getIntegrationDatabaseUrl } from '../helpers/database';

const migrationSql = readFileSync(
  join(process.cwd(), 'prisma/migrations/20261026000200_session_title_usage_schema/migration.sql'),
  'utf8',
);

describe('Session title and usage migration', () => {
  it('classifies historical titles and usage while preserving future defaults', async () => {
    const client = new Client({ connectionString: getIntegrationDatabaseUrl() });
    await client.connect();

    try {
      await client.query('BEGIN');
      await client.query('CREATE SCHEMA session_title_migration_fixture');
      await client.query('SET LOCAL search_path TO session_title_migration_fixture');
      await client.query(`
        CREATE TYPE "JobStatus" AS ENUM (
          'QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'CANCELLED', 'SUCCEEDED', 'FAILED'
        );
        CREATE TABLE "chat_sessions" ("id" SERIAL PRIMARY KEY, "title" TEXT NOT NULL);
        CREATE TABLE "chat_messages" ("id" SERIAL PRIMARY KEY);
        CREATE TABLE "generation_usages" (
          "id" SERIAL PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE "jobs" (
          "workspaceId" INTEGER NOT NULL, "type" TEXT NOT NULL,
          "status" "JobStatus" NOT NULL, "payload" JSONB NOT NULL DEFAULT '{}'
        );
        INSERT INTO "chat_sessions" ("title") VALUES ('New Chat'), ('Named Chat'), ('new chat');
        INSERT INTO "generation_usages" DEFAULT VALUES;
      `);

      await client.query(migrationSql);

      const sessions = await client.query<{
        title: string;
        titleSource: string;
        latestEligibleAssistantMessageId: number | null;
        latestAttemptedAssistantMessageId: number | null;
      }>(`
        SELECT "title", "titleSource", "latestEligibleAssistantMessageId",
          "latestAttemptedAssistantMessageId"
        FROM "chat_sessions" ORDER BY "id"
      `);
      expect(sessions.rows).toEqual([
        {
          title: 'New Chat', titleSource: 'PLACEHOLDER',
          latestEligibleAssistantMessageId: null, latestAttemptedAssistantMessageId: null,
        },
        {
          title: 'Named Chat', titleSource: 'USER',
          latestEligibleAssistantMessageId: null, latestAttemptedAssistantMessageId: null,
        },
        {
          title: 'new chat', titleSource: 'USER',
          latestEligibleAssistantMessageId: null, latestAttemptedAssistantMessageId: null,
        },
      ]);

      const usage = await client.query<{ operation: string }>(
        'SELECT "operation" FROM "generation_usages"',
      );
      expect(usage.rows).toEqual([{ operation: 'CHAT_REPLY' }]);

      const newSession = await client.query<{ titleSource: string }>(`
        INSERT INTO "chat_sessions" ("title") VALUES ('New Chat') RETURNING "titleSource"
      `);
      expect(newSession.rows).toEqual([{ titleSource: 'USER' }]);

      const indexes = await client.query<{ indexname: string }>(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'session_title_migration_fixture'
      `);
      expect(indexes.rows.map((row) => row.indexname)).toEqual(expect.arrayContaining([
        'chat_sessions_title_eligibility_idx',
        'jobs_title_active_session_lookup_idx',
        'generation_usages_operation_createdAt_idx',
      ]));
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});
