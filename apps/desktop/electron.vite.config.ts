import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import type { Plugin } from 'vite'

const coreSharedAlias = {
  '@movscript/core/agent': resolve('../../packages/core/src/agent/index.ts'),
  '@movscript/core/canvas': resolve('../../packages/core/src/canvas/index.ts'),
  '@movscript/core/content': resolve('../../packages/core/src/content/index.ts'),
  '@movscript/core/generation': resolve('../../packages/core/src/generation/index.ts'),
  '@movscript/core/production': resolve('../../packages/core/src/production/index.ts'),
  '@movscript/core/resources': resolve('../../packages/core/src/resources/index.ts'),
}

const coreNodeAlias = {
  '@movscript/core/backend/node': resolve('../../packages/core/src/backend/node/index.ts'),
}

const workspaceSharedAlias = {
  '@movscript/workspace/indexer': resolve('../../packages/workspace/src/indexer/index.ts'),
  '@movscript/workspace/layout': resolve('../../packages/workspace/src/layout/index.ts'),
  '@movscript/workspace/repository': resolve('../../packages/workspace/src/repository/index.ts'),
  '@movscript/workspace': resolve('../../packages/workspace/src/index.ts'),
}

const workspaceNodeAlias = {
  '@movscript/workspace/home': resolve('../../packages/workspace/src/home/index.ts'),
  '@movscript/workspace/node': resolve('../../packages/workspace/src/node.ts'),
}

const packageSharedAlias = {
  '@movscript/agent-chat': resolve('../../packages/agent-chat/src/index.ts'),
  '@movscript/agent-protocol': resolve('../../packages/agent-protocol/src/index.ts'),
  '@movscript/data-client': resolve('../../packages/data-client/src/index.ts'),
  '@movscript/editing/browser': resolve('../../packages/editing/src/browser.ts'),
  '@movscript/editing-surface/app-events': resolve('../../surface/editing/src/app-events.ts'),
  '@movscript/editing-surface/browser-storage': resolve('../../surface/editing/src/browser-storage.ts'),
  '@movscript/editing-surface/contracts': resolve('../../surface/editing/src/contracts.ts'),
  '@movscript/editing-surface/host-api': resolve('../../surface/editing/src/host-api.ts'),
  '@movscript/editing-surface/media-probe': resolve('../../surface/editing/src/media-probe.ts'),
  '@movscript/editing-surface/navigation': resolve('../../surface/editing/src/navigation.ts'),
  '@movscript/editing-surface/pages': resolve('../../surface/editing/src/pages'),
  '@movscript/editing-surface/registry': resolve('../../surface/editing/src/registry.ts'),
  '@movscript/editing-surface/routes': resolve('../../surface/editing/src/routes.ts'),
  '@movscript/editing-surface/service-host-api': resolve('../../surface/editing/src/service-host-api.ts'),
  '@movscript/editing-surface/surface-routes': resolve('../../surface/editing/src/surface-routes.tsx'),
  '@movscript/editing-surface/toast': resolve('../../surface/editing/src/toast.ts'),
  '@movscript/editing-surface/window-events': resolve('../../surface/editing/src/window-events.ts'),
  '@movscript/editing-surface': resolve('../../surface/editing/src/index.ts'),
  '@movscript/mcp-contracts': resolve('../../packages/mcp-contracts/src/index.ts'),
  '@movscript/project-surface/data': resolve('../../surface/project/src/data.ts'),
  '@movscript/project-surface/routes': resolve('../../surface/project/src/routes.ts'),
  '@movscript/project-surface/layout': resolve('../../surface/project/src/layout.ts'),
  '@movscript/project-surface/pages': resolve('../../surface/project/src/pages/index.ts'),
  '@movscript/project-surface/resource-browser': resolve('../../surface/project/src/resource-browser.ts'),
  '@movscript/project-surface/react': resolve('../../surface/project/src/react.ts'),
  '@movscript/project-surface/runtime': resolve('../../surface/project/src/runtime.ts'),
  '@movscript/project-surface': resolve('../../surface/project/src/index.ts'),
  '@movscript/canvas-surface/data': resolve('../../surface/canvas/src/data.ts'),
  '@movscript/canvas-surface/layout': resolve('../../surface/canvas/src/layout.ts'),
  '@movscript/canvas-surface/pages': resolve('../../surface/canvas/src/pages/index.ts'),
  '@movscript/canvas-surface/shell': resolve('../../surface/canvas/src/shell.ts'),
  '@movscript/canvas-surface/workbench': resolve('../../surface/canvas/src/workbench.ts'),
  '@movscript/canvas-surface': resolve('../../surface/canvas/src/index.ts'),
  '@movscript/resource-surface/data': resolve('../../surface/resource/src/data.ts'),
  '@movscript/resource-surface/routes': resolve('../../surface/resource/src/routes.ts'),
  '@movscript/resource-surface/pages': resolve('../../surface/resource/src/pages/index.ts'),
  '@movscript/resource-surface/resource-browser': resolve('../../surface/resource/src/resource-browser.ts'),
  '@movscript/resource-surface/resource-media': resolve('../../surface/resource/src/resourceMediaBrowser.ts'),
  '@movscript/resource-surface/resource-media-components': resolve('../../surface/resource/src/resourceMediaComponents.tsx'),
  '@movscript/resource-surface/resource-media-viewer': resolve('../../surface/resource/src/resourceMediaViewer.tsx'),
  '@movscript/resource-surface/resource-media-diagnostics': resolve('../../surface/resource/src/resourceMediaDiagnostics.ts'),
  '@movscript/resource-surface/resource-candidate-attach-panel': resolve('../../surface/resource/src/resourceCandidateAttachPanel.tsx'),
  '@movscript/resource-surface/resource-interaction': resolve('../../surface/resource/src/resourceInteraction.ts'),
  '@movscript/resource-surface/resource-library-picker': resolve('../../surface/resource/src/resourceLibraryPicker.tsx'),
  '@movscript/resource-surface/resource-library-picker-ui': resolve('../../surface/resource/src/resourceLibraryPickerUi.tsx'),
  '@movscript/resource-surface/react': resolve('../../surface/resource/src/react.ts'),
  '@movscript/resource-surface': resolve('../../surface/resource/src/index.ts'),
  '@movscript/shot-library-surface/data': resolve('../../surface/shot-library/src/data.ts'),
  '@movscript/shot-library-surface/pages': resolve('../../surface/shot-library/src/pages/index.ts'),
  '@movscript/shot-library-surface': resolve('../../surface/shot-library/src/index.ts'),
  '@movscript/jobs-surface/pages': resolve('../../surface/jobs/src/pages/index.ts'),
  '@movscript/jobs-surface/i18n': resolve('../../surface/jobs/src/i18n.ts'),
  '@movscript/jobs-surface': resolve('../../surface/jobs/src/index.ts'),
  '@movscript/resources': resolve('../../packages/resources/src/index.ts'),
  '@movscript/shared/browser': resolve('../../packages/shared/src/browser.ts'),
  '@movscript/shared/media-probe': resolve('../../packages/shared/src/mediaProbe.ts'),
  '@movscript/shared/surface-http': resolve('../../packages/shared/src/surfaceHttpClient.ts'),
  '@movscript/shared/surface-routes': resolve('../../packages/shared/src/surfaceRoutes.ts'),
  '@movscript/shared/semantic-entities': resolve('../../packages/shared/src/surfaceSemanticEntities.ts'),
  '@movscript/shared/workspace-candidates': resolve('../../packages/shared/src/workspaceCandidates.ts'),
  '@movscript/shared/app-events': resolve('../../packages/shared/src/appEvents.ts'),
  '@movscript/shared': resolve('../../packages/shared/src/index.ts'),
  '@movscript/shot-library': resolve('../../packages/shot-library/src/index.ts'),
  '@movscript/media-pipeline': resolve('../../services/media-pipeline/src/server.mjs'),
  '@movscript/language/domain': resolve('../../packages/language/src/domain/index.ts'),
  '@movscript/interpreter/artifacts': resolve('../../packages/interpreter/src/artifacts/index.ts'),
  '@movscript/interpreter': resolve('../../packages/interpreter/src/index.ts'),
}

