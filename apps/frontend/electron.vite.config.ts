import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const alias = {
  '@movscript/draft-schemas': resolve('../../packages/draft-schemas/src/index.ts'),
  '@movscript/tokens/theme.css': resolve('../../packages/tokens/src/theme.css'),
  '@movscript/ui/styles.css': resolve('../../packages/ui/src/styles.css'),
  '@movscript/tokens': resolve('../../packages/tokens/src/index.ts'),
  '@movscript/ui': resolve('../../packages/ui/src/index.ts'),
  '@runtime': process.env.MOVSCRIPT_FRONTEND_RUNTIME_ENTRY
    ? resolve(process.env.MOVSCRIPT_FRONTEND_RUNTIME_ENTRY)
    : resolve('src/runtime/community.tsx'),
  '@': resolve('src')
}

const rendererPort = Number(process.env.MOVSCRIPT_FRONTEND_PORT ?? '5173')

export default defineConfig({
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
    plugins: [react()],
    root: '.',
    server: {
      host: '127.0.0.1',
      port: rendererPort,
      strictPort: true,
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
})
