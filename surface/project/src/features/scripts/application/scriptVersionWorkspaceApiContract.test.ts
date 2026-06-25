import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..')

test('script version API uses the shared semantic entity facade', () => {
  const scriptVersionsSource = readFileSync(resolve(repoRoot, 'surface/resource/src/features/infrastructure/scriptVersions.ts'), 'utf8')
  assert.doesNotMatch(scriptVersionsSource, /\/entities\/script-versions/)
  assert.match(scriptVersionsSource, /@movscript\/shared\/semantic-entities/)
  assert.match(scriptVersionsSource, /listSurfaceSemanticEntities/)
  assert.match(scriptVersionsSource, /createSurfaceSemanticEntity/)
  assert.match(scriptVersionsSource, /scriptVersionLines/)
})

test('project scripts import script version contracts from the resource surface public entrypoint', () => {
  const checkedFiles = [
    'surface/project/src/features/scripts/components/ScriptsPage.tsx',
    'surface/project/src/features/scripts/components/ScriptsPageParts.tsx',
    'surface/project/src/features/scripts/presentation/scriptDisplayModel.ts',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/resource-surface/)
    assert.doesNotMatch(source, /@\/shared\/infrastructure\/api\/scriptVersions/)
  }
})
