import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const canvasPageSource = readCanvasEditorContractSource()
const browserGuardsSource = readSource('apps/frontend/src/features/canvas/application/useCanvasBrowserGuards.ts')
const canvasExitControllerSource = readSource('apps/frontend/src/features/canvas/application/useCanvasExitController.ts')
const canvasListSource = readSource('apps/frontend/src/features/canvas/components/CanvasListView.tsx')
const canvasListUiSource = readSource('apps/frontend/src/features/canvas/components/CanvasListUi.tsx')
const canvasListUiCss = readSource('apps/frontend/src/features/canvas/components/CanvasListUi.css')
const packageCanvasSource = readSource('packages/ui/src/components/business/canvas/index.tsx')
const packageCanvasCss = readSource('packages/ui/src/components/business/canvas/styles.css')
const canvasDocumentSource = readSource('apps/frontend/src/features/canvas/editor/useCanvasDocument.ts')
const canvasRenameControllerSource = readSource('apps/frontend/src/features/canvas/application/useCanvasRenameController.ts')
const canvasRenderModelSource = readSource('apps/frontend/src/features/canvas/presentation/useCanvasEditorRenderModel.ts')
const canvasConnectionControllerSource = readSource('apps/frontend/src/features/canvas/presentation/useCanvasConnectionController.ts')
const canvasDropControllerSource = readSource('apps/frontend/src/features/canvas/presentation/useCanvasDropController.ts')
const canvasContextMenuControllerSource = readSource('apps/frontend/src/features/canvas/presentation/useCanvasContextMenuController.ts')
const canvasViewStateSource = readSource('apps/frontend/src/features/canvas/presentation/useCanvasEditorViewState.ts')
const canvasWorkflowReferenceActionsSource = readSource('apps/frontend/src/features/canvas/presentation/useCanvasWorkflowReferenceNodeActions.ts')
const canvasNodeChangeControllerSource = readSource('apps/frontend/src/features/canvas/presentation/useCanvasNodeChangeController.ts')
const workflowPanelsSource = [
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowPanels.tsx'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowReferencePicker.tsx'),
].join('\n')
const workflowReferencesSource = readSource('apps/frontend/src/features/canvas/integrations/workflowReferences.ts')
const canvasResourcesIntegrationSource = readSource('apps/frontend/src/features/canvas/integrations/resources.ts')
const canvasRuntimeExecutorSource = readSource('apps/frontend/src/features/canvas/runtime/useCanvasRuntimeExecutor.ts')
const canvasQueryKeysSource = readSource('apps/frontend/src/features/canvas/application/canvasQueryKeys.ts')
const canvasMutationSource = readSource('apps/frontend/src/features/canvas/application/canvasMutationInvalidation.ts')
const resourceQueryKeysSource = readSource('apps/frontend/src/features/resources/application/resourceQueryKeys.ts')
const generationNodesSource = readSource('apps/frontend/src/features/canvas/ui/canvasGenerationNodes.tsx')
const generationInputPanelSource = readSource('apps/frontend/src/features/canvas/ui/canvasGenerationInputPanel.tsx')

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
  assert.match(canvasPageSource, /from '@\/features\/canvas\/application\/useCanvasRenameController'/)
  assert.match(canvasPageSource, /useCanvasRenameController\(\{[\s\S]*canvasId: id,[\s\S]*setCanvasName,[\s\S]*t,[\s\S]*\}\)/)
  assert.doesNotMatch(canvasPageSource, /queryKey: \['canvas'/)
  assert.doesNotMatch(canvasPageSource, /queryKey: \['canvases'/)
  assert.doesNotMatch(canvasPageSource, /queryClient\.(cancelQueries|getQueryData|setQueryData)\(/)
  assert.doesNotMatch(canvasPageSource, /prepareCanvasRenameMutation\(/)
  assert.doesNotMatch(canvasPageSource, /restoreCanvasRenameMutation\(/)
  assert.doesNotMatch(canvasPageSource, /commitCanvasRenameMutation\(/)

  assert.match(canvasListSource, /from '@\/features\/canvas\/application\/canvasQueryKeys'/)
  assert.match(canvasListSource, /canvasKeys\.list\(currentProject\?\.ID\)/)
  assert.match(canvasListSource, /invalidateCanvasMutationResult\(queryClient, canvasListChangedResult/)
  assert.doesNotMatch(canvasListSource, /queryKey: \['canvases'/)

  assert.match(canvasDocumentSource, /from '@\/features\/canvas\/application\/canvasMutationInvalidation'/)
  assert.match(canvasDocumentSource, /invalidateCanvasMutationResult\(qc, canvasDocumentChangedResult\(\{ canvasId \}\)\)/)
  assert.doesNotMatch(canvasDocumentSource, /queryKey: \['canvas'/)
  assert.match(canvasRenameControllerSource, /from '@\/features\/canvas\/application\/canvasMutationInvalidation'/)
  assert.match(canvasRenameControllerSource, /prepareCanvasRenameMutation\(queryClient, id, name\)/)
  assert.match(canvasRenameControllerSource, /restoreCanvasRenameMutation\(queryClient, id, context\)/)
  assert.match(canvasRenameControllerSource, /commitCanvasRenameMutation\(queryClient, id, nextCanvas\)/)
  assert.match(canvasRenameControllerSource, /invalidateCanvasMutationResult\(queryClient, canvasListChangedResult\(\{ changedIds: \[id\] \}\)\)/)
  assert.doesNotMatch(canvasRenameControllerSource, /queryKey: \['canvas'/)

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

test('canvas editor render model is owned by the presentation layer', () => {
  assert.match(canvasPageSource, /from '@\/features\/canvas\/presentation\/useCanvasEditorRenderModel'/)
  assert.match(canvasPageSource, /useCanvasEditorRenderModel\(\{[\s\S]*canvasNodeResourceById,[\s\S]*updateNodeData,[\s\S]*\}\)/)
  assert.match(canvasRenderModelSource, /export function useCanvasEditorRenderModel/)
  assert.match(canvasRenderModelSource, /const incomingEdgesByTarget = new Map<string, Edge\[]>/)
  assert.match(canvasRenderModelSource, /referenceResources\.push\(resource\)/)
  assert.match(canvasRenderModelSource, /MarkerType\.ArrowClosed/)
  assert.doesNotMatch(canvasPageSource, /MarkerType\.ArrowClosed/)
  assert.doesNotMatch(canvasPageSource, /const incomingEdgesByTarget = new Map/)
  assert.doesNotMatch(canvasPageSource, /referenceResources\.push\(resource\)/)
})

test('canvas editor connection rules are owned by the presentation layer', () => {
  assert.match(canvasPageSource, /from '@\/features\/canvas\/presentation\/useCanvasConnectionController'/)
  assert.match(canvasPageSource, /useCanvasConnectionController\(\{ edges, nodes, setEdges, t \}\)/)
  assert.match(canvasConnectionControllerSource, /export function useCanvasConnectionController/)
  assert.match(canvasConnectionControllerSource, /arePortTypesCompatible\(sourcePort\.type, targetPort\.type\)/)
  assert.match(canvasConnectionControllerSource, /targetPort\?\.maxCount/)
  assert.match(canvasConnectionControllerSource, /edgeConnectionKey\(edge\) === edgeConnectionKey\(nextEdge\)/)
  assert.match(canvasConnectionControllerSource, /createCanvasEdgeId\(\{ source: params\.source, target: params\.target, sourceHandle, targetHandle \}\)/)
  assert.doesNotMatch(canvasPageSource, /arePortTypesCompatible/)
  assert.doesNotMatch(canvasPageSource, /edgeConnectionKey/)
  assert.doesNotMatch(canvasPageSource, /addEdge\(/)
  assert.doesNotMatch(canvasPageSource, /createCanvasEdgeId/)
})

test('canvas editor drop handling is owned by the presentation layer', () => {
  assert.match(canvasPageSource, /from '@\/features\/canvas\/presentation\/useCanvasDropController'/)
  assert.match(canvasPageSource, /useCanvasDropController\(\{[\s\S]*addNodeAt,[\s\S]*addWorkflowReferenceNodeAt,[\s\S]*canvasCoordinateSpace,[\s\S]*canvasPaneRef,[\s\S]*setNodes,[\s\S]*t,[\s\S]*\}\)/)
  assert.match(canvasDropControllerSource, /export function useCanvasDropController/)
  assert.match(canvasDropControllerSource, /readCanvasDropPayload\(event\.dataTransfer/)
  assert.match(canvasDropControllerSource, /canvasClientPointFromEvent\(event\)/)
  assert.match(canvasDropControllerSource, /canvasViewportDropHitBoxFromEvent\(\{ event, viewport: canvasPaneRef\.current, payload \}\)/)
  assert.match(canvasDropControllerSource, /acceptCanvasDropDragOver\(\{ dataTransfer: event\.dataTransfer, hitBox \}\)/)
  assert.match(canvasDropControllerSource, /uploadCanvasResourceFile\(file\)/)
  assert.match(canvasDropControllerSource, /switch \(payload\.kind\)/)
  assert.doesNotMatch(canvasPageSource, /readCanvasDropPayload/)
  assert.doesNotMatch(canvasPageSource, /acceptCanvasDropDragOver/)
  assert.doesNotMatch(canvasPageSource, /uploadCanvasResourceFile/)
  assert.doesNotMatch(canvasPageSource, /canvasViewportDropHitBoxFromEvent/)
})

test('canvas editor context menu geometry is owned by the presentation layer', () => {
  assert.match(canvasPageSource, /from '@\/features\/canvas\/presentation\/useCanvasContextMenuController'/)
  assert.match(canvasPageSource, /useCanvasContextMenuController\(\{ canvasPaneRef \}\)/)
  assert.match(canvasContextMenuControllerSource, /export function useCanvasContextMenuController/)
  assert.match(canvasContextMenuControllerSource, /canvasClientPointFromEvent\(event\)/)
  assert.match(canvasContextMenuControllerSource, /canvasOverlayPointFromViewportElement\(point, canvasPaneRef\.current\)/)
  assert.match(canvasContextMenuControllerSource, /canvasViewportContextMenuBoundary\(canvasPaneRef\.current\)/)
  assert.doesNotMatch(canvasPageSource, /canvasClientPointFromEvent/)
  assert.doesNotMatch(canvasPageSource, /canvasViewportContextMenuBoundary/)
  assert.doesNotMatch(canvasPageSource, /canvasOverlayPointFromViewportElement/)
})

test('canvas editor view state is owned by the presentation layer', () => {
  assert.match(canvasPageSource, /from '@\/features\/canvas\/presentation\/useCanvasEditorViewState'/)
  assert.match(canvasPageSource, /useCanvasEditorViewState\(\{[\s\S]*activeRun,[\s\S]*selectedNodeIds,[\s\S]*\}\)/)
  assert.match(canvasViewStateSource, /export function useCanvasEditorViewState/)
  assert.match(canvasViewStateSource, /CANVAS_NODE_META\[selectedNode\.type as NodeType\]/)
  assert.match(canvasViewStateSource, /CANVAS_MINIMAP_NODE_LIMIT/)
  assert.match(canvasViewStateSource, /canvasNodeIsAiProcessor/)
  assert.match(canvasViewStateSource, /canvasNodeIsDone/)
  assert.match(canvasViewStateSource, /canvasNodeIsRunning/)
  assert.doesNotMatch(canvasPageSource, /CANVAS_NODE_META/)
  assert.doesNotMatch(canvasPageSource, /CANVAS_MINIMAP_NODE_LIMIT/)
  assert.doesNotMatch(canvasPageSource, /canvasNodeIsAiProcessor/)
  assert.doesNotMatch(canvasPageSource, /canvasNodeIsDone/)
  assert.doesNotMatch(canvasPageSource, /canvasNodeIsRunning/)
  assert.doesNotMatch(canvasPageSource, /nodes\.filter\(\(n\) => n\.type === 'input'\)/)
})

test('canvas workflow reference node actions are owned by the presentation layer', () => {
  assert.match(canvasPageSource, /from '@\/features\/canvas\/presentation\/useCanvasWorkflowReferenceNodeActions'/)
  assert.match(canvasPageSource, /useCanvasWorkflowReferenceNodeActions\(\{[\s\S]*canvasCoordinateSpace,[\s\S]*canvasId: id,[\s\S]*setNodes,[\s\S]*t,[\s\S]*\}\)/)
  assert.match(canvasWorkflowReferenceActionsSource, /export function useCanvasWorkflowReferenceNodeActions/)
  assert.match(canvasWorkflowReferenceActionsSource, /String\(workflowCanvas\.ID\) === canvasId/)
  assert.match(canvasWorkflowReferenceActionsSource, /api\.get\(`\/canvases\/\$\{workflowCanvas\.ID\}`\)/)
  assert.match(canvasWorkflowReferenceActionsSource, /createWorkflowReferenceCanvasNode/)
  assert.match(canvasWorkflowReferenceActionsSource, /toast\.error/)
  assert.doesNotMatch(canvasPageSource, /createWorkflowReferenceCanvasNode/)
  assert.doesNotMatch(canvasPageSource, /selfReferenceWorkflow/)
  assert.doesNotMatch(canvasPageSource, /workflowReferenceFailed/)
})

test('canvas node change selection handling is owned by the presentation layer', () => {
  assert.match(canvasPageSource, /from '@\/features\/canvas\/presentation\/useCanvasNodeChangeController'/)
  assert.match(canvasPageSource, /useCanvasNodeChangeController\(\{[\s\S]*nodes,[\s\S]*onNodesChange,[\s\S]*setSelectedNodeIds,[\s\S]*\}\)/)
  assert.match(canvasNodeChangeControllerSource, /export function useCanvasNodeChangeController/)
  assert.match(canvasNodeChangeControllerSource, /isFinalOutputNode/)
  assert.match(canvasNodeChangeControllerSource, /change\.type !== 'remove' \|\| !protectedIds\.has\(change\.id\)/)
  assert.match(canvasNodeChangeControllerSource, /change\.type === 'select'/)
  assert.doesNotMatch(canvasPageSource, /type NodeChange/)
  assert.doesNotMatch(canvasPageSource, /changes: NodeChange/)
  assert.doesNotMatch(canvasPageSource, /isFinalOutputNode/)
  assert.doesNotMatch(canvasPageSource, /protectedIds/)
})

test('canvas generation prompt mention handling is isolated from node card composition', () => {
  assert.match(generationNodesSource, /from '\.\/canvasGenerationInputPanel'/)
  assert.match(generationNodesSource, /<CanvasGenerationInputPanel/)
  assert.doesNotMatch(generationNodesSource, /function serializeCanvasPrompt/)
  assert.doesNotMatch(generationNodesSource, /document\.createElement\('span'\)/)
  assert.doesNotMatch(generationNodesSource, /window\.getSelection\(\)/)

  assert.match(generationInputPanelSource, /export function CanvasGenerationInputPanel/)
  assert.match(generationInputPanelSource, /function serializeCanvasPrompt/)
  assert.match(generationInputPanelSource, /document\.createElement\('span'\)/)
  assert.match(generationInputPanelSource, /window\.getSelection\(\)/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

function readCanvasEditorContractSource() {
  return [
    readSource('apps/frontend/src/features/canvas/components/CanvasEditorPage.tsx'),
    readSource('apps/frontend/src/features/canvas/components/CanvasWorkspace.tsx'),
  ].join('\n')
}
