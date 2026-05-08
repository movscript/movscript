#!/usr/bin/env node
import { build } from 'esbuild'

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.bundle.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  banner: {
    js: "import { createRequire } from 'node:module';const require=createRequire(import.meta.url);",
  },
})
