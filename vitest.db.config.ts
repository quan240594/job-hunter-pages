/// <reference types="vitest/config" />
// Runs the SQL tests (PGlite = Postgres in WASM, no Docker): `npm run test:db`. Separate from the unit-coverage run
// because SQL is not measured by coverage.
import { defineConfig } from 'vite';

export default defineConfig({
  cacheDir: '.vite',
  test: {
    environment: 'node',
    globals: true,
    include: ['supabase/tests/**/*.sql.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
