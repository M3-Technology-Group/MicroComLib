import { defineConfig } from 'vitest/config';

import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // Kept in step with tsup.config.ts so tests see the same VERSION the build bakes in.
  define: {
    __MICROCOMLIB_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    // The CH5 bridge surface is a set of function properties on globalThis,
    // which exist under plain node. Individual tests that genuinely need
    // `document` or `window` can opt in with `// @vitest-environment happy-dom`.
    environment: 'node',
    // No implicit globals - import { describe, it, expect } from 'vitest'.
    globals: false,
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/*.d.ts'],
    },
  },
});