const packageNodeAlias = {
  '@movscript/engine/node': resolve('../../packages/engine/src/node.ts'),
  '@movscript/interpreter/node': resolve('../../packages/interpreter/src/node.ts'),
  '@movscript/mcp-host/http': resolve('../../packages/mcp-host/src/http.ts'),
  '@movscript/mcp-host/stdio': resolve('../../packages/mcp-host/src/stdio.ts'),
  '@movscript/mcp-host': resolve('../../packages/mcp-host/src/index.ts'),
  '@movscript/plugins/node': resolve('../../packages/plugins/src/node/index.ts'),
  '@movscript/plugins': resolve('../../packages/plugins/src/index.ts'),
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
  '@movscript/ui/styles/surface-host.css': resolve('../../packages/ui/src/styles/surface-host.css'),
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
  '@movscript/ui/toast': resolve('../../packages/ui/src/toast.ts'),
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
  '@movscript/editing': resolve('../../packages/editing/src/index.ts'),
  ...appAlias,
}

const rendererAlias = {
  ...coreSharedAlias,
  ...workspaceSharedAlias,
  ...packageSharedAlias,
  '@movscript/editing': resolve('../../packages/editing/src/browser.ts'),
  ...appAlias,
}

const allAlias = {
  ...mainAlias,
}
const bundledWorkspaceDeps = [
  '@movscript/project-surface/resource-browser',
  '@movscript/project-surface/react',
  '@movscript/project-surface',
  '@movscript/resource-surface/resource-browser',
  '@movscript/resource-surface/resource-media',
  '@movscript/resource-surface/resource-media-components',
  '@movscript/resource-surface/resource-media-viewer',
  '@movscript/resource-surface/resource-media-diagnostics',
  '@movscript/resource-surface/resource-candidate-attach-panel',
  '@movscript/resource-surface/resource-interaction',
  '@movscript/resource-surface/resource-library-picker',
  '@movscript/resource-surface/resource-library-picker-ui',
  '@movscript/resource-surface/react',
  '@movscript/resource-surface',
  '@movscript/core',
  '@movscript/data-client',
  '@movscript/editing',
  '@movscript/editing-surface',
  '@movscript/engine',
  '@movscript/language',
  '@movscript/media-pipeline',
  '@movscript/mcp-host',
  '@movscript/plugins',
  '@movscript/resources',
  '@movscript/shared',
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

function exactWorkspaceAliasResolver(alias: Record<string, string>): Plugin {
  return {
    name: 'movscript-exact-workspace-alias-resolver',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const replacement = alias[source]
      if (!replacement) return null
      const resolved = await this.resolve(replacement, importer, { ...options, skipSelf: true })
      return resolved ?? replacement
    },
  }
}

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
      plugins: [exactWorkspaceAliasResolver(mainAlias), externalizeDepsPlugin({ exclude: bundledWorkspaceDeps })],
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
      plugins: [exactWorkspaceAliasResolver(rendererAlias), runtimeSourceResolver(), react()],
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
