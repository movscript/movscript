import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'node20',
  noExternal: [/^@movscript\//],
  external: ['commander'],
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
  banner: { js: '#!/usr/bin/env node' },
  dts: true,
  clean: true,
})
