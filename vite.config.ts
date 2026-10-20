/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/job-hunter-pages/',
  plugins: [react()],
  cacheDir: '.vite',
  server: { host: '127.0.0.1', port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts', 'supabase/functions/**/*.ts'],
      // Must stay in sync with sonar.coverage.exclusions in sonar-project.properties.
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__fixtures__/**',
        'src/test-setup.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'scripts/**/*.test.ts',
        'scripts/**/__fixtures__/**',
        'scripts/*.ts',
        'scripts/admin/*.ts',
        'supabase/functions/**/*.test.ts',
        'supabase/functions/**/__fixtures__/**',
        'supabase/functions/**/index.ts',
      ],
      reporter: ['lcov', 'text-summary', 'text'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
