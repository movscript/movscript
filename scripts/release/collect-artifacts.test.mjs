import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import test from 'node:test'

import { collectArtifacts, defaultArtifactSources, isReleaseAsset, normalizeArtifactPrefix, runCollectArtifactsCli, sha256 } from './collect-artifacts.mjs'

test('isReleaseAsset accepts distributables and latest metadata only', () => {
  assert.equal(isReleaseAsset('Movscript.dmg'), true)
  assert.equal(isReleaseAsset('Movscript.AppImage'), true)
  assert.equal(isReleaseAsset('plugin.movpkg'), true)
  assert.equal(isReleaseAsset('latest.yml'), true)
  assert.equal(isReleaseAsset('latest-mac.yml'), true)
  assert.equal(isReleaseAsset('Movscript.dmg.blockmap'), false)
  assert.equal(isReleaseAsset('builder-debug.yml'), false)
  assert.equal(isReleaseAsset('notes.txt'), false)
})

test('defaultArtifactSources can skip plugin dist directories', () => {
  const root = resolve('/repo')
  assert.deepEqual(defaultArtifactSources(root, { MOVSCRIPT_COLLECT_PLUGINS: '0' }), [
    resolve(root, 'apps/frontend/release'),
  ])
})

test('collectArtifacts copies release assets and writes sorted checksums', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-collect-artifacts-'))
  try {
    const frontend = join(root, 'apps/frontend/release')
    const plugin = join(root, 'plugins/image-generator/dist')
    await mkdir(frontend, { recursive: true })
    await mkdir(plugin, { recursive: true })
    await writeFile(join(frontend, 'Movscript.dmg'), 'desktop dmg')
    await writeFile(join(frontend, 'Movscript.dmg.blockmap'), 'ignored blockmap')
    await writeFile(join(frontend, 'latest.yml'), 'channel metadata')
    await writeFile(join(plugin, 'image-generator.movpkg'), 'plugin package')

    const result = collectArtifacts(root)

    assert.deepEqual(result.copied.map((path) => basename(path)).sort(), [
      'Movscript.dmg',
      'image-generator.movpkg',
      'latest.yml',
    ])
    const checksums = await readFile(result.checksumPath, 'utf8')
    assert.match(checksums, new RegExp(`${sha256(join(frontend, 'Movscript.dmg'))}  Movscript\\.dmg`))
    assert.match(checksums, new RegExp(`${sha256(join(plugin, 'image-generator.movpkg'))}  image-generator\\.movpkg`))
    assert.doesNotMatch(checksums, /blockmap/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('collectArtifacts rejects duplicate release artifact names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-collect-artifacts-dupe-'))
  try {
    const first = join(root, 'apps/frontend/release')
    const second = join(root, 'plugins/video-generator/dist')
    await mkdir(first, { recursive: true })
    await mkdir(second, { recursive: true })
    await writeFile(join(first, 'Movscript.zip'), 'first')
    await writeFile(join(second, 'Movscript.zip'), 'second')

    assert.throws(() => collectArtifacts(root), /Duplicate release artifact name: Movscript\.zip/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('collectArtifacts can prefix artifacts for matrix download merging', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-collect-artifacts-prefix-'))
  try {
    const frontend = join(root, 'apps/frontend/release')
    await mkdir(frontend, { recursive: true })
    await writeFile(join(frontend, 'latest.yml'), 'channel metadata')
    await writeFile(join(frontend, 'Movscript.zip'), 'desktop zip')

    const result = collectArtifacts(root, {
      env: {
        MOVSCRIPT_ARTIFACT_PREFIX: 'movscript-desktop-macos-arm64',
        MOVSCRIPT_COLLECT_PLUGINS: '0',
      },
    })

    assert.deepEqual(result.copied.map((path) => basename(path)).sort(), [
      'movscript-desktop-macos-arm64-Movscript.zip',
      'movscript-desktop-macos-arm64-latest.yml',
    ])
    assert.equal(basename(result.checksumPath), 'movscript-desktop-macos-arm64-SHA256SUMS.txt')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('normalizeArtifactPrefix rejects unsafe path-like prefixes', () => {
  assert.equal(normalizeArtifactPrefix('movscript-desktop-linux-x64'), 'movscript-desktop-linux-x64')
  assert.equal(normalizeArtifactPrefix(''), '')
  assert.throws(() => normalizeArtifactPrefix('../escape'), /letters, numbers/)
  assert.throws(() => normalizeArtifactPrefix('nested/path'), /letters, numbers/)
  assert.throws(() => normalizeArtifactPrefix('release..candidate'), /path traversal/)
  assert.throws(() => normalizeArtifactPrefix('.'), /path traversal/)
})

test('collectArtifacts still rejects duplicate names after prefixing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-collect-artifacts-prefix-dupe-'))
  try {
    const first = join(root, 'apps/frontend/release')
    const second = join(root, 'plugins/video-generator/dist')
    await mkdir(first, { recursive: true })
    await mkdir(second, { recursive: true })
    await writeFile(join(first, 'release.movpkg'), 'first')
    await writeFile(join(second, 'release.movpkg'), 'second')

    assert.throws(() => collectArtifacts(root, {
      env: { MOVSCRIPT_ARTIFACT_PREFIX: 'plugins' },
    }), /Duplicate release artifact name: plugins-release\.movpkg/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runCollectArtifactsCli reports failures without stack traces', () => {
  const errors = []
  let exitCode = 0

  runCollectArtifactsCli('/repo', {}, {
    collect: () => {
      throw new Error('collection failed')
    },
    exit: (code) => { exitCode = code },
    log: () => undefined,
    logError: (message) => errors.push(message),
  })

  assert.equal(exitCode, 1)
  assert.deepEqual(errors, ['collection failed'])
})
