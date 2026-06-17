import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(import.meta.dirname, '../../..')
const bundledWorkspacePackages = [
  '@movscript/core',
  '@movscript/editing',
  '@movscript/engine',
  '@movscript/language',
  '@movscript/theme',
  '@movscript/ui',
  '@movscript/workspace',
]

test('electron main and preload bundle workspace packages for electron-builder', () => {
  const config = readFileSync(resolve(repoRoot, 'apps/frontend/electron.vite.config.ts'), 'utf8')
  for (const packageName of bundledWorkspacePackages) {
    assert.match(config, new RegExp(`'${packageName.replace('/', '\\/')}'`))
  }
  assert.match(config, /externalizeDepsPlugin\(\{\s*exclude:\s*bundledWorkspaceDeps\s*}\)/)
})

test('desktop production dependencies do not include pnpm workspace packages', () => {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'apps/frontend/package.json'), 'utf8'))
  for (const packageName of bundledWorkspacePackages) {
    assert.equal(packageJson.dependencies?.[packageName], undefined)
    assert.equal(packageJson.devDependencies?.[packageName], 'workspace:*')
  }
})
