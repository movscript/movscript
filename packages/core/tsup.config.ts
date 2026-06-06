import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/workspace/index.ts',
    'src/workspace/node/index.ts',
    'src/mcp/index.ts',
    'src/mcp/node/index.ts',
    'src/backend/index.ts',
    'src/backend/node/index.ts',
    'src/plugins/index.ts',
    'src/plugins/node/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
})
