import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    reporter: ['verbose', 'json'],
    outputFile: {
      json: './test-results/e2e-results.json'
    }
  },
  define: {
    'process.env.CLOUD_CODE_WORKER_URL': JSON.stringify(
      process.env.CLOUD_CODE_WORKER_URL || 'https://cloud-code.finhub.workers.dev'
    )
  }
});
