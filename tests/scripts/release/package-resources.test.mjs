import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseExtraResources,
  parseTopLevelStringList,
  validateManifest,
  verifyPackageResources,
} from '../../../scripts/release/verify-package-resources.mjs'

test('package resource manifest matches electron-builder contract', () => {
  const manifest = verifyPackageResources(process.cwd())

  assert.equal(manifest.schema, 'movscript.package-resources.v1')
  assert.equal(manifest.edition, 'community')
  assert.deepEqual(manifest.packageFiles, ['out/**', 'package.json', '!node_modules/@movscript/mova*/vendor/**/bin/mova*'])
  assert.deepEqual(manifest.resources.map((resource) => resource.id), [
    'app-icon',
    'backend',
    'ffmpeg',
    'movcli',
    'provider-plugin',
    'renderer-admin',
    'tray-icon',
    'tray-icon-retina',
  ])
})

test('package resource verifier parses quoted electron-builder filters', () => {
  const config = `
files:
  - out/**
  - package.json

extraResources:
  - from: vendor/ffmpeg
    to: ffmpeg
    filter:
      - "**/ffmpeg"
      - '**/METADATA.json'

mac:
  target:
    - dmg
`

  assert.deepEqual(parseTopLevelStringList(config, 'files'), ['out/**', 'package.json'])
  assert.deepEqual(parseExtraResources(config), [
    {
      from: 'vendor/ffmpeg',
      to: 'ffmpeg',
      filter: ['**/ffmpeg', '**/METADATA.json'],
    },
  ])
})

test('package resource verifier fails when builder resources drift from manifest', () => {
  const errors = validateManifest(process.cwd(), {
    schema: 'movscript.package-resources.v1',
    product: 'movscript-desktop',
    edition: 'community',
    owner: 'release-engineering',
    builderConfig: 'apps/frontend/electron-builder.yml',
    packageFiles: ['out/**', 'package.json'],
    forbiddenPackagePaths: ['node_modules/**'],
    resources: [
      {
        id: 'backend',
        category: 'managed-binary',
        from: '../backend/bin',
        to: 'backend',
        filter: ['server'],
        source: 'build-artifact',
        required: true,
        owner: 'backend-runtime',
        license: 'Apache-2.0',
        updatePolicy: 'bundled-with-app',
        verification: ['test'],
      },
    ],
  })

  assert.match(errors.join('\n'), /backend\.filter mismatch/)
  assert.match(errors.join('\n'), /electron-builder extraResources entry is not declared in manifest/)
})
