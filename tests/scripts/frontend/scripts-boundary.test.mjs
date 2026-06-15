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

test('scripts surfaces delegate query keys and invalidation', () => {
  assert.match(scriptsPageSource, /from '@\/features\/scripts\/application\/scriptQueryKeys'/)
  assert.match(scriptsPageSource, /scriptKeys\.projectScripts\(projectId, workspaceContext\)/)
  assert.match(scriptsPageSource, /scriptKeys\.versions\(projectId\)/)
  assert.match(scriptsPageSource, /invalidateScriptMutationResult\(qc, scriptSavedResult\(\{ projectId, changedIds: \[updated\.ID\] \}\)\)/)
  assert.match(scriptsPageSource, /invalidateScriptMutationResult\(qc, scriptCategoryChangedResult\(\{ projectId, changedIds: \[updated\.ID\] \}\)\)/)
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

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
