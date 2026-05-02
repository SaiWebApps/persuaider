/**
 * Jest E2E Setup File
 * 
 * This file runs before each test file in the E2E test suite.
 * It configures global settings and ensures proper cleanup.
 */

// Extend Jest timeout for slow network/rendering operations
jest.setTimeout(30000);

// Add custom matchers or global setup here if needed
beforeAll(() => {
  // Ensure ChromeDriver is available
  process.env.PATH = `${process.env.PATH}:./node_modules/.bin`;
});

afterAll(() => {
  // Global cleanup if needed
});
