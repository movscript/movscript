import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  verifyReleaseReadiness,
  verifySigningEnvironment,
} from '../../../scripts/release/verify-release-readiness.mjs'

test('verifyReleaseReadiness accepts matching desktop release tags', async () => {
  const root = await releaseFixture()
  try {
    const result = verifyReleaseReadiness(root, {
      env: {},
      tag: 'v0.1.0',
    })
    assert.deepEqual(result.checks.slice(0, 3), [
      'desktop package version 0.1.0 matches root package',
      'release tag v0.1.0 matches package version',
      'release notes file exists: .github/release-workspace-notes.md',
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verifyReleaseReadiness rejects tag and desktop version drift', async () => {
  const root = await releaseFixture({ desktopVersion: '0.1.1' })
  try {
    assert.throws(
      () => verifyReleaseReadiness(root, { env: {}, tag: 'v0.1.0' }),
      /apps\/frontend\/package\.json version \(0\.1\.1\) must match package\.json version \(0\.1\.0\)/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verifyReleaseReadiness rejects mutable movscript-lang release specs', async () => {
  const root = await releaseFixture({ coreEngineSpec: 'latest' })
  try {
    assert.throws(
      () => verifyReleaseReadiness(root, { env: {}, tag: 'v0.1.0' }),
      /Release packages must not depend on mutable movscript-lang specs\.[\s\S]*packages\/core\/package\.json: @movscript\/engine uses latest/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('verifySigningEnvironment requires macOS signing and notarization secrets when enforced', () => {
  assert.throws(
    () => verifySigningEnvironment('darwin', {}),
    /missing: CSC_LINK, CSC_KEY_PASSWORD, APPLE_ID \+ APPLE_APP_SPECIFIC_PASSWORD \+ APPLE_TEAM_ID or APPLE_API_KEY \+ APPLE_API_KEY_ID \+ APPLE_API_ISSUER/,
  )
  assert.deepEqual(
    verifySigningEnvironment('darwin', {
      CSC_LINK: 'certificate',
      CSC_KEY_PASSWORD: 'password',
      APPLE_ID: 'developer@example.com',
      APPLE_APP_SPECIFIC_PASSWORD: 'app-password',
      APPLE_TEAM_ID: 'TEAMID',
    }),
    ['darwin signing credentials are configured'],
  )
})

test('verifySigningEnvironment requires Windows signing secrets when enforced', () => {
  assert.throws(
    () => verifySigningEnvironment('win32', {}),
    /missing: CSC_LINK, CSC_KEY_PASSWORD/,
  )
  assert.deepEqual(
    verifySigningEnvironment('win32', {
      CSC_LINK: 'certificate',
      CSC_KEY_PASSWORD: 'password',
    }),
    ['win32 signing credentials are configured'],
  )
})

async function releaseFixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'movscript-release-ready-'))
  await mkdir(path.join(root, 'apps/frontend'), { recursive: true })
  await mkdir(path.join(root, 'apps/cli'), { recursive: true })
  await mkdir(path.join(root, 'packages/core'), { recursive: true })
  await mkdir(path.join(root, '.github'), { recursive: true })
  await writeJSON(path.join(root, 'package.json'), {
    name: 'movscript',
    version: options.rootVersion ?? '0.1.0',
  })
  await writeJSON(path.join(root, 'apps/frontend/package.json'), {
    name: '@movscript/desktop',
    version: options.desktopVersion ?? '0.1.0',
  })
  await writeJSON(path.join(root, 'packages/core/package.json'), {
    name: '@movscript/core',
    version: '0.1.0',
    dependencies: {
      '@movscript/engine': options.coreEngineSpec ?? 'workspace:*',
    },
  })
  await writeJSON(path.join(root, 'apps/cli/package.json'), {
    name: '@movscript/cli',
    version: '0.1.0',
    dependencies: {
      '@movscript/language': 'workspace:*',
    },
  })
  await writeFile(path.join(root, '.github/release-workspace-notes.md'), '# Notes\n')

  return root
}

async function writeJSON(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}
