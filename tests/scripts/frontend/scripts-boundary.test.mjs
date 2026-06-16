import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const scriptsPageSource = [
  readSource('apps/frontend/src/features/scripts/components/ScriptsPage.tsx'),
  readSource('apps/frontend/src/features/scripts/components/ScriptsPageParts.tsx'),
].join('\n')
const scriptDisplayModelSource = readSource('apps/frontend/src/features/scripts/presentation/scriptDisplayModel.ts')
const scriptQueryKeysSource = readSource('apps/frontend/src/features/scripts/application/scriptQueryKeys.ts')
const scriptMutationSource = readSource('apps/frontend/src/features/scripts/application/scriptMutationInvalidation.ts')
const entityCreateFormsSource = readSource('apps/frontend/src/shared/ui/EntityCreateForms.tsx')
const scriptsPageUiCssSource = readSource('apps/frontend/src/features/scripts/components/ScriptsPageUi.css')
const scriptsPageEditorCssSource = readSource('apps/frontend/src/features/scripts/components/ScriptsPageEditor.css')
const scriptsPageUiSource = readSource('apps/frontend/src/features/scripts/components/ScriptsPageUi.tsx')
const scriptsPageWorkspaceUiSource = readSource('apps/frontend/src/features/scripts/components/ScriptsPageWorkspaceUi.tsx')
const scriptsPageEditorUiSource = readSource('apps/frontend/src/features/scripts/components/ScriptsPageEditorUi.tsx')
const scriptsPageDetailUiSource = readSource('apps/frontend/src/features/scripts/components/ScriptsPageDetailUi.tsx')
const scriptsPageVersionBlockUiSource = readSource('apps/frontend/src/features/scripts/components/ScriptsPageVersionBlockUi.tsx')

test('scripts surfaces delegate query keys and invalidation', () => {
  assert.match(scriptsPageSource, /from '@\/features\/scripts\/application\/scriptQueryKeys'/)
  assert.match(scriptsPageSource, /scriptKeys\.projectScripts\(projectId, workspaceContext\)/)
  assert.match(scriptsPageSource, /scriptKeys\.versions\(projectId\)/)
  assert.match(scriptsPageSource, /invalidateScriptMutationResult\(qc, scriptSavedResult\(\{ projectId, changedIds: \[updated\.ID\] \}\)\)/)
  assert.match(scriptsPageSource, /invalidateScriptMutationResult\(qc, scriptVersionCreatedResult\(\{ projectId, changedIds: \[version\.ID\] \}\)\)/)
  assert.doesNotMatch(scriptsPageSource, /queryKey: \['scripts'/)
  assert.doesNotMatch(scriptsPageSource, /queryKey: \['semantic-script-versions'/)
  assert.doesNotMatch(scriptsPageSource, /invalidateQueries\(\{ queryKey: \['scripts'/)

  assert.match(entityCreateFormsSource, /from '@\/features\/scripts\/application\/scriptMutationInvalidation'/)
  assert.match(entityCreateFormsSource, /invalidateScriptMutationResult\(qc, scriptCreatedResult\(\{ projectId, changedIds: \[created\.ID\] \}\)\)/)
  assert.doesNotMatch(entityCreateFormsSource, /queryKey: \['scripts'/)
  assert.doesNotMatch(entityCreateFormsSource, /queryKey: \['artifact-refs'/)

  assert.match(scriptQueryKeysSource, /export const scriptKeys/)
  assert.match(scriptQueryKeysSource, /'scripts'/)
  assert.match(scriptQueryKeysSource, /'semantic-script-versions'/)
  assert.match(scriptQueryKeysSource, /'artifact-refs'/)
  assert.doesNotMatch(scriptQueryKeysSource, /export function invalidateProjectScripts/)
  assert.doesNotMatch(scriptQueryKeysSource, /export function invalidateScriptVersions/)
  assert.doesNotMatch(scriptQueryKeysSource, /export function invalidateScriptArtifactRefs/)

  assert.match(scriptMutationSource, /export type ScriptMutationEvent/)
  assert.match(scriptMutationSource, /export interface ScriptMutationResult/)
  assert.match(scriptMutationSource, /'ScriptSaved'/)
  assert.match(scriptMutationSource, /'ScriptCategoryChanged'/)
  assert.match(scriptMutationSource, /'ScriptVersionCreated'/)
  assert.match(scriptMutationSource, /'ScriptCreated'/)
  assert.match(scriptMutationSource, /export function invalidateScriptMutationResult/)
})

test('scripts page delegates display helpers to presentation model', () => {
  assert.match(scriptsPageSource, /from '@\/features\/scripts\/presentation\/scriptDisplayModel'/)
  for (const helperName of [
    'scriptLibraryItemMeta',
    'groupScriptsByCategory',
    'categoryLabel',
    'scriptWorkspaceSourceText',
    'scriptVersionSourceText',
    'scriptEditorLines',
    'normalizeComparableScriptText',
    'formatDate',
  ]) {
    assert.match(scriptDisplayModelSource, new RegExp(`export function ${helperName}\\b`))
    assert.doesNotMatch(scriptsPageSource, new RegExp(`function ${helperName}\\b`))
  }
})

test('scripts page editor styles are split from the workbench shell stylesheet', () => {
  assert.match(scriptsPageUiCssSource, /@import "\.\/ScriptsPageEditor\.css"/)
  assert.doesNotMatch(scriptsPageUiCssSource, /\.script-editor-form\s*\{/)
  assert.doesNotMatch(scriptsPageUiCssSource, /\.script-editor-form__body-grid\s*\{/)
  assert.match(scriptsPageEditorCssSource, /\.script-editor-form\s*\{/)
  assert.match(scriptsPageEditorCssSource, /\.script-editor-form__body-grid\s*\{/)
  assert.match(scriptsPageEditorCssSource, /\.script-editor-form__outline-item\s*\{/)
})

test('scripts feature UI implementation is split behind a thin barrel', () => {
  assert.match(scriptsPageUiSource, /import "\.\/ScriptsPageUi\.css"/)
  for (const moduleName of [
    'ScriptsPageWorkspaceUi',
    'ScriptsPageEditorUi',
    'ScriptsPageDetailUi',
    'ScriptsPageVersionBlockUi',
  ]) {
    assert.match(scriptsPageUiSource, new RegExp(`export \\* from "\\./${moduleName}"`))
  }
  assert.doesNotMatch(scriptsPageUiSource, /export function Script/)
  assert.doesNotMatch(scriptsPageUiSource, /forwardRef/)
  assert.ok(scriptsPageUiSource.split('\n').length < 40, 'ScriptsPageUi must stay a thin compatibility barrel')

  assert.match(scriptsPageWorkspaceUiSource, /export function ScriptWorkspaceShell/)
  assert.match(scriptsPageEditorUiSource, /export const ScriptEditorHiddenFileInput/)
  assert.match(scriptsPageDetailUiSource, /export function ScriptDetailHeader/)
  assert.match(scriptsPageDetailUiSource, /export function ScriptReadinessPanel/)
  assert.match(scriptsPageVersionBlockUiSource, /export function ScriptVersionLineEditor/)
  assert.match(scriptsPageVersionBlockUiSource, /export function ScriptBlockSelectField/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
