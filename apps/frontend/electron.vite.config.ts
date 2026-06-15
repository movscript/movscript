import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import type { Plugin } from 'vite'

const coreSharedAlias = {
  '@movscript/core/workspace': resolve('../../packages/core/src/workspace/index.ts'),
  '@movscript/core/mcp': resolve('../../packages/core/src/mcp/index.ts'),
  '@movscript/core/backend': resolve('../../packages/core/src/backend/index.ts'),
  '@movscript/core/plugins': resolve('../../packages/core/src/plugins/index.ts'),
  '@movscript/core/resources': resolve('../../packages/core/src/resources/index.ts'),
}

const coreNodeAlias = {
  '@movscript/core/workspace/node': resolve('../../packages/core/src/workspace/node/index.ts'),
  '@movscript/core/mcp/node': resolve('../../packages/core/src/mcp/node/index.ts'),
  '@movscript/core/backend/node': resolve('../../packages/core/src/backend/node/index.ts'),
  '@movscript/core/plugins/node': resolve('../../packages/core/src/plugins/node/index.ts'),
}

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

const mainAlias = {
  ...coreSharedAlias,
  ...coreNodeAlias,
  ...appAlias,
}

const rendererAlias = {
  ...coreSharedAlias,
  ...appAlias,
}

const allAlias = {
  ...mainAlias,
}

const rendererPort = Number(process.env.MOVSCRIPT_FRONTEND_PORT ?? '5173')
const disableRendererHmr = process.env.MOVSCRIPT_FRONTEND_NO_HMR === '1'
const ignoredMovScriptRuntimeWatchPaths = [
  '**/.movscript/**/.tmp/**',
  '**/.movscript-dev/**/.movscript/**/.tmp/**',
]

function isAliasSource(source: string) {
  return Object.keys(allAlias).some((key) => source === key || source.startsWith(`${key}/`))
}

function enterpriseOverlayResolver(): Plugin {
  return {
    name: 'movscript-enterprise-overlay-resolver',
    async resolveId(source, importer, options) {
      if (!importer || source.startsWith('\0') || isAliasSource(source)) return null

      const normalizedImporter = importer.split('?')[0].replace(/\\/g, '/')
      const overlayMarker = '/overlays/movscript/'
      const overlayIndex = normalizedImporter.indexOf(overlayMarker)
      if (overlayIndex === -1) return null

      const relativeImporter = normalizedImporter.slice(overlayIndex + overlayMarker.length)
      const worktreeImporter = resolve('../..', relativeImporter)
      return this.resolve(source, worktreeImporter, { ...options, skipSelf: true })
    }
  }
}

export default defineConfig(() => {
  return {
    main: {
      plugins: [externalizeDepsPlugin()],
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
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          input: { index: resolve('electron/preload.ts') }
        }
      }
    },
    renderer: {
      plugins: [enterpriseOverlayResolver(), react()],
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
        force: true,
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
