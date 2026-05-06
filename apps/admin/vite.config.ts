import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const editionEntry = process.env.MOVSCRIPT_ADMIN_EDITION_ENTRY
  ? resolve(__dirname, process.env.MOVSCRIPT_ADMIN_EDITION_ENTRY)
  : resolve(__dirname, 'src/edition/community.tsx')

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  resolve: {
    alias: {
      '@movscript/tokens/theme.css': resolve(__dirname, '../../packages/tokens/src/theme.css'),
      '@movscript/ui/styles.css': resolve(__dirname, '../../packages/ui/src/styles.css'),
      '@movscript/tokens': resolve(__dirname, '../../packages/tokens/src/index.ts'),
      '@movscript/ui': resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@': resolve(__dirname, '../frontend/src'),
      '@admin': resolve(__dirname, 'src'),
      '@admin-edition': editionEntry,
    },
  },
})
