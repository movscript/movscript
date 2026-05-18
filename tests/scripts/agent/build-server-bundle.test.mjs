import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../../..')

test('agent build output excludes test files from the desktop runtime bundle', async () => {
  const tsconfig = JSON.parse(await readFile(resolve(repoRoot, 'apps/agent/tsconfig.build.json'), 'utf8'))
  assert.deepEqual(tsconfig.exclude, [
    'src/**/*.test.ts',
    'src/**/*.test.tsx',
  ])

  const buildScript = await readFile(resolve(repoRoot, 'apps/agent/scripts/build-server-bundle.mjs'), 'utf8')
  assert.match(buildScript, /withBuildLock\('movscript-agent-build'/)
  assert.match(buildScript, /if \(draftSchemasBuildIsStale\(\)\)/)
  assert.match(buildScript, /function draftSchemasBuildIsStale\(\)/)
  assert.match(buildScript, /resolve\(draftSchemasRoot, 'dist\/index\.d\.ts'\)/)
  assert.match(buildScript, /function newestMtime\(paths\)/)
  assert.match(buildScript, /rmSync\(resolve\(appRoot, 'dist'\), \{ recursive: true, force: true \}\)/)
  assert.match(buildScript, /run\('tsc', \['-p', 'tsconfig\.build\.json'\]\)/)
})
