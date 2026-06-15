import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const canvasPageSource = readSource('apps/frontend/src/features/canvas/components/CanvasEditorPage.tsx')
const browserGuardsSource = readSource('apps/frontend/src/features/canvas/application/useCanvasBrowserGuards.ts')
const canvasExitControllerSource = readSource('apps/frontend/src/features/canvas/application/useCanvasExitController.ts')
const canvasListSource = readSource('apps/frontend/src/features/canvas/components/CanvasListView.tsx')
const canvasListUiSource = readSource('apps/frontend/src/features/canvas/components/CanvasListUi.tsx')
const canvasListUiCss = readSource('apps/frontend/src/features/canvas/components/CanvasListUi.css')
const packageCanvasSource = readSource('packages/ui/src/components/business/canvas/index.tsx')
const packageCanvasCss = readSource('packages/ui/src/components/business/canvas/styles.css')
const canvasDocumentSource = readSource('apps/frontend/src/features/canvas/editor/useCanvasDocument.ts')
const workflowPanelsSource = readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowPanels.tsx')
const workflowReferencesSource = readSource('apps/frontend/src/features/canvas/integrations/workflowReferences.ts')
const canvasResourcesIntegrationSource = readSource('apps/frontend/src/features/canvas/integrations/resources.ts')
const canvasRuntimeExecutorSource = readSource('apps/frontend/src/features/canvas/runtime/useCanvasRuntimeExecutor.ts')
const canvasQueryKeysSource = readSource('apps/frontend/src/features/canvas/application/canvasQueryKeys.ts')
const canvasMutationSource = readSource('apps/frontend/src/features/canvas/application/canvasMutationInvalidation.ts')
const resourceQueryKeysSource = readSource('apps/frontend/src/features/resources/application/resourceQueryKeys.ts')

test('canvas editor delegates global browser guards', () => {
  assert.match(canvasPageSource, /from '@\/features\/canvas\/application\/useCanvasBrowserGuards'/)
  assert.match(canvasPageSource, /from '@\/features\/canvas\/application\/useCanvasExitController'/)
  assert.doesNotMatch(canvasPageSource, /window\.addEventListener/)
  assert.doesNotMatch(canvasPageSource, /window\.removeEventListener/)
  assert.match(canvasPageSource, /useCanvasSaveShortcut\(save\.mutate\)/)
  assert.match(canvasExitControllerSource, /useCanvasBeforeUnloadGuard\(shouldBlockCanvasExit\)/)

  assert.match(browserGuardsSource, /export function useCanvasSaveShortcut/)
  assert.match(browserGuardsSource, /from '@\/shared\/infrastructure\/windowEvents'/)
  assert.match(browserGuardsSource, /listenToWindowEvent\('keydown', onKeyDown\)/)
  assert.match(browserGuardsSource, /export function useCanvasBeforeUnloadGuard/)
  assert.match(browserGuardsSource, /listenToWindowEvent\('beforeunload', onBeforeUnload\)/)
  assert.doesNotMatch(browserGuardsSource, /window\.addEventListener/)
  assert.doesNotMatch(browserGuardsSource, /window\.removeEventListener/)
})

