import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/indexer/index.ts',
    'src/layout/index.ts',
    'src/home/index.ts',
    'src/node.ts',
    'src/repository/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
})
