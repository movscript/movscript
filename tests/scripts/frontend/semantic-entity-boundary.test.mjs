import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const inlineEditorSource = readSource('apps/frontend/src/shared/ui/SemanticEntityInlineEditor.tsx')
const inlineEditorFieldsSource = readSource('apps/frontend/src/shared/ui/SemanticEntityInlineEditorFields.tsx')
const semanticEntityMutationSource = readSource('apps/frontend/src/shared/application/semanticEntityMutationInvalidation.ts')
const semanticEntityQueryKeysSource = readSource('apps/frontend/src/shared/application/semanticEntityQueryKeys.ts')

test('semantic entity editor delegates query keys and invalidation', () => {
  assert.match(inlineEditorSource, /from '@\/shared\/application\/semanticEntityQueryKeys'/)
  assert.match(inlineEditorSource, /from '@\/shared\/application\/semanticEntityMutationInvalidation'/)
  assert.match(inlineEditorSource, /semanticEntityKeys\.inlineSettings\(projectId\)/)
  assert.match(inlineEditorSource, /semanticEntityKeys\.inlineSettingStates\(projectId\)/)
  assert.match(inlineEditorSource, /semanticEntityKeys\.inlineScriptBlocks\(projectId\)/)
  assert.match(inlineEditorSource, /semanticEntityKeys\.sourceLock\(projectId, config\.kind, record\?\.ID\)/)
  assert.match(inlineEditorSource, /invalidateSemanticEntityMutationResult\(/)
  assert.match(inlineEditorSource, /semanticEntityChangedResult\(\{/)
  assert.doesNotMatch(inlineEditorSource, /queryKey: \['semantic-inline-editor'/)
  assert.doesNotMatch(inlineEditorSource, /queryKey: \['semantic-source-lock'/)
  assert.doesNotMatch(inlineEditorSource, /queryKey: \[config\.kind, projectId\]/)
  assert.doesNotMatch(inlineEditorSource, /queryClient\.invalidateQueries\(\{ queryKey \}\)/)
  assert.doesNotMatch(inlineEditorSource, /invalidateSemanticEntityList/)

  assert.match(semanticEntityQueryKeysSource, /export const semanticEntityKeys/)
  assert.match(semanticEntityQueryKeysSource, /list: \(kind: SemanticEntityConfig\['kind'\], projectId: number \| undefined\) => \[kind, projectId\] as const/)
  assert.match(semanticEntityQueryKeysSource, /inlineSettings/)
  assert.match(semanticEntityQueryKeysSource, /inlineSettingStates/)
  assert.match(semanticEntityQueryKeysSource, /inlineScriptBlocks/)
  assert.match(semanticEntityQueryKeysSource, /sourceLock/)
  assert.doesNotMatch(semanticEntityQueryKeysSource, /export function invalidateSemanticEntityList/)

  assert.match(semanticEntityMutationSource, /export interface SemanticEntityMutationEvent/)
  assert.match(semanticEntityMutationSource, /type: 'SemanticEntityChanged'/)
  assert.match(semanticEntityMutationSource, /consumerQueryKey/)
  assert.match(semanticEntityMutationSource, /semanticEntityKeys\.list\(event\.kind, event\.projectId\)/)
  assert.match(semanticEntityMutationSource, /semanticEntityKeys\.sourceLock\(event\.projectId, event\.kind, event\.recordId\)/)
  assert.match(semanticEntityMutationSource, /export function invalidateSemanticEntityMutationResult/)
})

test('semantic entity editor delegates field sections and source lock notice', () => {
  assert.match(inlineEditorSource, /from '@\/shared\/ui\/SemanticEntityInlineEditorFields'/)
  assert.match(inlineEditorSource, /<SemanticEntityInlineEditorFieldSections/)
  assert.doesNotMatch(inlineEditorSource, /function FieldControl/)
  assert.doesNotMatch(inlineEditorSource, /function SourceLockNotice/)
  assert.doesNotMatch(inlineEditorSource, /DetailEntityFieldControl/)
  assert.doesNotMatch(inlineEditorSource, /DetailEntitySourceLockNotice/)
  assert.doesNotMatch(inlineEditorSource, /AppDisclosure/)

  assert.match(inlineEditorFieldsSource, /export function SemanticEntityInlineEditorFieldSections/)
  assert.match(inlineEditorFieldsSource, /function FieldControl/)
  assert.match(inlineEditorFieldsSource, /function SourceLockNotice/)
  assert.match(inlineEditorFieldsSource, /DetailEntityFieldControl/)
  assert.match(inlineEditorFieldsSource, /DetailEntitySourceLockNotice/)
  assert.match(inlineEditorFieldsSource, /AppDisclosure/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