test('canvas surfaces delegate query keys and invalidation', () => {
  assert.match(canvasPageSource, /from '@\/features\/canvas\/application\/canvasQueryKeys'/)
  assert.match(canvasPageSource, /canvasKeys\.detail\(id\)/)
  assert.match(canvasPageSource, /prepareCanvasRenameMutation\(queryClient, id, name\)/)
  assert.match(canvasPageSource, /restoreCanvasRenameMutation\(queryClient, id, context\)/)
  assert.match(canvasPageSource, /commitCanvasRenameMutation\(queryClient, id, nextCanvas\)/)
  assert.match(canvasPageSource, /invalidateCanvasMutationResult\(queryClient, canvasListChangedResult\(\{ changedIds: \[id\] \}\)\)/)
  assert.doesNotMatch(canvasPageSource, /queryKey: \['canvas'/)
  assert.doesNotMatch(canvasPageSource, /queryKey: \['canvases'/)
  assert.doesNotMatch(canvasPageSource, /queryClient\.(cancelQueries|getQueryData|setQueryData)\(/)

  assert.match(canvasListSource, /from '@\/features\/canvas\/application\/canvasQueryKeys'/)
  assert.match(canvasListSource, /canvasKeys\.list\(currentProject\?\.ID\)/)
  assert.match(canvasListSource, /invalidateCanvasMutationResult\(queryClient, canvasListChangedResult/)
  assert.doesNotMatch(canvasListSource, /queryKey: \['canvases'/)

  assert.match(canvasDocumentSource, /from '@\/features\/canvas\/application\/canvasMutationInvalidation'/)
  assert.match(canvasDocumentSource, /invalidateCanvasMutationResult\(qc, canvasDocumentChangedResult\(\{ canvasId \}\)\)/)
  assert.doesNotMatch(canvasDocumentSource, /queryKey: \['canvas'/)

  assert.match(workflowPanelsSource, /from '@\/features\/canvas\/application\/canvasQueryKeys'/)
  assert.match(workflowPanelsSource, /canvasKeys\.referenceWorkflows\(projectId\)/)
  assert.match(workflowPanelsSource, /canvasKeys\.detail\(canvas\.ID\)/)
  assert.doesNotMatch(workflowPanelsSource, /queryKey: \['canvas-reference-workflows'/)
  assert.doesNotMatch(workflowPanelsSource, /queryKey: \['canvas'/)

  assert.match(workflowReferencesSource, /from '@\/features\/canvas\/application\/canvasQueryKeys'/)
  assert.match(workflowReferencesSource, /canvasKeys\.detail\(canvasId\)/)
  assert.doesNotMatch(workflowReferencesSource, /queryKey: \['canvas'/)

  assert.match(canvasResourcesIntegrationSource, /canvasResourceChangedResult\(\{ changedIds: \[resourceId\] \}\)/)
  assert.doesNotMatch(canvasResourcesIntegrationSource, /invalidateQueries\(\{ queryKey: canvasResourceKeys\.shelf/)
  assert.match(canvasRuntimeExecutorSource, /canvasResourceChangedResult\(\)/)
  assert.doesNotMatch(canvasRuntimeExecutorSource, /invalidateQueries\(\{ queryKey: canvasResourceKeys\.(shelf|nodeResources)/)

  assert.match(canvasQueryKeysSource, /export const canvasKeys/)
  assert.match(canvasQueryKeysSource, /all: \['canvases'\] as const/)
  assert.match(canvasQueryKeysSource, /detail: \(canvasId: number \| string\) => \['canvas', canvasId\] as const/)
  assert.match(canvasQueryKeysSource, /referenceWorkflows/)
  assert.doesNotMatch(canvasQueryKeysSource, /export function invalidateCanvasList/)
  assert.doesNotMatch(canvasQueryKeysSource, /export function invalidateCanvasDetail/)
  assert.match(canvasMutationSource, /export type CanvasMutationEvent/)
  assert.match(canvasMutationSource, /export interface CanvasMutationResult/)
  assert.match(canvasMutationSource, /type: 'CanvasListChanged'/)
  assert.match(canvasMutationSource, /type: 'CanvasDocumentChanged'/)
  assert.match(canvasMutationSource, /export function invalidateCanvasMutationResult/)
  assert.match(canvasMutationSource, /export async function prepareCanvasRenameMutation/)
  assert.match(canvasMutationSource, /export function restoreCanvasRenameMutation/)
  assert.match(canvasMutationSource, /export function commitCanvasRenameMutation/)
  assert.match(canvasMutationSource, /queryClient\.cancelQueries\(\{ queryKey \}\)/)
  assert.match(canvasMutationSource, /queryClient\.setQueryData<Canvas>/)
  assert.doesNotMatch(resourceQueryKeysSource, /export function invalidateCanvasResourceQueries/)
})

test('canvas list UI is feature-owned, not package canvas API', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/canvas/list/index.tsx')), false)
  assert.equal(existsSync(resolve('packages/ui/src/components/business/canvas/list/styles.css')), false)
  assert.doesNotMatch(packageCanvasSource, /from "\.\/list"/)
  assert.doesNotMatch(packageCanvasCss, /@import "\.\/list\/styles\.css"/)
  assert.match(canvasListSource, /from '\.\/CanvasListUi'/)

  for (const exportName of [
    'CanvasListShell',
    'CanvasListCreateDialog',
    'CanvasListItem',
    'CanvasListCreateTypeTile',
  ]) {
    assert.doesNotMatch(packageCanvasSource, new RegExp(`\\b${exportName}\\b`), `${exportName} should not remain package-owned`)
    assert.match(canvasListUiSource, new RegExp(`export (function|const) ${exportName}\\b`), `${exportName} should be owned by the canvas feature`)
  }

  assert.match(canvasListUiSource, /import "\.\/CanvasListUi\.css"/)
  assert.match(canvasListUiSource, /from "@movscript\/ui\/business\/app"/)
  assert.match(canvasListUiSource, /from "@movscript\/ui\/primitives"/)
  assert.match(canvasListUiCss, /\.canvas-list\s*\{/)
  assert.match(canvasListUiCss, /\.canvas-list-create-dialog\s*\{/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
