import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const alias = {
  '@movscript/core/workspace': resolve('../../packages/core/src/workspace/index.ts'),
  '@movscript/core/mcp': resolve('../../packages/core/src/mcp/index.ts'),
  '@movscript/core/backend': resolve('../../packages/core/src/backend/index.ts'),
  '@movscript/core/plugins': resolve('../../packages/core/src/plugins/index.ts'),
  '@movscript/theme/theme.css': resolve('../../packages/theme/src/theme.css'),
  '@movscript/ui/styles.css': resolve('../../packages/ui/src/styles.css'),
  '@movscript/ui/style-system': resolve('../../packages/ui/src/style-system.ts'),
  '@movscript/theme': resolve('../../packages/theme/src/index.ts'),
  '@movscript/ui': resolve('../../packages/ui/src/index.ts'),
  '@runtime': process.env.MOVSCRIPT_FRONTEND_RUNTIME_ENTRY
    ? resolve(process.env.MOVSCRIPT_FRONTEND_RUNTIME_ENTRY)
    : resolve('src/runtime/community.tsx'),
  '@': resolve('src'),
}

const ignoredMovScriptRuntimeWatchPaths = [
  '**/.movscript/**/.tmp/**',
  '**/.movscript-dev/**/.movscript/**/.tmp/**',
]

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: ignoredMovScriptRuntimeWatchPaths,
    },
  },
  resolve: {
    alias,
  },
})
