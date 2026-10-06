/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  // Live network contract tests run only via `npm run test:live`.
  testPathIgnorePatterns: ['/node_modules/', '\\.live\\.test\\.ts$'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/**/__tests__/**'],
};
