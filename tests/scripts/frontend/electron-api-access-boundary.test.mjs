import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'

const root = resolve('.')
const electronApiAccessPath = 'apps/frontend/src/shared/infrastructure/electronApiAccess.ts'

test('renderer production code accesses window.api only through the Electron API access adapter', () => {
  const sourceFiles = listFiles(resolve(root, 'apps/frontend/src'), (file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !/\.(test|spec)\.[tj]sx?$/.test(file))
    .filter((file) => !relative(root, file).includes('/e2e/'))

  for (const file of sourceFiles) {
    const path = relative(root, file)
    const source = readFileSync(file, 'utf8')
    if (path === electronApiAccessPath) {
      assert.match(source, /return window\.api/)
      continue
    }
    assert.doesNotMatch(source, /window\.api\b/, `${path} must use readElectronApi()`)
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
