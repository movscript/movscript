import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

function readSource(relativePath) {
  return readFileSync(resolve(relativePath), 'utf8')
}

const appNavigationSource = readSource('packages/ui/src/components/business/app/navigation/index.tsx')
const appNavigationCss = readSource('packages/ui/src/components/business/app/navigation/styles.css')

test('unused app top navigation dialog helpers are not shipped from packages/ui', () => {
  for (const exportName of [
    'AppTopCreateProjectDialogContent',
    'AppTopCreateProjectForm',
    'AppTopCreateProjectField',
    'AppTopCreateProjectLabel',
    'AppTopCreateProjectInput',
    'AppTopCreateProjectTextarea',
    'AppTopCreateProjectActions',
    'AppTopCreateProjectActionButton',
    'AppTopLanguageLabel',
    'AppTopUserMenuContent',
    'AppTopMenuSelectedIcon',
  ]) {
    assert.doesNotMatch(appNavigationSource, new RegExp(`export function ${exportName}\\b`))
  }

  assert.doesNotMatch(appNavigationCss, /app-top-create-project/)
  assert.doesNotMatch(appNavigationCss, /app-top-user-menu/)
  assert.doesNotMatch(appNavigationCss, /app-top-controls__sr-label/)
  assert.doesNotMatch(appNavigationCss, /app-top-menu-item__selected-icon/)
})
