import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/data.ts',
    'src/index.ts',
    'src/layout.ts',
    'src/react.ts',
    'src/routes.ts',
    'src/runtime.ts',
    'src/resource-browser.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: false,
})
