import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const adminRoot = __dirname
const runtimeEntry = process.env.MOVSCRIPT_ADMIN_RUNTIME_ENTRY
const runtimeModule = runtimeEntry
  ? resolve(adminRoot, runtimeEntry)
  : resolve(adminRoot, 'src/runtime/community.tsx')
const runtimeSourceRoot = process.env.MOVSCRIPT_RUNTIME_SOURCE_ROOT
  ? resolve(adminRoot, process.env.MOVSCRIPT_RUNTIME_SOURCE_ROOT).replace(/\\/g, '/').replace(/\/$/, '')
  : undefined
const uiBusinessAliases = {
  '@movscript/ui/business/agent': resolve(adminRoot, '../../packages/ui/src/business/agent.ts'),
  '@movscript/ui/business/app': resolve(adminRoot, '../../packages/ui/src/business/app.ts'),
  '@movscript/ui/business/canvas': resolve(adminRoot, '../../packages/ui/src/business/canvas.ts'),
  '@movscript/ui/business/generation': resolve(adminRoot, '../../packages/ui/src/business/generation.ts'),
  '@movscript/ui/business/resource': resolve(adminRoot, '../../packages/ui/src/business/resource.ts'),
  '@movscript/ui/business/review': resolve(adminRoot, '../../packages/ui/src/business/review.ts'),
  '@movscript/ui/business/workbench': resolve(adminRoot, '../../packages/ui/src/business/workbench.ts'),
}
const uiStyleAliases = {
  '@movscript/ui/styles/base.css': resolve(adminRoot, '../../packages/ui/src/styles/base.css'),
  '@movscript/ui/styles/semantic.css': resolve(adminRoot, '../../packages/ui/src/styles/semantic.css'),
  '@movscript/ui/styles/primitives.css': resolve(adminRoot, '../../packages/ui/src/styles/primitives.css'),
  '@movscript/ui/styles/layout.css': resolve(adminRoot, '../../packages/ui/src/styles/layout.css'),
  '@movscript/ui/styles/business/agent.css': resolve(adminRoot, '../../packages/ui/src/styles/business/agent.css'),
  '@movscript/ui/styles/business/app.css': resolve(adminRoot, '../../packages/ui/src/styles/business/app.css'),
  '@movscript/ui/styles/business/canvas.css': resolve(adminRoot, '../../packages/ui/src/styles/business/canvas.css'),
  '@movscript/ui/styles/business/generation.css': resolve(adminRoot, '../../packages/ui/src/styles/business/generation.css'),
  '@movscript/ui/styles/business/resource.css': resolve(adminRoot, '../../packages/ui/src/styles/business/resource.css'),
  '@movscript/ui/styles/business/review.css': resolve(adminRoot, '../../packages/ui/src/styles/business/review.css'),
  '@movscript/ui/styles/business/workbench.css': resolve(adminRoot, '../../packages/ui/src/styles/business/workbench.css'),
}

const alias = {
  '@movscript/core/workspace': resolve(adminRoot, '../../packages/core/src/workspace/index.ts'),
  '@movscript/core/mcp': resolve(adminRoot, '../../packages/core/src/mcp/index.ts'),
  '@movscript/core/backend': resolve(adminRoot, '../../packages/core/src/backend/index.ts'),
  '@movscript/core/plugins': resolve(adminRoot, '../../packages/core/src/plugins/index.ts'),
  '@movscript/theme/theme.css': resolve(adminRoot, '../../packages/theme/src/theme.css'),
  '@movscript/ui/style-system': resolve(adminRoot, '../../packages/ui/src/style-system.ts'),
  '@movscript/ui/primitives': resolve(adminRoot, '../../packages/ui/src/primitives.ts'),
  '@movscript/ui/layout': resolve(adminRoot, '../../packages/ui/src/layout.ts'),
  '@movscript/ui/debug': resolve(adminRoot, '../../packages/ui/src/debug-entry.ts'),
  ...uiBusinessAliases,
  ...uiStyleAliases,
  '@movscript/theme': resolve(adminRoot, '../../packages/theme/src/index.ts'),
  '@movscript/ui': resolve(adminRoot, '../../packages/ui/src/index.ts'),
  '@': resolve(adminRoot, 'src'),
  '@admin': resolve(adminRoot, 'src'),
  '@admin-runtime': runtimeModule,
}

function isAliasSource(source: string) {
  return Object.keys(alias).some((key) => source === key || source.startsWith(`${key}/`))
}

function runtimeSourceResolver(): Plugin {
  return {
    name: 'movscript-admin-runtime-source-resolver',
    async resolveId(source, importer, options) {
      if (!runtimeSourceRoot || !importer || source.startsWith('\0') || isAliasSource(source)) return null

      const normalizedImporter = importer.split('?')[0].replace(/\\/g, '/')
      if (!normalizedImporter.startsWith(`${runtimeSourceRoot}/`)) return null

      const relativeImporter = normalizedImporter.slice(runtimeSourceRoot.length + 1)
      const worktreeImporter = resolve(adminRoot, '../..', relativeImporter)
      return this.resolve(source, worktreeImporter, { ...options, skipSelf: true })
    },
  }
}

export default defineConfig({
  base: process.env.MOVSCRIPT_ADMIN_BASE ?? '/',
  plugins: [runtimeSourceResolver(), react()],
  resolve: {
    alias,
  },
})
