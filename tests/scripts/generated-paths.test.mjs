import assert from 'node:assert/strict'
import test from 'node:test'

import {
  generatedCleanTargets,
  generatedIgnorePatterns,
  isGeneratedPath,
} from '../../tools/generated-paths.mjs'

test('generated path classifier covers build, stage, release, cache, and dev-state paths', () => {
  for (const path of [
    'apps/desktop/.package-stage/application.manifest.ts',
    'apps/desktop/out/main/index.js',
    'apps/desktop/release/Movscript.dmg',
    'packages/core/dist/index.js',
    'plugins/movscript/manifest.runtime.json',
    'plugins/movscript/release/movscript-agent-plugin.zip',
    'release-artifacts/Movscript.dmg',
    '.movscript-dev/user-data/state.json',
    'node_modules/.pnpm/typescript/package.json',
  ]) {
    assert.equal(isGeneratedPath(path), true, `${path} should be generated`)
  }
})

test('generated path classifier leaves source release scripts and controlled Go vendor alone', () => {
  for (const path of [
    'scripts/release/release-workflow.mjs',
    'services/data-service/vendor/modules.txt',
    'apps/plugin/startup.manifest.ts',
  ]) {
    assert.equal(isGeneratedPath(path), false, `${path} should not be generated`)
  }
})

test('clean targets and ignore patterns share the core staging contract', () => {
  assert.ok(generatedCleanTargets.stage.includes('apps/desktop/.package-stage'))
  assert.ok(generatedIgnorePatterns.includes('apps/desktop/.package-stage/'))
})
