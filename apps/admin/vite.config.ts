import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const runtimeEntry = process.env.MOVSCRIPT_ADMIN_RUNTIME_ENTRY
const runtimeModule = runtimeEntry
  ? resolve(__dirname, runtimeEntry)
  : resolve(__dirname, 'src/runtime/community.tsx')

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  resolve: {
    alias: {
      '@movscript/core/workspace': resolve(__dirname, '../../packages/core/src/workspace/index.ts'),
      '@movscript/core/mcp': resolve(__dirname, '../../packages/core/src/mcp/index.ts'),
      '@movscript/core/backend': resolve(__dirname, '../../packages/core/src/backend/index.ts'),
      '@movscript/core/plugins': resolve(__dirname, '../../packages/core/src/plugins/index.ts'),
      '@movscript/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@movscript/theme/theme.css': resolve(__dirname, '../../packages/theme/src/theme.css'),
      '@movscript/ui/styles.css': resolve(__dirname, '../../packages/ui/src/styles.css'),
      '@movscript/theme': resolve(__dirname, '../../packages/theme/src/index.ts'),
      '@movscript/ui': resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@': resolve(__dirname, 'src'),
      '@admin': resolve(__dirname, 'src'),
      '@admin-runtime': runtimeModule,
    },
  },
})
