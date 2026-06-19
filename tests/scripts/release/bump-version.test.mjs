import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import {
  bumpReleaseVersion,
  parseBumpReleaseVersionArgs,
  releaseVersionPackagePaths,
} from '../../../scripts/release/bump-version.mjs'

test('parseBumpReleaseVersionArgs accepts versions and dry-run', () => {
  assert.deepEqual(parseBumpReleaseVersionArgs(['v0.1.3', '--dry-run']), {
    dryRun: true,
    version: '0.1.3',
  })
  assert.throws(() => parseBumpReleaseVersionArgs([]), /Release version is required/)
  assert.throws(() => parseBumpReleaseVersionArgs(['latest']), /SemVer-like/)
})

test('bumpReleaseVersion updates release package manifests only', async () => {
  const root = await makeReleaseVersionFixture()
  const result = await bumpReleaseVersion(root, '0.1.3')

  assert.equal(result.version, '0.1.3')
  assert.deepEqual(result.packages, releaseVersionPackagePaths)
  for (const packagePath of releaseVersionPackagePaths) {
    assert.equal((await readJson(join(root, packagePath))).version, '0.1.3')
  }
  assert.equal((await readJson(join(root, 'apps/admin/package.json'))).version, '0.1.0')
  assert.equal((await readJson(join(root, 'packages/ui/package.json'))).version, '0.1.0')
})

test('bumpReleaseVersion dry-run reports package manifests without writing', async () => {
  const root = await makeReleaseVersionFixture()
  const result = await bumpReleaseVersion(root, '0.1.3', { dryRun: true })

  assert.equal(result.dryRun, true)
  assert.deepEqual(result.packages, releaseVersionPackagePaths)
  for (const packagePath of releaseVersionPackagePaths) {
    assert.equal((await readJson(join(root, packagePath))).version, '0.1.2')
  }
})

async function makeReleaseVersionFixture() {
  const root = await mkdtemp(join(tmpdir(), 'movscript-release-version.'))
  for (const packagePath of releaseVersionPackagePaths) {
    await writeJson(join(root, packagePath), {
      name: packagePath,
      version: '0.1.2',
    })
  }
  await writeJson(join(root, 'apps/admin/package.json'), {
    name: '@movscript/admin',
    version: '0.1.0',
  })
  await writeJson(join(root, 'packages/ui/package.json'), {
    name: '@movscript/ui',
    version: '0.1.0',
  })
  return root
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}
