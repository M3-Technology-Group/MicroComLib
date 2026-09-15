import { defineConfig } from 'tsup';

import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  platform: 'browser',
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  define: {
    __MICROCOMLIB_VERSION__: JSON.stringify(pkg.version),
  },
});
