import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/artifacts/index.ts',
    'src/entityChanges/index.ts',
    'src/fileChanges/index.ts',
    'src/impact/index.ts',
    'src/jsonChanges/index.ts',
    'src/jsonFileChanges/index.ts',
    'src/reviewSummary/index.ts',
    'src/semanticChanges/index.ts',
    'src/sourceValidation/index.ts',
    'src/node/debugArtifacts.ts',
    'src/node/fileCoverage.ts',
    'src/node/overview.ts',
    'src/node/regeneration.ts',
    'src/node/review.ts',
    'src/node/sourceStore.ts',
    'src/node/types.ts',
    'src/node.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
})
