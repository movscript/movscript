import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'movscript-agent-mcp': 'src/agent-mcp.ts',
  },
  outDir: 'bin',
  format: ['esm'],
  bundle: true,
  noExternal: [/@movscript\/.*/],
  external: ['readline/promises'],
  platform: 'node',
  target: 'node20',
  splitting: false,
  sourcemap: false,
  dts: false,
  clean: false,
  outExtension: () => ({ js: '.mjs' }),
  banner: {
    js: [
      '#!/usr/bin/env node',
      'import { createRequire as __movscriptCreateRequire } from "node:module";',
      'var require = __movscriptCreateRequire(import.meta.url);',
    ].join('\n'),
  },
})
