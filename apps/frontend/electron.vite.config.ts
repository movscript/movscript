import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import type { Plugin } from 'vite'

const alias = {
  '@movscript/core/workspace': resolve('../../packages/core/src/workspace/index.ts'),
  '@movscript/core/workspace/node': resolve('../../packages/core/src/workspace/node/index.ts'),
  '@movscript/core/mcp': resolve('../../packages/core/src/mcp/index.ts'),
  '@movscript/core/mcp/node': resolve('../../packages/core/src/mcp/node/index.ts'),
  '@movscript/core/backend': resolve('../../packages/core/src/backend/index.ts'),
  '@movscript/core/backend/node': resolve('../../packages/core/src/backend/node/index.ts'),
  '@movscript/core/plugins': resolve('../../packages/core/src/plugins/index.ts'),
  '@movscript/core/plugins/node': resolve('../../packages/core/src/plugins/node/index.ts'),
  '@movscript/core': resolve('../../packages/core/src/index.ts'),
  '@movscript/theme/theme.css': resolve('../../packages/theme/src/theme.css'),
  '@movscript/ui/styles.css': resolve('../../packages/ui/src/styles.css'),
  '@movscript/ui/style-system': resolve('../../packages/ui/src/style-system.ts'),
  '@movscript/theme': resolve('../../packages/theme/src/index.ts'),
  '@movscript/ui': resolve('../../packages/ui/src/index.ts'),
  '@runtime': process.env.MOVSCRIPT_FRONTEND_RUNTIME_ENTRY
    ? resolve(process.env.MOVSCRIPT_FRONTEND_RUNTIME_ENTRY)
    : resolve('src/runtime/community.tsx'),
  '@': resolve('src')
}

const rendererPort = Number(process.env.MOVSCRIPT_FRONTEND_PORT ?? '5173')
const disableRendererHmr = process.env.MOVSCRIPT_FRONTEND_NO_HMR === '1'
const ignoredMovScriptRuntimeWatchPaths = [
  '**/.movscript/**/.tmp/**',
  '**/.movscript-dev/**/.movscript/**/.tmp/**',
]

function isAliasSource(source: string) {
  return Object.keys(alias).some((key) => source === key || source.startsWith(`${key}/`))
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
        alias
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
        alias
      }
    }
  }
})
