import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import type { Plugin } from 'vite'

const coreSharedAlias = {
  '@movscript/core/agent/chat': resolve('../../packages/core/src/agent/chat/index.ts'),
  '@movscript/core/agent/protocol': resolve('../../packages/core/src/agent/protocol.ts'),
  '@movscript/core/agent': resolve('../../packages/core/src/agent/index.ts'),
  '@movscript/core/backend': resolve('../../packages/core/src/backend/index.ts'),
  '@movscript/core/canvas': resolve('../../packages/core/src/canvas/index.ts'),
  '@movscript/core/content': resolve('../../packages/core/src/content/index.ts'),
  '@movscript/core/generation': resolve('../../packages/core/src/generation/index.ts'),
  '@movscript/core/mcp': resolve('../../packages/core/src/mcp/index.ts'),
  '@movscript/core/production': resolve('../../packages/core/src/production/index.ts'),
  '@movscript/core/plugins': resolve('../../packages/core/src/plugins/index.ts'),
  '@movscript/core/resources': resolve('../../packages/core/src/resources/index.ts'),
  '@movscript/core/shared': resolve('../../packages/core/src/shared/index.ts'),
  '@movscript/core/shot-library': resolve('../../packages/core/src/shot-library/index.ts'),
  '@movscript/core/workspace': resolve('../../packages/core/src/workspace/index.ts'),
}

const coreNodeAlias = {
  '@movscript/core/workspace/node': resolve('../../packages/core/src/workspace/node/index.ts'),
  '@movscript/core/mcp/node': resolve('../../packages/core/src/mcp/node/index.ts'),
  '@movscript/core/backend/node': resolve('../../packages/core/src/backend/node/index.ts'),
  '@movscript/core/plugins/node': resolve('../../packages/core/src/plugins/node/index.ts'),
}

const workspaceSharedAlias = {
  '@movscript/workspace/indexer': resolve('../../packages/workspace/src/indexer/index.ts'),
  '@movscript/workspace/layout': resolve('../../packages/workspace/src/layout/index.ts'),
  '@movscript/workspace/repository': resolve('../../packages/workspace/src/repository/index.ts'),
  '@movscript/workspace': resolve('../../packages/workspace/src/index.ts'),
}

const workspaceNodeAlias = {
  '@movscript/workspace/node': resolve('../../packages/workspace/src/node.ts'),
}

const packageSharedAlias = {
  '@movscript/editing': resolve('../../packages/editing/src/index.ts'),
  '@movscript/language/domain': resolve('../../packages/language/src/domain/index.ts'),
  '@movscript/interpreter/artifacts': resolve('../../packages/interpreter/src/artifacts/index.ts'),
  '@movscript/interpreter': resolve('../../packages/interpreter/src/index.ts'),
}

const packageNodeAlias = {
  '@movscript/engine/node': resolve('../../packages/engine/src/node.ts'),
  '@movscript/interpreter/node': resolve('../../packages/interpreter/src/node.ts'),
}

const uiBusinessAliases = {
  '@movscript/ui/business/agent': resolve('../../packages/ui/src/business/agent.ts'),
  '@movscript/ui/business/app': resolve('../../packages/ui/src/business/app.ts'),
  '@movscript/ui/business/canvas': resolve('../../packages/ui/src/business/canvas.ts'),
  '@movscript/ui/business/generation': resolve('../../packages/ui/src/business/generation.ts'),
  '@movscript/ui/business/resource': resolve('../../packages/ui/src/business/resource.ts'),
  '@movscript/ui/business/review': resolve('../../packages/ui/src/business/review.ts'),
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
  '@movscript/ui/styles/business/resource.css': resolve('../../packages/ui/src/styles/business/resource.css'),
  '@movscript/ui/styles/business/review.css': resolve('../../packages/ui/src/styles/business/review.css'),
  '@movscript/ui/styles/business/workbench.css': resolve('../../packages/ui/src/styles/business/workbench.css'),
}

const appAlias = {
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
  '@': resolve('src')
}
const runtimeSourceRoot = process.env.MOVSCRIPT_RUNTIME_SOURCE_ROOT
  ? resolve(process.env.MOVSCRIPT_RUNTIME_SOURCE_ROOT).replace(/\\/g, '/').replace(/\/$/, '')
  : undefined

const mainAlias = {
  ...coreNodeAlias,
  ...coreSharedAlias,
  ...workspaceNodeAlias,
  ...workspaceSharedAlias,
  ...packageNodeAlias,
  ...packageSharedAlias,
  ...appAlias,
}

const rendererAlias = {
  ...coreSharedAlias,
  ...workspaceSharedAlias,
  ...packageSharedAlias,
  ...appAlias,
}

const allAlias = {
  ...mainAlias,
}
const bundledWorkspaceDeps = [
  '@movscript/core',
  '@movscript/editing',
  '@movscript/engine',
  '@movscript/language',
  '@movscript/theme',
  '@movscript/ui',
  '@movscript/workspace',
]

const rendererPort = Number(process.env.MOVSCRIPT_FRONTEND_PORT ?? '5173')
const disableRendererHmr = process.env.MOVSCRIPT_FRONTEND_NO_HMR === '1'
const forceRendererOptimizeDeps = process.env.MOVSCRIPT_FRONTEND_FORCE_OPTIMIZE_DEPS === '1'
const ignoredMovScriptRuntimeWatchPaths = [
  '**/.movscript/**/.tmp/**',
  '**/.movscript-dev/**/.movscript/**/.tmp/**',
]

function isAliasSource(source: string) {
  return Object.keys(allAlias).some((key) => source === key || source.startsWith(`${key}/`))
}

function runtimeSourceResolver(): Plugin {
  return {
    name: 'movscript-runtime-source-resolver',
    async resolveId(source, importer, options) {
      if (!runtimeSourceRoot || !importer || source.startsWith('\0') || isAliasSource(source)) return null

      const normalizedImporter = importer.split('?')[0].replace(/\\/g, '/')
      if (!normalizedImporter.startsWith(`${runtimeSourceRoot}/`)) return null

      const relativeImporter = normalizedImporter.slice(runtimeSourceRoot.length + 1)
      const worktreeImporter = resolve('../..', relativeImporter)
      return this.resolve(source, worktreeImporter, { ...options, skipSelf: true })
    }
  }
}

export default defineConfig(() => {
  return {
    main: {
      plugins: [externalizeDepsPlugin({ exclude: bundledWorkspaceDeps })],
      build: {
        rollupOptions: {
          input: { index: resolve('electron/main.ts') }
        }
      },
      resolve: {
        alias: mainAlias
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin({ exclude: bundledWorkspaceDeps })],
      build: {
        rollupOptions: {
          input: { index: resolve('electron/preload.ts') }
        }
      }
    },
    renderer: {
      plugins: [runtimeSourceResolver(), react()],
      root: '.',
      server: {
        host: '127.0.0.1',
        port: rendererPort,
        strictPort: true,
        hmr: disableRendererHmr ? false : undefined,
        watch: {
          ignored: ignoredMovScriptRuntimeWatchPaths,
        },
      },
      optimizeDeps: {
        force: forceRendererOptimizeDeps,
      },
      build: {
        rollupOptions: {
          input: resolve('index.html')
        }
      },
      resolve: {
        alias: rendererAlias
      }
    }
  }
})
