import {
  applyPrismaMigrations,
  getIntegrationDatabaseUrl,
  recreateIntegrationDatabase,
} from './helpers/database';

export default async function globalSetup(): Promise<void> {
  const databaseUrl = getIntegrationDatabaseUrl();

  await recreateIntegrationDatabase(databaseUrl);
  applyPrismaMigrations(databaseUrl);
}
