import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const contentCanvasPageSource = readSource('apps/frontend/src/features/content/components/ContentCanvasWorkspacePage.tsx')
const contentCanvasPanelsSource = readSource('apps/frontend/src/features/content/components/ContentCanvasWorkspacePanels.tsx')
const contentCanvasControllerSource = readSource('apps/frontend/src/features/content/components/useContentCanvasWorkspaceController.ts')
const contentCanvasCreationCommandsSource = readSource('apps/frontend/src/features/content/components/useContentCanvasWorkspaceCreationCommands.ts')
const contentCanvasViewModelSource = readSource('apps/frontend/src/features/content/components/contentCanvasWorkspaceViewModel.ts')
const contentCanvasWorkspaceModelSource = readSource('apps/frontend/src/features/content/components/contentCanvasWorkspaceModel.ts')
const contentCanvasWorkspaceGraphModelSource = readSource('apps/frontend/src/features/content/components/contentCanvasWorkspaceGraphModel.ts')
const contentCanvasWorkspaceNodeModelSource = readSource('apps/frontend/src/features/content/components/contentCanvasWorkspaceNodeModel.ts')
const contentCanvasStageCss = readSource('apps/frontend/src/features/content/components/ContentCanvasWorkspacePage.stage.css')
const contentCanvasStageStarCss = readSource('apps/frontend/src/features/content/components/ContentCanvasWorkspacePage.stage-star.css')
const contentCanvasQueryKeysSource = readSource('apps/frontend/src/features/content/application/contentCanvasQueryKeys.ts')
const contentCanvasMutationSource = readSource('apps/frontend/src/features/content/application/contentCanvasMutationInvalidation.ts')
const contentCanvasCreateNodeCommandsSource = readSource('apps/frontend/src/features/content/application/contentCanvasCreateNodeCommands.ts')
const contentCanvasContentUnitCreateNodeCommandsSource = readSource('apps/frontend/src/features/content/application/contentCanvasContentUnitCreateNodeCommands.ts')
const contentCanvasCreateNodeCommandHelpersSource = readSource('apps/frontend/src/features/content/application/contentCanvasCreateNodeCommandHelpers.ts')
const contentCanvasRelationsSource = readSource('apps/frontend/src/features/content/application/contentCanvasRelations.ts')
const contentCanvasRelationLabelsSource = readSource('apps/frontend/src/features/content/application/contentCanvasRelationLabels.ts')

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

