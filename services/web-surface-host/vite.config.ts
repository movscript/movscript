import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const serviceRoot = __dirname
const adminRoot = resolve(serviceRoot, '../../surface/admin')
const uiBusinessAliases = {
  '@movscript/ui/business/agent': resolve(serviceRoot, '../../packages/ui/src/business/agent.ts'),
  '@movscript/ui/business/app': resolve(serviceRoot, '../../packages/ui/src/business/app.ts'),
  '@movscript/ui/business/canvas': resolve(serviceRoot, '../../packages/ui/src/business/canvas.ts'),
  '@movscript/ui/business/generation': resolve(serviceRoot, '../../packages/ui/src/business/generation.ts'),
  '@movscript/ui/business/resource': resolve(serviceRoot, '../../packages/ui/src/business/resource.ts'),
  '@movscript/ui/business/review': resolve(serviceRoot, '../../packages/ui/src/business/review.ts'),
  '@movscript/ui/business/workbench': resolve(serviceRoot, '../../packages/ui/src/business/workbench.ts'),
}
const uiStyleAliases = {
  '@movscript/ui/styles/base.css': resolve(serviceRoot, '../../packages/ui/src/styles/base.css'),
  '@movscript/ui/styles/primitives.css': resolve(serviceRoot, '../../packages/ui/src/styles/primitives.css'),
  '@movscript/ui/styles/semantic.css': resolve(serviceRoot, '../../packages/ui/src/styles/semantic.css'),
  '@movscript/ui/styles/layout.css': resolve(serviceRoot, '../../packages/ui/src/styles/layout.css'),
  '@movscript/ui/styles/business/agent.css': resolve(serviceRoot, '../../packages/ui/src/styles/business/agent.css'),
  '@movscript/ui/styles/business/app.css': resolve(serviceRoot, '../../packages/ui/src/styles/business/app.css'),
  '@movscript/ui/styles/business/canvas.css': resolve(serviceRoot, '../../packages/ui/src/styles/business/canvas.css'),
  '@movscript/ui/styles/business/generation.css': resolve(serviceRoot, '../../packages/ui/src/styles/business/generation.css'),
  '@movscript/ui/styles/business/resource.css': resolve(serviceRoot, '../../packages/ui/src/styles/business/resource.css'),
  '@movscript/ui/styles/business/review.css': resolve(serviceRoot, '../../packages/ui/src/styles/business/review.css'),
  '@movscript/ui/styles/business/workbench.css': resolve(serviceRoot, '../../packages/ui/src/styles/business/workbench.css'),
}

export default defineConfig({
  base: process.env.MOVSCRIPT_WEB_SURFACE_HOST_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@movscript/admin-surface/app': resolve(adminRoot, 'src/main.tsx'),
      '@movscript/admin-surface': resolve(serviceRoot, '../../surface/admin/src/index.ts'),
      '@movscript/project-surface/react': resolve(serviceRoot, '../../surface/project/src/react.ts'),
      '@movscript/project-surface/runtime': resolve(serviceRoot, '../../surface/project/src/runtime.ts'),
      '@movscript/project-surface': resolve(serviceRoot, '../../surface/project/src/index.ts'),
      '@movscript/resource-surface/resource-browser': resolve(serviceRoot, '../../surface/resource/src/resource-browser.ts'),
      '@movscript/resource-surface/react': resolve(serviceRoot, '../../surface/resource/src/react.ts'),
      '@movscript/resource-surface': resolve(serviceRoot, '../../surface/resource/src/index.ts'),
      '@movscript/core/workspace': resolve(serviceRoot, '../../packages/core/src/workspace/index.ts'),
      '@movscript/core/mcp': resolve(serviceRoot, '../../packages/core/src/mcp/index.ts'),
      '@movscript/core/backend': resolve(serviceRoot, '../../packages/core/src/backend/index.ts'),
      '@movscript/core/plugins': resolve(serviceRoot, '../../packages/core/src/plugins/index.ts'),
      '@movscript/theme/theme.css': resolve(serviceRoot, '../../packages/theme/src/theme.css'),
      '@movscript/theme': resolve(serviceRoot, '../../packages/theme/src/index.ts'),
      '@movscript/ui/style-system': resolve(serviceRoot, '../../packages/ui/src/style-system.ts'),
      '@movscript/ui/primitives': resolve(serviceRoot, '../../packages/ui/src/primitives.ts'),
      '@movscript/ui/layout': resolve(serviceRoot, '../../packages/ui/src/layout.ts'),
      '@movscript/ui/debug': resolve(serviceRoot, '../../packages/ui/src/debug-entry.ts'),
      ...uiBusinessAliases,
      ...uiStyleAliases,
      '@movscript/ui': resolve(serviceRoot, '../../packages/ui/src/index.ts'),
      '@admin-runtime': resolve(adminRoot, 'src/runtime/community.tsx'),
      '@admin': resolve(adminRoot, 'src'),
      '@': resolve(adminRoot, 'src'),
    },
  },
})
