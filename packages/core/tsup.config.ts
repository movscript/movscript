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
    'src/canvas/index.ts',
    'src/content/index.ts',
    'src/content/node.ts',
    'src/generation/index.ts',
    'src/production/index.ts',
    'src/resources/index.ts',
    'src/shot-library/index.ts',
    'src/shared/index.ts',
    'src/plugins/index.ts',
    'src/plugins/node/index.ts',
    'src/agent/index.ts',
    'src/agent/chat/index.ts',
    'src/agent/protocol.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
})
