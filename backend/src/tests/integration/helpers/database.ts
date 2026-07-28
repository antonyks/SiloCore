import { execFileSync } from 'node:child_process';
import { Client } from 'pg';

const TEST_DATABASE_NAME_PATTERN = /test/i;

export function getIntegrationDatabaseUrl(): string {
  const databaseUrl = process.env.INTEGRATION_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('INTEGRATION_DATABASE_URL is required for backend integration tests.');
  }

  assertSafeIntegrationDatabaseUrl(databaseUrl);
  return databaseUrl;
}

export function assertSafeIntegrationDatabaseUrl(databaseUrl: string): void {
  const parsed = new URL(databaseUrl);
  const databaseName = getDatabaseName(parsed);

  if (!TEST_DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new Error(
      `Refusing to use integration database "${databaseName}". The database name must include "test".`,
    );
  }
}

export function getMaintenanceDatabaseUrl(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  const databaseName = getDatabaseName(parsed);
  parsed.pathname = databaseName === 'postgres' ? '/template1' : '/postgres';
  return parsed.toString();
}

export async function recreateIntegrationDatabase(databaseUrl: string): Promise<void> {
  assertSafeIntegrationDatabaseUrl(databaseUrl);

  const databaseName = getDatabaseName(new URL(databaseUrl));
  const client = new Client({ connectionString: getMaintenanceDatabaseUrl(databaseUrl) });

  await client.connect();

  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } finally {
    await client.end();
  }
}

export async function dropIntegrationDatabase(databaseUrl: string): Promise<void> {
  assertSafeIntegrationDatabaseUrl(databaseUrl);

  const databaseName = getDatabaseName(new URL(databaseUrl));
  const client = new Client({ connectionString: getMaintenanceDatabaseUrl(databaseUrl) });

  await client.connect();

  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
  } finally {
    await client.end();
  }
}

export function applyPrismaMigrations(databaseUrl: string): void {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: 'inherit',
  });
}

function getDatabaseName(databaseUrl: URL): string {
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ''));

  if (!databaseName) {
    throw new Error('INTEGRATION_DATABASE_URL must include a database name.');
  }

  return databaseName;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
