import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  MOVSCRIPT_LANG_PACKAGES,
  parseMovscriptLangDepsCliArgs,
  updateMovscriptLangIntegration,
} from '../../scripts/movscript-lang-deps.mjs'

test('movscript-lang latest mode sets registry dist-tag dependencies', async () => {
  const root = await createFixtureRoot()
  try {
    const result = await updateMovscriptLangIntegration({ root, mode: 'latest' })

    assert.equal(result.specs['@movscript/language'], 'latest')
    const corePackage = await readJson(path.join(root, 'packages/core/package.json'))
    for (const packageName of MOVSCRIPT_LANG_PACKAGES) {
      assert.equal(corePackage.dependencies[packageName], 'latest')
    }
  } finally {
    await rm(path.resolve(root, '..'), { recursive: true, force: true })
  }
})

test('movscript-lang version mode accepts an explicit dependency spec', async () => {
  const root = await createFixtureRoot()
  try {
    const result = await updateMovscriptLangIntegration({ root, mode: 'version', versionSpec: '^0.2.0' })

    assert.equal(result.specs['@movscript/language'], '^0.2.0')
    const corePackage = await readJson(path.join(root, 'packages/core/package.json'))
    for (const packageName of MOVSCRIPT_LANG_PACKAGES) {
      assert.equal(corePackage.dependencies[packageName], '^0.2.0')
    }
  } finally {
    await rm(path.resolve(root, '..'), { recursive: true, force: true })
  }
})

test('movscript-lang dependency cli parser supports release dependency modes', () => {
  assert.deepEqual(parseMovscriptLangDepsCliArgs(['latest']), { mode: 'latest' })
  assert.deepEqual(parseMovscriptLangDepsCliArgs(['version', '0.3.0']), { mode: 'version', versionSpec: '0.3.0' })
})

async function createFixtureRoot() {
  const base = await mkdtemp(path.join(os.tmpdir(), 'movscript-lang-deps-'))
  const root = path.join(base, 'movscript')
  await mkdir(path.join(root, 'packages/core'), { recursive: true })
  await writeFile(path.join(root, 'package.json'), '{}\n')
  await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n')
  await writeJson(path.join(root, 'packages/core/package.json'), {
    name: '@movscript/core',
    dependencies: Object.fromEntries(MOVSCRIPT_LANG_PACKAGES.map((packageName) => [packageName, '0.1.0'])),
  })
  return root
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
