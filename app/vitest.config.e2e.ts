import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Aísla los e2e del app/.env local (ver test/support/isolate-env.ts).
    setupFiles: ['./test/support/isolate-env.ts'],
  },
});
