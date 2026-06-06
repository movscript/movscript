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
      '@movscript/workspaces/node': resolve(__dirname, '../../packages/workspaces/src/node.ts'),
      '@movscript/workspaces': resolve(__dirname, '../../packages/workspaces/src/index.ts'),
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
