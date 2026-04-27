import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const alias = {
  '@movscript/tokens/theme.css': resolve('../movscript-ui/packages/tokens/src/theme.css'),
  '@movscript/ui/styles.css': resolve('../movscript-ui/packages/ui/src/styles.css'),
  '@movscript/tokens': resolve('../movscript-ui/packages/tokens/src/index.ts'),
  '@movscript/ui': resolve('../movscript-ui/packages/ui/src/index.ts'),
  '@': resolve('src')
}

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
