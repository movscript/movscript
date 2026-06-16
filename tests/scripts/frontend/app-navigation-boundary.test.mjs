import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

function readSource(relativePath) {
  return readFileSync(resolve(relativePath), 'utf8')
}

const appNavigationSource = readSource('packages/ui/src/components/business/app/navigation/index.tsx')
const appNavigationCss = readSource('packages/ui/src/components/business/app/navigation/styles.css')
const appTopControlsSource = readSource('apps/frontend/src/features/app-shell/components/AppTopControls.tsx')

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

test('app navigation reuses package base layout and truncation primitives', () => {
  assert.match(appNavigationSource, /className=\{cn\("ms-action-row ms-type-caption app-pager"/)
  assert.match(appNavigationSource, /className="ms-action-row app-pager__controls"/)
  assert.match(appNavigationSource, /className=\{cn\("ms-action-row app-top-controls"/)
  assert.match(appNavigationSource, /className=\{cn\("ms-text-truncate ms-type-label app-top-menu-label__primary"/)
  assert.match(appNavigationSource, /className=\{cn\("ms-text-truncate ms-type-caption app-top-menu-label__secondary"/)
  assert.match(appNavigationSource, /className=\{cn\("ms-text-truncate app-top-menu-item__text"/)
  assert.match(appNavigationSource, /className="ms-inline-center app-top-menu-item__leading-icon"/)
  assert.match(appTopControlsSource, /className="ms-inline-center app-top-menu-label__icon-text"/)
  assert.doesNotMatch(appNavigationCss, /\.app-top-controls\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(appNavigationCss, /\.app-pager\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(appNavigationCss, /\.app-pager__controls\s*\{[^}]*display:\s*flex/)
  assert.doesNotMatch(appNavigationCss, /\.app-pager\s*\{[^}]*font-size:/)
  assert.doesNotMatch(appNavigationCss, /\.app-top-menu-label__primary\s*\{[^}]*font-size:/)
  assert.doesNotMatch(appNavigationCss, /\.app-top-menu-label__secondary\s*\{[^}]*font-size:/)
  assert.doesNotMatch(appNavigationCss, /\.app-top-menu-label__icon-text\s*\{[^}]*display:\s*inline-flex/)
  assert.doesNotMatch(appNavigationCss, /\.app-top-menu-label__icon-text\s*\{[^}]*align-items:/)
  assert.doesNotMatch(appNavigationCss, /\.app-top-menu-label__primary,\s*\.app-top-menu-label__secondary,\s*\.app-top-menu-item__text\s*\{[^}]*text-overflow:\s*ellipsis/)
})
