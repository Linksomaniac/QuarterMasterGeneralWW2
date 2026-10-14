import { defineConfig } from 'vitest/config';

// Separate config so `npm test` never runs training jobs.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['training/*.train.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
  },
});
