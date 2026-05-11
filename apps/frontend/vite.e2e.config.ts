import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const alias = {
  '@movscript/tokens/theme.css': resolve('../../packages/tokens/src/theme.css'),
  '@movscript/ui/styles.css': resolve('../../packages/ui/src/styles.css'),
  '@movscript/tokens': resolve('../../packages/tokens/src/index.ts'),
  '@movscript/ui': resolve('../../packages/ui/src/index.ts'),
  '@runtime': process.env.MOVSCRIPT_FRONTEND_RUNTIME_ENTRY
    ? resolve(process.env.MOVSCRIPT_FRONTEND_RUNTIME_ENTRY)
    : resolve('src/runtime/community.tsx'),
  '@': resolve('src'),
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias,
  },
})