test('content canvas workspace controller delegates creation commands to a focused hook', () => {
  assert.match(contentCanvasControllerSource, /from '\.\/useContentCanvasWorkspaceCreationCommands'/)
  assert.match(contentCanvasControllerSource, /useContentCanvasWorkspaceCreationCommands\(\{/)
  assert.match(contentCanvasControllerSource, /createRootSetting: creationCommands\.createRootSetting/)
  assert.match(contentCanvasControllerSource, /nodeContextActions: creationCommands\.nodeContextActions/)
  assert.doesNotMatch(contentCanvasControllerSource, /createRootContentCanvasNode/)
  assert.doesNotMatch(contentCanvasControllerSource, /createChildContentCanvasNode/)
  assert.doesNotMatch(contentCanvasControllerSource, /setCreateSelection\(\{ kind: 'create_expression_unit'/)

  assert.match(contentCanvasCreationCommandsSource, /export function useContentCanvasWorkspaceCreationCommands/)
  assert.match(contentCanvasCreationCommandsSource, /createRootContentCanvasNode/)
  assert.match(contentCanvasCreationCommandsSource, /createChildContentCanvasNode/)
  assert.match(contentCanvasCreationCommandsSource, /firstStateForSetting/)
  assert.match(contentCanvasCreationCommandsSource, /nodeContextActions/)
  assert.match(contentCanvasCreationCommandsSource, /setCreateSelection\(\{ kind: 'create_expression_unit'/)
})

test('content canvas create-node commands keep content-unit work in a companion module', () => {
  assert.match(contentCanvasCreateNodeCommandsSource, /export async function createRootContentCanvasNode/)
  assert.match(contentCanvasCreateNodeCommandsSource, /export async function createChildContentCanvasNode/)
  assert.match(contentCanvasCreateNodeCommandsSource, /from '.\/contentCanvasContentUnitCreateNodeCommands'/)
  assert.match(contentCanvasCreateNodeCommandsSource, /from '.\/contentCanvasCreateNodeCommandHelpers'/)
  assert.doesNotMatch(contentCanvasCreateNodeCommandsSource, /ensureContentUnitForRef/)
  assert.doesNotMatch(contentCanvasCreateNodeCommandsSource, /function requiredShotRefs/)

  assert.match(contentCanvasContentUnitCreateNodeCommandsSource, /export async function createAssetFromSettingState/)
  assert.match(contentCanvasContentUnitCreateNodeCommandsSource, /export async function createKeyframeFromShot/)
  assert.match(contentCanvasContentUnitCreateNodeCommandsSource, /ensureContentUnitForRef/)
  assert.match(contentCanvasContentUnitCreateNodeCommandsSource, /requiredShotRefs\(shotNode\)/)
  assert.match(contentCanvasCreateNodeCommandHelpersSource, /export function requiredShotRefs/)
  assert.match(contentCanvasCreateNodeCommandHelpersSource, /export function createdNodeResult/)
  assert.match(contentCanvasCreateNodeCommandHelpersSource, /export function createInputOrDefault/)
})

test('content canvas selection is reconciled from latest workspace data', () => {
  assert.match(contentCanvasViewModelSource, /reconcileContentCanvasInspectorSelection/)
  assert.match(contentCanvasViewModelSource, /inspectorSelection/)
  assert.match(contentCanvasPageSource, /selection=\{viewModel\.inspectorSelection\}/)
  assert.match(contentCanvasPageSource, /selected=\{viewModel\.inspectorSelection\}/)
  assert.match(contentCanvasControllerSource, /useState<InspectorSelectionRef>\(\{ kind: 'scene_moment', nodeId: 'scene-main' \}\)/)
  assert.match(contentCanvasWorkspaceModelSource, /from '\.\/contentCanvasWorkspaceGraphModel'/)
  assert.match(contentCanvasWorkspaceModelSource, /from '\.\/contentCanvasWorkspaceNodeModel'/)
  assert.doesNotMatch(contentCanvasWorkspaceModelSource, /function fallbackContentCanvasInspectorSelection/)
  assert.doesNotMatch(contentCanvasWorkspaceModelSource, /function candidateDecisionForNode/)
  assert.doesNotMatch(contentCanvasWorkspaceModelSource, /function mediaKindForNode/)
  assert.match(contentCanvasWorkspaceGraphModelSource, /export function reconcileContentCanvasInspectorSelection/)
  assert.match(contentCanvasWorkspaceGraphModelSource, /graphIndex\.nodeById\.get\(selection\.nodeId\)/)
  assert.match(contentCanvasWorkspaceGraphModelSource, /fallbackContentCanvasInspectorSelection/)
  assert.match(contentCanvasWorkspaceNodeModelSource, /export function candidateDecisionForNode/)
  assert.match(contentCanvasWorkspaceNodeModelSource, /export function mediaKindForNode/)
})

test('content canvas shows an explicit empty preview when no setting or scene moment exists', () => {
  assert.match(contentCanvasPageSource, /activeScene=\{viewModel\.activeScene\}/)
  assert.match(contentCanvasPanelsSource, /const hasPreviewTarget = Boolean\(activeScene \|\| activeSetting\)/)
  assert.match(contentCanvasPanelsSource, /<strong>无预览<\/strong>/)
  assert.match(contentCanvasPanelsSource, /<span>请选择设定、情节。<\/span>/)
  assert.match(contentCanvasPanelsSource, /!hasPreviewTarget \?/)
})

test('content canvas stage delegates star graph styling to a companion stylesheet', () => {
  assert.match(contentCanvasStageCss, /@import '\.\/ContentCanvasWorkspacePage\.stage-star\.css';/)
  assert.match(contentCanvasStageCss, /\.content-canvas-workspace-canvas\s*\{/)
  assert.doesNotMatch(contentCanvasStageCss, /\.content-canvas-star\s*\{/)
  assert.doesNotMatch(contentCanvasStageCss, /\.content-canvas-radial-node\s*\{/)

  assert.match(contentCanvasStageStarCss, /\.content-canvas-star\s*\{/)
  assert.match(contentCanvasStageStarCss, /\.content-canvas-radial-node\s*\{/)
  assert.match(contentCanvasStageStarCss, /\.content-canvas-star-context-menu\s*\{/)
})

test('content canvas relation labels are owned by the relation label policy module', () => {
  assert.match(contentCanvasRelationsSource, /from '\.\/contentCanvasRelationLabels'/)
  assert.match(contentCanvasRelationsSource, /classifyContentCanvasRelation\(edge, selectedNode\.id\)/)
  assert.match(contentCanvasRelationsSource, /contentCanvasEdgeInsightRelationLabel\(edge\)/)
  assert.match(contentCanvasRelationsSource, /contentCanvasKindText\(node\.kind\)/)
  assert.match(contentCanvasRelationsSource, /contentCanvasStatusText\(node\.status\)/)

  assert.doesNotMatch(contentCanvasRelationsSource, /function edgeInsightRelationLabel/)
  assert.doesNotMatch(contentCanvasRelationsSource, /function kindText/)
  assert.doesNotMatch(contentCanvasRelationsSource, /function statusText/)
  assert.match(contentCanvasRelationLabelsSource, /export function classifyContentCanvasRelation/)
  assert.match(contentCanvasRelationLabelsSource, /export function contentCanvasEdgeInsightRelationLabel/)
  assert.match(contentCanvasRelationLabelsSource, /export function contentCanvasKindText/)
  assert.match(contentCanvasRelationLabelsSource, /export function contentCanvasStatusText/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
