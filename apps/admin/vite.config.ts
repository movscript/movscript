import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const runtimeEntry = process.env.MOVSCRIPT_ADMIN_RUNTIME_ENTRY
const runtimeModule = runtimeEntry
  ? resolve(__dirname, runtimeEntry)
  : resolve(__dirname, 'src/runtime/community.tsx')
const uiBusinessAliases = {
  '@movscript/ui/business/agent': resolve(__dirname, '../../packages/ui/src/business/agent.ts'),
  '@movscript/ui/business/app': resolve(__dirname, '../../packages/ui/src/business/app.ts'),
  '@movscript/ui/business/canvas': resolve(__dirname, '../../packages/ui/src/business/canvas.ts'),
  '@movscript/ui/business/generation': resolve(__dirname, '../../packages/ui/src/business/generation.ts'),
  '@movscript/ui/business/jobs': resolve(__dirname, '../../packages/ui/src/business/jobs.ts'),
  '@movscript/ui/business/resource': resolve(__dirname, '../../packages/ui/src/business/resource.ts'),
  '@movscript/ui/business/review': resolve(__dirname, '../../packages/ui/src/business/review.ts'),
  '@movscript/ui/business/scripts': resolve(__dirname, '../../packages/ui/src/business/scripts.ts'),
  '@movscript/ui/business/workbench': resolve(__dirname, '../../packages/ui/src/business/workbench.ts'),
}
const uiStyleAliases = {
  '@movscript/ui/styles/base.css': resolve(__dirname, '../../packages/ui/src/styles/base.css'),
  '@movscript/ui/styles/semantic.css': resolve(__dirname, '../../packages/ui/src/styles/semantic.css'),
  '@movscript/ui/styles/primitives.css': resolve(__dirname, '../../packages/ui/src/styles/primitives.css'),
  '@movscript/ui/styles/layout.css': resolve(__dirname, '../../packages/ui/src/styles/layout.css'),
  '@movscript/ui/styles/business/agent.css': resolve(__dirname, '../../packages/ui/src/styles/business/agent.css'),
  '@movscript/ui/styles/business/app.css': resolve(__dirname, '../../packages/ui/src/styles/business/app.css'),
  '@movscript/ui/styles/business/canvas.css': resolve(__dirname, '../../packages/ui/src/styles/business/canvas.css'),
  '@movscript/ui/styles/business/generation.css': resolve(__dirname, '../../packages/ui/src/styles/business/generation.css'),
  '@movscript/ui/styles/business/jobs.css': resolve(__dirname, '../../packages/ui/src/styles/business/jobs.css'),
  '@movscript/ui/styles/business/resource.css': resolve(__dirname, '../../packages/ui/src/styles/business/resource.css'),
  '@movscript/ui/styles/business/review.css': resolve(__dirname, '../../packages/ui/src/styles/business/review.css'),
  '@movscript/ui/styles/business/scripts.css': resolve(__dirname, '../../packages/ui/src/styles/business/scripts.css'),
  '@movscript/ui/styles/business/workbench.css': resolve(__dirname, '../../packages/ui/src/styles/business/workbench.css'),
}

export default defineConfig({
  base: process.env.MOVSCRIPT_ADMIN_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@movscript/core/workspace': resolve(__dirname, '../../packages/core/src/workspace/index.ts'),
      '@movscript/core/mcp': resolve(__dirname, '../../packages/core/src/mcp/index.ts'),
      '@movscript/core/backend': resolve(__dirname, '../../packages/core/src/backend/index.ts'),
      '@movscript/core/plugins': resolve(__dirname, '../../packages/core/src/plugins/index.ts'),
      '@movscript/theme/theme.css': resolve(__dirname, '../../packages/theme/src/theme.css'),
      '@movscript/ui/style-system': resolve(__dirname, '../../packages/ui/src/style-system.ts'),
      '@movscript/ui/primitives': resolve(__dirname, '../../packages/ui/src/primitives.ts'),
      '@movscript/ui/layout': resolve(__dirname, '../../packages/ui/src/layout.ts'),
      '@movscript/ui/debug': resolve(__dirname, '../../packages/ui/src/debug-entry.ts'),
      ...uiBusinessAliases,
      ...uiStyleAliases,
      '@movscript/theme': resolve(__dirname, '../../packages/theme/src/index.ts'),
      '@movscript/ui': resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@': resolve(__dirname, 'src'),
      '@admin': resolve(__dirname, 'src'),
      '@admin-runtime': runtimeModule,
    },
  },
})
