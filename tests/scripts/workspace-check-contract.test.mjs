import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import test from 'node:test'

import { releaseWorkflowSteps } from '../../scripts/release/release-workflow.mjs'

const root = process.cwd()

function readJSON(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'))
}

function hasGlob(pattern) {
  return /[*?[\]{}]/.test(pattern)
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function globToRegExp(pattern) {
  const normalized = pattern.split(/[\\/]+/).join('/')
  let source = '^'

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    const next = normalized[index + 1]

    if (char === '*' && next === '*') {
      const after = normalized[index + 2]
      if (after === '/') {
        source += '(?:.*/)?'
        index += 2
      } else {
        source += '.*'
        index += 1
      }
    } else if (char === '*') {
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += escapeRegExp(char)
    }
  }

  source += '$'
  return new RegExp(source)
}

function rootFromPattern(pattern) {
  const parts = []
  for (const part of pattern.split(/[\\/]+/)) {
    if (hasGlob(part)) break
    parts.push(part)
  }
  return parts.length > 0 ? parts.join(sep) : '.'
}

function walkFiles(relativeRoot) {
  const absoluteRoot = resolve(root, relativeRoot)
  const files = []

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        walk(path)
      } else if (entry.isFile()) {
        files.push(path.slice(root.length + 1).split(sep).join('/'))
      }
    }
  }

  if (!existsSync(absoluteRoot)) return files
  if (statSync(absoluteRoot).isDirectory()) walk(absoluteRoot)
  return files
}

function patternMatches(pattern) {
  if (!hasGlob(pattern)) return existsSync(resolve(root, pattern)) ? [pattern] : []
  const matcher = globToRegExp(pattern)
  return walkFiles(rootFromPattern(pattern)).filter((file) => matcher.test(file))
}

test('root test suites point at files that exist in the current workspace', () => {
  const manifest = readJSON('package.json')
  const suites = manifest.testSuites ?? {}

  for (const [suiteName, patterns] of Object.entries(suites)) {
    assert.ok(Array.isArray(patterns), `${suiteName} must be an array of patterns`)
    for (const pattern of patterns) {
      assert.ok(patternMatches(pattern).length > 0, `${suiteName} pattern matched no files: ${pattern}`)
    }
  }
})

test('workspace check is the single local quality gate', () => {
  const manifest = readJSON('package.json')

  assert.equal(manifest.scripts['test:scripts'], 'node scripts/run-node-tests.mjs --suite scripts')
  assert.match(manifest.scripts.check, /\bpnpm run check:generated-paths\b/)
  assert.match(manifest.scripts.check, /\bpnpm run check:workspace-packages\b/)
  assert.match(manifest.scripts.check, /\bpnpm run check:plugin-distribution\b/)
  assert.match(manifest.scripts.check, /\bpnpm run runtime:registry\b/)
  assert.match(manifest.scripts.check, /\bpnpm run test:scripts\b/)
  assert.match(manifest.scripts.check, /\bpnpm run typecheck\b/)
  assert.match(manifest.scripts.check, /\bpnpm run build\b/)
  assert.match(manifest.scripts.check, /\bpnpm run test\b/)
  assert.match(manifest.scripts.check, /\bpnpm run quality:ui\b/)
  assert.match(manifest.scripts.check, /\bpnpm run quality:frontend\b/)
  assert.match(manifest.scripts.check, /\bpnpm run verify:package-resources\b/)
})

test('backend release gate stays stable and keeps architecture debt explicit', () => {
  const rootManifest = readJSON('package.json')
  const backendManifest = readJSON('services/data-service/package.json')

  assert.match(rootManifest.scripts['check:backend'], /@movscript\/data-service run test:unit/)
  assert.match(rootManifest.scripts['check:backend'], /@movscript\/data-service run test:model-capability-contract/)
  assert.doesNotMatch(rootManifest.scripts['check:backend'], /@movscript\/data-service test\b/)
  assert.equal(backendManifest.scripts['test:unit'], 'make test-unit')
  assert.equal(backendManifest.scripts['test:architecture'], 'make test-architecture')
})

test('release check reuses real workspace gates instead of stale test paths', () => {
  const steps = releaseWorkflowSteps('check')
  const commands = steps.map(([, command, args]) => [command, ...args].join(' '))
  const flattened = commands.join('\n')

  assert.match(flattened, /pnpm run test:scripts/)
  assert.match(flattened, /pnpm run check:generated-paths/)
  assert.match(flattened, /pnpm run check:workspace-packages/)
  assert.match(flattened, /pnpm run check:plugin-distribution/)
  assert.match(flattened, /pnpm run runtime:registry/)
  assert.match(flattened, /pnpm run test:packages/)
  assert.match(flattened, /pnpm --filter @movscript\/desktop test/)
  assert.match(flattened, /pnpm run check:backend/)
  assert.match(flattened, /pnpm run quality:frontend/)
  assert.match(flattened, /verify-package-resources/)
  assert.doesNotMatch(flattened, /tests\/scripts\/release\/\*\.test\.mjs/)
})
