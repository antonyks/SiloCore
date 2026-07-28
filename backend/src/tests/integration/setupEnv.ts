import { getIntegrationDatabaseUrl } from './helpers/database';

process.env.DATABASE_URL = getIntegrationDatabaseUrl();
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'integration-test-jwt-secret';
process.env.OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'integration-test-model';
process.env.NODE_ENV = 'test';
