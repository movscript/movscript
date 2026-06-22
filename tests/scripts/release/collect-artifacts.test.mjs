import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import test from 'node:test'

import { appendUpdateMetadataPolicy, collectArtifacts, defaultArtifactSources, isReleaseAsset, normalizeArtifactPrefix, rewriteUpdateMetadataArtifactNames, runCollectArtifactsCli, sha256 } from '../../../scripts/release/release-workflow.mjs'

test('isReleaseAsset accepts distributables and latest metadata only', () => {
  assert.equal(isReleaseAsset('Movscript.dmg'), true)
  assert.equal(isReleaseAsset('Movscript.AppImage'), true)
  assert.equal(isReleaseAsset('plugin.movpkg'), true)
  assert.equal(isReleaseAsset('latest.yml'), true)
  assert.equal(isReleaseAsset('latest-mac.yml'), true)
  assert.equal(isReleaseAsset('Movscript.dmg.blockmap'), true)
  assert.equal(isReleaseAsset('builder-debug.yml'), false)
  assert.equal(isReleaseAsset('notes.txt'), false)
})

test('defaultArtifactSources collects desktop release artifacts', () => {
  const root = resolve('/repo')
  assert.deepEqual(defaultArtifactSources(root), [
    resolve(root, 'apps/frontend/release'),
  ])
})

test('collectArtifacts copies release assets and writes sorted checksums', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-collect-artifacts-'))
  try {
    const frontend = join(root, 'apps/frontend/release')
    await mkdir(frontend, { recursive: true })
    await writeFile(join(frontend, 'Movscript.dmg'), 'desktop dmg')
    await writeFile(join(frontend, 'Movscript.dmg.blockmap'), 'differential blockmap')
    await writeFile(join(frontend, 'latest.yml'), 'channel metadata')

    const result = collectArtifacts(root)

    assert.deepEqual(result.copied.map((path) => basename(path)).sort(), [
      'Movscript.dmg',
      'Movscript.dmg.blockmap',
      'latest.yml',
    ])
    const checksums = await readFile(result.checksumPath, 'utf8')
    assert.match(checksums, new RegExp(`${sha256(join(frontend, 'Movscript.dmg'))}  Movscript\\.dmg`))
    assert.match(checksums, /Movscript\.dmg\.blockmap/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('collectArtifacts rejects duplicate release artifact names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-collect-artifacts-dupe-'))
  try {
    const first = join(root, 'apps/frontend/release')
    const second = join(root, 'other-release')
    await mkdir(first, { recursive: true })
    await mkdir(second, { recursive: true })
    await writeFile(join(first, 'Movscript.zip'), 'first')
    await writeFile(join(second, 'Movscript.zip'), 'second')

    assert.throws(() => collectArtifacts(root, { sources: [first, second] }), /Duplicate release artifact name: Movscript\.zip/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('collectArtifacts can prefix artifacts for matrix download merging', async () => {
  const root = await mkdtemp(join(tmpdir(), 'movscript-collect-artifacts-prefix-'))
  try {
    const frontend = join(root, 'apps/frontend/release')
    await mkdir(frontend, { recursive: true })
    await writeFile(join(frontend, 'latest.yml'), 'version: 0.1.24\npath: Movscript.zip\nfiles:\n  - url: Movscript.zip\n')
    await writeFile(join(frontend, 'Movscript.zip'), 'desktop zip')

    const result = collectArtifacts(root, {
      env: {
        MOVSCRIPT_ARTIFACT_PREFIX: 'movscript-desktop-macos-arm64',
        MOVSCRIPT_COLLECT_PLUGINS: '0',
        MOVSCRIPT_APP_UPDATE_POLICY: 'required',
        MOVSCRIPT_APP_UPDATE_SEVERITY: 'security',
        MOVSCRIPT_APP_UPDATE_MIN_SUPPORTED_VERSION: '0.1.24',
        MOVSCRIPT_APP_UPDATE_POLICY_MESSAGE: 'Critical update required',
      },
    })

    assert.deepEqual(result.copied.map((path) => basename(path)).sort(), [
      'latest.yml',
      'movscript-desktop-macos-arm64-Movscript.zip',
    ])
    const updateMetadata = await readFile(join(root, 'release-artifacts/latest.yml'), 'utf8')
    assert.match(updateMetadata, /url: movscript-desktop-macos-arm64-Movscript\.zip/)
    assert.match(updateMetadata, /policy: "required"/)
    assert.match(updateMetadata, /severity: "security"/)
    assert.match(updateMetadata, /minSupportedVersion: "0.1.24"/)
    assert.match(updateMetadata, /policyMessage: "Critical update required"/)
    assert.equal(basename(result.checksumPath), 'movscript-desktop-macos-arm64-SHA256SUMS.txt')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('appendUpdateMetadataPolicy validates policy metadata fields', () => {
  assert.equal(appendUpdateMetadataPolicy('version: 0.1.24\n', {
    MOVSCRIPT_APP_UPDATE_POLICY: 'required',
    MOVSCRIPT_APP_UPDATE_SEVERITY: 'data-loss',
    MOVSCRIPT_APP_UPDATE_DEADLINE_AT: '2026-06-25T00:00:00.000Z',
  }), 'version: 0.1.24\npolicy: "required"\nseverity: "data-loss"\ndeadlineAt: "2026-06-25T00:00:00.000Z"\n')
  assert.throws(() => appendUpdateMetadataPolicy('version: 0.1.24\n', {
    MOVSCRIPT_APP_UPDATE_POLICY: 'silent',
  }), /optional or required/)
  assert.throws(() => appendUpdateMetadataPolicy('version: 0.1.24\n', {
    MOVSCRIPT_APP_UPDATE_SEVERITY: 'urgent',
  }), /normal, security, data-loss, or startup-blocker/)
})

test('rewriteUpdateMetadataArtifactNames prefixes updater file references only', () => {
  assert.equal(rewriteUpdateMetadataArtifactNames([
    'version: 0.1.24',
    'path: Movscript.zip',
    'files:',
    '  - url: Movscript.zip',
    'releaseNotes: https://example.com/release',
    '',
  ].join('\n'), 'movscript-desktop-macos-arm64'), [
    'version: 0.1.24',
    'path: movscript-desktop-macos-arm64-Movscript.zip',
    'files:',
    '  - url: movscript-desktop-macos-arm64-Movscript.zip',
    'releaseNotes: https://example.com/release',
    '',
  ].join('\n'))
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
    const second = join(root, 'other-release')
    await mkdir(first, { recursive: true })
    await mkdir(second, { recursive: true })
    await writeFile(join(first, 'release.movpkg'), 'first')
    await writeFile(join(second, 'release.movpkg'), 'second')

    assert.throws(() => collectArtifacts(root, {
      sources: [first, second],
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
