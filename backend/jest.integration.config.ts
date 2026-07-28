import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/tests/integration'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  coverageDirectory: 'coverage-integration',
  globalSetup: '<rootDir>/src/tests/integration/globalSetup.ts',
  globalTeardown: '<rootDir>/src/tests/integration/globalTeardown.ts',
  setupFiles: ['<rootDir>/src/tests/integration/setupEnv.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/tests/integration/setupAfterEnv.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  verbose: true,
};

export default config;
