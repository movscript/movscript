import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const alias = {
  '@movscript/workspaces/node': resolve('../../packages/workspaces/src/node.ts'),
  '@movscript/workspaces': resolve('../../packages/workspaces/src/index.ts'),
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

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias,
  },
})
