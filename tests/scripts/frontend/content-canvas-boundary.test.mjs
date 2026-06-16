import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const contentCanvasPageSource = readSource('apps/frontend/src/features/content/components/ContentCanvasWorkspacePage.tsx')
const contentCanvasPanelsSource = readSource('apps/frontend/src/features/content/components/ContentCanvasWorkspacePanels.tsx')
const contentCanvasControllerSource = readSource('apps/frontend/src/features/content/components/useContentCanvasWorkspaceController.ts')
const contentCanvasViewModelSource = readSource('apps/frontend/src/features/content/components/contentCanvasWorkspaceViewModel.ts')
const contentCanvasWorkspaceModelSource = readSource('apps/frontend/src/features/content/components/contentCanvasWorkspaceModel.ts')
const contentCanvasWorkspaceGraphModelSource = readSource('apps/frontend/src/features/content/components/contentCanvasWorkspaceGraphModel.ts')
const contentCanvasQueryKeysSource = readSource('apps/frontend/src/features/content/application/contentCanvasQueryKeys.ts')
const contentCanvasMutationSource = readSource('apps/frontend/src/features/content/application/contentCanvasMutationInvalidation.ts')

test('content canvas mutations publish standard invalidation results', () => {
  assert.match(contentCanvasControllerSource, /from '\.\.\/application\/contentCanvasMutationInvalidation'/)
  assert.match(contentCanvasControllerSource, /invalidateContentCanvasMutationResult\(queryClient, contentCanvasProjectChangedResult\(\{/)
  assert.match(contentCanvasControllerSource, /changedIds: result\.changedNodeIds/)
  assert.doesNotMatch(contentCanvasControllerSource, /invalidateQueries\(\{ queryKey: contentCanvasKeys\.project/)
  assert.doesNotMatch(contentCanvasPageSource, /invalidateContentCanvasMutationResult/)
  assert.doesNotMatch(contentCanvasPageSource, /useQuery/)

  assert.match(contentCanvasQueryKeysSource, /export const contentCanvasKeys/)
  assert.doesNotMatch(contentCanvasQueryKeysSource, /export function invalidateContentCanvas/)
  assert.match(contentCanvasMutationSource, /export type ContentCanvasMutationEvent/)
  assert.match(contentCanvasMutationSource, /export interface ContentCanvasMutationResult/)
  assert.match(contentCanvasMutationSource, /type: 'ContentCanvasProjectChanged'/)
  assert.match(contentCanvasMutationSource, /export function contentCanvasProjectChangedResult/)
  assert.match(contentCanvasMutationSource, /export function invalidateContentCanvasMutationResult/)
  assert.match(contentCanvasMutationSource, /contentCanvasKeys\.project\(event\.projectId\)/)
})

test('content canvas selection is reconciled from latest workspace data', () => {
  assert.match(contentCanvasViewModelSource, /reconcileContentCanvasInspectorSelection/)
  assert.match(contentCanvasViewModelSource, /inspectorSelection/)
  assert.match(contentCanvasPageSource, /selection=\{viewModel\.inspectorSelection\}/)
  assert.match(contentCanvasPageSource, /selected=\{viewModel\.inspectorSelection\}/)
  assert.match(contentCanvasControllerSource, /useState<InspectorSelectionRef>\(\{ kind: 'scene_moment', nodeId: 'scene-main' \}\)/)
  assert.match(contentCanvasWorkspaceModelSource, /from '\.\/contentCanvasWorkspaceGraphModel'/)
  assert.doesNotMatch(contentCanvasWorkspaceModelSource, /function fallbackContentCanvasInspectorSelection/)
  assert.match(contentCanvasWorkspaceGraphModelSource, /export function reconcileContentCanvasInspectorSelection/)
  assert.match(contentCanvasWorkspaceGraphModelSource, /graphIndex\.nodeById\.get\(selection\.nodeId\)/)
  assert.match(contentCanvasWorkspaceGraphModelSource, /fallbackContentCanvasInspectorSelection/)
})

test('content canvas shows an explicit empty preview when no setting or scene moment exists', () => {
  assert.match(contentCanvasPageSource, /activeScene=\{viewModel\.activeScene\}/)
  assert.match(contentCanvasPanelsSource, /const hasPreviewTarget = Boolean\(activeScene \|\| activeSetting\)/)
  assert.match(contentCanvasPanelsSource, /<strong>无预览<\/strong>/)
  assert.match(contentCanvasPanelsSource, /<span>请选择设定、情节。<\/span>/)
  assert.match(contentCanvasPanelsSource, /!hasPreviewTarget \?/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
