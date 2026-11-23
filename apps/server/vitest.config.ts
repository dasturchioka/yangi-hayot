import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Starts one PostgreSQL container (Testcontainers) for the whole run and
    // prepares a migrated template database. Every test file clones it.
    globalSetup: ['test/support/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
