import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/domain/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
})
