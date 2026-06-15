import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'

const root = resolve('.')

test('feature domain files do not own browser, Electron, or HTTP side effects', () => {
  const domainFiles = listFiles(resolve(root, 'apps/frontend/src/features'), (file) => (
    file.includes('/domain/')
      && /\.(ts|tsx)$/.test(file)
      && !/\.(test|spec)\.[tj]sx?$/.test(file)
  ))

  for (const file of domainFiles) {
    const path = relative(root, file)
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /from ['"]@\/shared\/infrastructure\/api['"]/, `${path} must use application services for HTTP`)
    assert.doesNotMatch(source, /from ['"]@\/shared\/infrastructure\/electronApiAccess['"]/, `${path} must use application services for Electron`)
    assert.doesNotMatch(source, /from ['"]@\/shared\/infrastructure\/browserStorage['"]/, `${path} must not own browser storage`)
    assert.doesNotMatch(source, /from ['"]@\/shared\/infrastructure\/windowEvents['"]/, `${path} must not own browser events`)
    assert.doesNotMatch(source, /\b(?:window|document)\./, `${path} must stay browser-independent`)
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
