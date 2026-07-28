import { dropIntegrationDatabase, getIntegrationDatabaseUrl } from './helpers/database';

export default async function globalTeardown(): Promise<void> {
  if (process.env.KEEP_INTEGRATION_DATABASE === '1') {
    return;
  }

  await dropIntegrationDatabase(getIntegrationDatabaseUrl());
}
