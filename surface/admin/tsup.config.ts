import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/react.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  outDir: 'dist-lib',
  splitting: false,
  esbuildOptions(options, context) {
    if (context.format === 'cjs') {
      options.define = {
        ...options.define,
        'import.meta.env': '{}',
      }
    }
  },
})
