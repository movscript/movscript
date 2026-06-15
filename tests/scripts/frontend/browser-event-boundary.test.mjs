import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'

const root = resolve('.')
const allowedWindowEventAdapters = new Set([
  'apps/frontend/src/shared/infrastructure/windowEvents.ts',
])

test('window event subscription is centralized in the browser event adapter', () => {
  const sourceFiles = listFiles(resolve(root, 'apps/frontend/src'), (file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !/\.(test|spec)\.[tj]sx?$/.test(file))
    .filter((file) => !relative(root, file).includes('/e2e/'))

  for (const file of sourceFiles) {
    const path = relative(root, file)
    const source = readFileSync(file, 'utf8')
    if (allowedWindowEventAdapters.has(path)) continue
    assert.doesNotMatch(source, /window\.(?:addEventListener|removeEventListener)\b/, `${path} must use listenToWindowEvent`)
    assert.doesNotMatch(source, /window\.dispatchEvent\b/, `${path} must publish through a typed bridge`)
  }
})

function listFiles(directory, predicate) {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) return listFiles(path, predicate)
      return predicate(path) ? [path] : []
    })
}
