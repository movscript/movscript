import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  noExternal: ['@movscript/agent-runtime'],
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
})
