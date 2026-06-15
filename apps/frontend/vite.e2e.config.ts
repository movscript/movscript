import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const uiBusinessAliases = {
  '@movscript/ui/business/agent': resolve('../../packages/ui/src/business/agent.ts'),
  '@movscript/ui/business/app': resolve('../../packages/ui/src/business/app.ts'),
  '@movscript/ui/business/canvas': resolve('../../packages/ui/src/business/canvas.ts'),
  '@movscript/ui/business/generation': resolve('../../packages/ui/src/business/generation.ts'),
  '@movscript/ui/business/jobs': resolve('../../packages/ui/src/business/jobs.ts'),
  '@movscript/ui/business/resource': resolve('../../packages/ui/src/business/resource.ts'),
  '@movscript/ui/business/review': resolve('../../packages/ui/src/business/review.ts'),
  '@movscript/ui/business/scripts': resolve('../../packages/ui/src/business/scripts.ts'),
  '@movscript/ui/business/workbench': resolve('../../packages/ui/src/business/workbench.ts'),
}
const uiStyleAliases = {
  '@movscript/ui/styles/base.css': resolve('../../packages/ui/src/styles/base.css'),
  '@movscript/ui/styles/semantic.css': resolve('../../packages/ui/src/styles/semantic.css'),
  '@movscript/ui/styles/primitives.css': resolve('../../packages/ui/src/styles/primitives.css'),
  '@movscript/ui/styles/layout.css': resolve('../../packages/ui/src/styles/layout.css'),
  '@movscript/ui/styles/business/agent.css': resolve('../../packages/ui/src/styles/business/agent.css'),
  '@movscript/ui/styles/business/app.css': resolve('../../packages/ui/src/styles/business/app.css'),
  '@movscript/ui/styles/business/canvas.css': resolve('../../packages/ui/src/styles/business/canvas.css'),
  '@movscript/ui/styles/business/generation.css': resolve('../../packages/ui/src/styles/business/generation.css'),
  '@movscript/ui/styles/business/jobs.css': resolve('../../packages/ui/src/styles/business/jobs.css'),
  '@movscript/ui/styles/business/resource.css': resolve('../../packages/ui/src/styles/business/resource.css'),
  '@movscript/ui/styles/business/review.css': resolve('../../packages/ui/src/styles/business/review.css'),
  '@movscript/ui/styles/business/scripts.css': resolve('../../packages/ui/src/styles/business/scripts.css'),
  '@movscript/ui/styles/business/workbench.css': resolve('../../packages/ui/src/styles/business/workbench.css'),
}

const alias = {
  '@movscript/core/workspace': resolve('../../packages/core/src/workspace/index.ts'),
  '@movscript/core/mcp': resolve('../../packages/core/src/mcp/index.ts'),
  '@movscript/core/backend': resolve('../../packages/core/src/backend/index.ts'),
  '@movscript/core/plugins': resolve('../../packages/core/src/plugins/index.ts'),
  '@movscript/theme/theme.css': resolve('../../packages/theme/src/theme.css'),
  '@movscript/ui/style-system': resolve('../../packages/ui/src/style-system.ts'),
  '@movscript/ui/semantic': resolve('../../packages/ui/src/semantic.ts'),
  '@movscript/ui/primitives': resolve('../../packages/ui/src/primitives.ts'),
  '@movscript/ui/layout': resolve('../../packages/ui/src/layout.ts'),
  '@movscript/ui/debug': resolve('../../packages/ui/src/debug-entry.ts'),
  ...uiBusinessAliases,
  ...uiStyleAliases,
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
