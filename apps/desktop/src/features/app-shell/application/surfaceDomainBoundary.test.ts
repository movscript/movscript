import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const SURFACE_DOMAINS = [
  'project',
  'resource',
  'canvas',
  'editing',
  'shot-library',
] as const

test('surface domains do not expose desktop-owned source directories', () => {
  for (const domain of SURFACE_DOMAINS) {
    assert.equal(
      existsSync(resolve(`../../surface/${domain}/src/desktop`)),
      false,
      `surface/${domain} must stay host-neutral; move host-specific wiring to apps/* or services/*`,
    )
  }
})

test('desktop and local hosts import surfaces through host-neutral paths', () => {
  const hostConfigSource = [
    readFileSync(resolve('tsconfig.json'), 'utf8'),
    readFileSync(resolve('tsconfig.electron.json'), 'utf8'),
    readFileSync(resolve('electron.vite.config.ts'), 'utf8'),
    readFileSync(resolve('vite.e2e.config.ts'), 'utf8'),
    readFileSync(resolve('../../services/local-surface-host/tsconfig.json'), 'utf8'),
    readFileSync(resolve('../../services/local-surface-host/vite.config.ts'), 'utf8'),
  ].join('\n')

  assert.doesNotMatch(hostConfigSource, /surface\/(?:project|resource|canvas|editing|shot-library)\/src\/desktop/)
  assert.doesNotMatch(hostConfigSource, /surface\/(?:project|resource|canvas|editing|shot-library)\/src\/features/)
  assert.match(hostConfigSource, /surface\/project\/src\/index\.ts/)
  assert.match(hostConfigSource, /surface\/project\/src\/react\.ts/)
  assert.match(hostConfigSource, /surface\/resource\/src\/index\.ts/)
  assert.match(hostConfigSource, /surface\/resource\/src\/pages\/index\.ts/)
  assert.match(hostConfigSource, /surface\/canvas\/src\/index\.ts/)
  assert.match(hostConfigSource, /surface\/canvas\/src\/pages\/index\.ts/)
  assert.match(hostConfigSource, /surface\/editing\/src\/index\.ts/)
  assert.match(hostConfigSource, /surface\/shot-library\/src\/index\.ts/)
})

test('shared surface source consumes host api through neutral adapter names', () => {
  const files = SURFACE_DOMAINS.flatMap((domain) => surfaceSourceFiles(`../../surface/${domain}/src`))
  const bannedPatterns = [
    { label: 'direct electronApiAccess import', pattern: /@\/shared\/infrastructure\/electronApiAccess/ },
    { label: 'direct electronApi contract import', pattern: /@\/shared\/contracts\/electronApi/ },
    { label: 'readElectronApi usage', pattern: /\breadElectronApi\b/ },
    { label: 'desktop_unavailable reason', pattern: /desktop_unavailable/ },
    { label: 'electron-named resource/shot host module', pattern: /resourceVideoClipElectron|shotCutElectron/ },
  ]
  const violations = files.flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    return bannedPatterns
      .filter(({ pattern }) => pattern.test(source))
      .map(({ label }) => `${file}: ${label}`)
  })
  const combinedSource = files.map((file) => readFileSync(file, 'utf8')).join('\n')

  assert.deepEqual(violations, [])
  assert.match(combinedSource, /readSurfaceHostApi|readEditingHostApi/)
})

function surfaceSourceFiles(relativeRoot: string): string[] {
  const root = resolve(relativeRoot)
  if (!existsSync(root)) return []
  const files: string[] = []
  for (const entry of readdirSync(root)) {
    if (entry === 'dist' || entry === 'dist-lib') continue
    const fullPath = resolve(root, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...surfaceSourceFiles(fullPath))
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath)
    }
  }
  return files
}
