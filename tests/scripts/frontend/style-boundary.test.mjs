import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'

const root = resolve('.')

test('app global CSS only owns base imports and reset styles', () => {
  const appStyles = readSource('apps/frontend/src/index.css')

  assert.doesNotMatch(appStyles, /@layer components/)
  assert.doesNotMatch(appStyles, /\.(shot-library|shot-reference|shot-import|shot-upload|resource-page)__?/)
})

test('feature page styles live with their feature components', () => {
  const shotPageSource = readSource('apps/frontend/src/features/shot-library/components/ShotLibraryPage.tsx')
  const shotStyles = readCssBundle('apps/frontend/src/features/shot-library/components/ShotLibraryPage.css')
  const resourcePageSource = readSource('apps/frontend/src/features/resources/components/ResourcesPage.tsx')
  const resourceStyles = readCssBundle('apps/frontend/src/features/resources/components/ResourcesPage.css')

  assert.match(shotPageSource, /import '\.\/ShotLibraryPage\.css'/)
  assert.match(shotStyles, /\.shot-library-page/)
  assert.match(shotStyles, /\.shot-import-dialog__body\[data-scroll-owner="dialog-body"\]/)
  assert.match(resourcePageSource, /import '\.\/ResourcesPage\.css'/)
  assert.match(resourceStyles, /\.resource-page__external-preview-dialog/)
})

test('feature CSS does not define global token namespace or override UI internals', () => {
  const featureCssFiles = listFiles(resolve(root, 'apps/frontend/src/features'), (file) => file.endsWith('.css'))
  const forbiddenInternalClass = /\.(?:ms|app-settings|user-profile)-[A-Za-z0-9_-]+__/
  const forbiddenGlobalTokenDefinition = /--ms-[A-Za-z0-9-]+\s*:/

  for (const file of featureCssFiles) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, forbiddenInternalClass, `${relative(root, file)} must not override UI package internal element classes`)
    assert.doesNotMatch(source, forbiddenGlobalTokenDefinition, `${relative(root, file)} must not define global --ms-* tokens`)
  }
})

test('feature CSS files stay split by component or section', () => {
  const featureCssFiles = listFiles(resolve(root, 'apps/frontend/src/features'), (file) => file.endsWith('.css'))
  const maxFeatureCssLines = 1000

  for (const file of featureCssFiles) {
    const lineCount = readFileSync(file, 'utf8').split('\n').length
    assert.ok(
      lineCount <= maxFeatureCssLines,
      `${relative(root, file)} has ${lineCount} lines; split feature CSS by component or section`,
    )
  }
})

function readSource(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

function readCssBundle(path, seen = new Set()) {
  const absolutePath = resolve(root, path)
  if (seen.has(absolutePath)) return ''
  seen.add(absolutePath)
  const source = readFileSync(absolutePath, 'utf8')
  const importedSources = [...source.matchAll(/@import\s+['"]\.\/([^'"]+)['"];/g)].map((match) => {
    const importedPath = join(absolutePath, '..', match[1])
    return readCssBundle(relative(root, importedPath), seen)
  })

  return [source, ...importedSources].join('\n')
}

function listFiles(directory, predicate) {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) return listFiles(path, predicate)
      return predicate(path) ? [path] : []
    })
}
