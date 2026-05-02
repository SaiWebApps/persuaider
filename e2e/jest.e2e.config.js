/** @type {import('jest').Config} */
const config = {
  // Use node environment for Selenium tests
  testEnvironment: 'node',

  // Longer timeout for E2E tests (30 seconds)
  testTimeout: 30000,

  // Only run E2E test files
  testMatch: ['<rootDir>/**/*.test.ts'],

  // Transform TypeScript files
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
    }],
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Don't apply Next.js specific transformations
  transformIgnorePatterns: [
    'node_modules/(?!(selenium-webdriver)/)',
  ],

  // Verbose output for E2E tests
  verbose: true,

  // Run tests serially (not in parallel) for E2E
  maxWorkers: 1,

  // Setup file for global setup
  setupFilesAfterEnv: ['<rootDir>/jest.e2e.setup.ts'],
};

module.exports = config;
