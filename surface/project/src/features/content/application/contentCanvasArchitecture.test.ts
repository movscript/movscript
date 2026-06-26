import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

import {
  endContentCanvasRightPanePointer,
  startContentCanvasRightPanePointer,
  updateContentCanvasRightPanePointer,
} from './contentCanvasInteractions'
import {
  createChildContentCanvasNode,
  createContentUnitFromSceneMoment,
  createCandidateFromContentUnit,
  createCandidateFromResourceForContentUnit,
  selectCandidateNodeFromCanvas,
  selectContentUnitCandidateFromCanvas,
  suggestedContentCanvasChildNodePosition,
  updateExpressionUnitFromCanvas,
  uploadCandidateForContentUnit,
} from './contentCanvasCommands'
import {
  ensureContentUnitForRef,
} from './contentCanvasContentUnitCommands'
import {
  createAssetCanvasNode,
  createNakedGenerationTaskCanvasNode,
  createSceneMomentCanvasNode,
} from './contentCanvasContentUnitCreateNodeCommands'
import {
  arrangeContentCanvasNodeLayouts,
  contentCanvasChangedPositionPatches,
  contentCanvasLayoutPatchFromPositions,
  contentCanvasLayoutPatchesBetween,
  patchContentCanvasNodeLayout,
  patchContentCanvasNodeLayouts,
} from './contentCanvasLayout'
import {
  buildContentCanvasGroupFrames,
} from './contentCanvasGroupFrames'
import {
  contentCanvasNodeResourceMedia,
  contentCanvasResourceMediaType,
} from './contentCanvasMedia'
import {
  createContentCanvasWorkspaceSnapshotState,
} from './contentCanvasStore'
import {
  buildContentCanvasEdgeInsight,
  buildContentCanvasRelationLedger,
} from './contentCanvasRelations'
import {
  contentCanvasVisibleGraphIds,
} from './contentCanvasViewport'
import {
  buildContentCanvasViewPlan,
} from './contentCanvasViewPlan'
import {
  applyContentCanvasPresentationNodes,
  CONTENT_CANVAS_VIEW_STATE_DESKTOP_PREFIX,
  clearContentCanvasViewState,
  clearContentCanvasNodePositionsForIds,
  createContentCanvasPresentationGroupNode,
  readContentCanvasViewState,
  setContentCanvasEdgeFilterPreferences,
  toggleContentCanvasEdgeFilterPreference,
  toggleContentCanvasHiddenKindPreference,
  updateContentCanvasPresentationNode,
  writeContentCanvasViewState,
} from './contentCanvasViewState'
import {
  activeContentCanvasDocument,
  addContentCanvasDocumentNodes,
  contentCanvasDocumentNodeIds,
  contentCanvasDocumentPositions,
  createContentCanvasDocument,
  ensureContentCanvasDocumentsState,
  readContentCanvasDocumentsState,
  removeContentCanvasDocumentNodes,
  removeContentCanvasDocumentNodesEverywhere,
  selectContentCanvasDocument,
  updateContentCanvasDocumentViewport,
} from './contentCanvasDocuments'
import {
  planContentCanvasWorkItemActions,
} from './contentCanvasWorkItemActions'
import {
  loadContentCanvasProject,
} from './loadContentCanvasProject'
import {
  buildContentCanvasNavigatorItems,
} from './contentCanvasNavigation'
import {
  creativeCanvasActionsForNode,
} from './contentCreativeCanvasActions'
import {
  layoutCreativeCanvas,
} from './contentCreativeCanvasLayout'
import {
  buildCreativeCanvasDependencyEdges,
} from './contentCreativeCanvasDependencies'
import {
  contentCanvasDocumentNodeInputsWithReferences,
} from './contentCreativeCanvasReferences'
import {
  buildCreativeCanvasGraph,
  isCreativeCanvasDependencyEdge,
  isCreativeCanvasVisibleNode,
} from './contentCreativeCanvasModel'
import {
  contentCanvasEdgeVisualLayer,
  contentCanvasEdgeVisualState,
  contentCanvasVisualEdgeEndpoints,
  contentCanvasVisualEdgeHandles,
  kindShortCode,
} from '../components/ContentCanvasPresentationModel'
import {
  candidateDecisionForNode,
  appendContentNodeReferenceToPrompt,
  contentCanvasWorkspaceIndex,
  candidatesForNode,
  isExpressionPromptNode,
  promptFromContentNode,
  radialNodeFromContentNode,
  radialNodesAround,
  reconcileContentCanvasInspectorSelection,
  sceneSettingGroupFromNode,
  sceneTimelineItemsFromGraph,
  timelineItemsFromMediaEditingProject,
} from '../components/contentCanvasWorkspaceModel'
import {
  contentCanvasFirstSegmentIdForProduction,
  contentCanvasSegmentBelongsToProduction,
  contentCanvasSegmentsForProduction,
} from '../components/contentPromptCanvasQuickCreateModel'
import {
  canUseContentUnitCandidateFlow,
  contentCanvasGenerationTargetForNode,
} from '../components/contentCanvasWorkspaceGenerationModel'
import {
  buildContentCanvasWorkspaceViewModel,
} from '../components/contentCanvasWorkspaceViewModel'
import {
  buildContentCanvasWorkspaceSnapshot,
} from '../domain/contentCanvasWorkspaceSnapshot'
import type { ContentCanvasEdge, ContentCanvasWorkspaceSnapshot, ContentCanvasNode } from '../domain/contentCanvasTypes'

test('content canvas timeline renders MediaEditingProject timelines', () => {
  const tracks = timelineItemsFromMediaEditingProject({
    version: 1,
    id: 'edit_scene_1',
    title: 'Scene 1',
    timeline: {
      durationMs: 12000,
      tracks: [
        {
          id: 'voice',
          type: 'audio',
          clips: [{
            id: 'voice_1',
            assetType: 'audio',
            asset: { resourceId: 21, label: 'Narration' },
            timelineStartMs: 0,
            durationMs: 6000,
            sourceStartMs: 1000,
            sourceEndMs: 7500,
            metadata: { movscript: { resourceId: 21, contentUnitId: 'cu_voice', selected: true } },
          }],
        },
        {
          id: 'picture',
          type: 'video',
          clips: [{
            id: 'clip_1',
            assetType: 'video',
            asset: { resourceId: 34, label: 'Opening shot' },
            timelineStartMs: 2000,
            durationMs: 4000,
            sourceStartMs: 250,
            sourceEndMs: 4250,
            metadata: { movscript: { resourceId: 34, contentUnitId: 'cu_scene', selected: true } },
          }],
        },
        {
          id: 'subs',
          type: 'subtitle',
          clips: [{
            id: 'caption_1',
            assetType: 'text',
            text: { content: 'Caption' },
            timelineStartMs: 2000,
            durationMs: 3000,
            metadata: { movscript: { contentUnitId: 'cu_caption', stale: true } },
          }],
        },
      ],
    },
  })

  assert.deepEqual(tracks.map((track) => track.kind), ['audio', 'video', 'subtitle'])
  assert.equal(tracks[0]?.items[0]?.resourceId, 21)
  assert.equal(tracks[0]?.items[0]?.trimStartSec, 1)
  assert.equal(tracks[1]?.items[0]?.title, 'Opening shot')
  assert.equal(tracks[1]?.items[0]?.contentUnitId, 'cu_scene')
  assert.equal(tracks[2]?.items[0]?.status, 'stale')
})

test('content canvas scene views treat shot as an expression unit kind', () => {
  const scene = nodeFixture({
    id: 'scene_moment:1',
    entityKey: '1',
    kind: 'scene_moment',
    title: 'Scene 1',
    position: { x: 0, y: 0 },
  })
  const graph = graphFixture({
    nodes: [
      scene,
      nodeFixture({
        id: 'audio_cue:legacy',
        entityKey: 'legacy_audio',
        kind: 'audio_cue',
        title: 'Legacy shot audio',
        position: { x: 720, y: 0 },
      }),
      nodeFixture({
        id: 'expression_unit:shot_expr',
        entityKey: 'shot_expr',
        kind: 'expression_unit',
        title: 'Shot expression',
        subtitle: 'shot',
        position: { x: 360, y: 180 },
        record: { kind: 'shot' },
      }),
    ],
    edges: [
      { id: 'scene-expression', source: 'scene_moment:1', target: 'expression_unit:shot_expr', kind: 'hierarchy' },
    ],
  })

  const nodes = radialNodesAround(scene, contentCanvasWorkspaceIndex(graph), ['expression_unit', 'audio_cue'])
  const tracks = sceneTimelineItemsFromGraph(scene, contentCanvasWorkspaceIndex(graph))

  assert.deepEqual(nodes.map((node) => node.id), ['expression_unit:shot_expr'])
  assert.deepEqual(tracks.map((track) => [track.kind, track.items.map((item) => item.id)]), [
    ['video', ['expression_unit:shot_expr']],
  ])
})

test('content canvas scene timeline deduplicates content units connected by multiple edges', () => {
  const scene = nodeFixture({
    id: 'scene_moment:sec01',
    entityKey: 'sec01',
    kind: 'scene_moment',
    title: 'Scene Sec01',
    position: { x: 0, y: 0 },
  })
  const contentUnit = nodeFixture({
    id: 'content_unit:canvas_scene_sec01',
    entityKey: 'canvas_scene_sec01',
    kind: 'content_unit',
    title: 'Scene render unit',
    subtitle: 'scene_moment_ref',
    position: { x: 360, y: 0 },
    record: { content_unit_type: 'scene_moment_ref', output_kind: 'video' },
  })
  const graph = graphFixture({
    nodes: [scene, contentUnit],
    edges: [
      { id: 'scene-content-unit-hierarchy', source: scene.id, target: contentUnit.id, kind: 'hierarchy' },
      { id: 'scene-content-unit-reference', source: scene.id, target: contentUnit.id, kind: 'reference', relation: 'content_unit_scene' },
    ],
  })

  const tracks = sceneTimelineItemsFromGraph(scene, contentCanvasWorkspaceIndex(graph))

  assert.deepEqual(tracks.map((track) => [track.kind, track.items.map((item) => item.id)]), [
    ['video', ['content_unit:canvas_scene_sec01']],
  ])
})

test('content canvas expression prompt inspector supports expression nodes only', () => {
  assert.equal(isExpressionPromptNode(radialNodeFromContentNode(nodeFixture({
    id: 'expression_unit:1',
    entityKey: '1',
    kind: 'expression_unit',
    title: 'Expression',
    position: { x: 0, y: 0 },
  }), 0, 0)), true)
  assert.equal(isExpressionPromptNode(radialNodeFromContentNode(nodeFixture({
    id: 'audio_cue:1',
    entityKey: '1',
    kind: 'audio_cue',
    title: 'Audio cue',
    position: { x: 0, y: 0 },
  }), 0, 0)), true)
  for (const kind of ['storyboard', 'keyframe'] as const) {
    assert.equal(isExpressionPromptNode(radialNodeFromContentNode(nodeFixture({
      id: `${kind}:1`,
      entityKey: '1',
      kind,
      title: kind,
      position: { x: 0, y: 0 },
    }), 0, 0)), false)
  }
})

test('content canvas content unit candidate flow supports producible content entities', () => {
  for (const kind of ['scene_moment', 'asset', 'expression_unit', 'content_unit'] as const) {
    assert.equal(canUseContentUnitCandidateFlow(nodeFixture({
      id: `${kind}:1`,
      entityKey: '1',
      kind,
      title: kind,
      position: { x: 0, y: 0 },
    })), true)
  }

  for (const kind of ['storyboard', 'keyframe'] as const) {
    const node = nodeFixture({
      id: `${kind}:1`,
      entityKey: '1',
      kind,
      title: kind,
      position: { x: 0, y: 0 },
      generationTask: {
        id: 'cu_1',
        nodeId: 'content_unit:cu_1',
        title: 'Legacy task',
        sourcePath: 'content_units/cu_1/content_unit.json',
        outputKind: 'video',
        status: 'needs_candidate',
        prompt: 'Do not expose legacy visual node candidate flow.',
        candidates: [],
        record: {},
      },
    })

    assert.equal(canUseContentUnitCandidateFlow(node), true)
    assert.equal(contentCanvasGenerationTargetForNode(node)?.contentUnitId, 'cu_1')
  }
})

test('content canvas project loader maps workspace editing timelines to scene and production nodes', async () => {
  const production = {
    entityKind: 'production',
    id: 'pilot',
    path: 'productions/pilot/production.json',
    record: { id: 'pilot', title: 'Pilot' },
  }
  const sceneMoment = {
    entityKind: 'scene_moment',
    id: 'rain_call',
    path: 'productions/pilot/segments/intro/scene_moments/rain_call/scene_moment.json',
    record: { id: 'rain_call', title: 'Rain call' },
  }
  const editingProject = {
    version: 1,
    id: 'edit_rain_call',
    title: 'Rain call',
    timeline: {
      durationMs: 8000,
      tracks: [{
        id: 'video',
        type: 'video',
        clips: [{
          id: 'clip_1',
          assetType: 'video',
          asset: { resourceId: 55, label: 'Rain call clip' },
          timelineStartMs: 0,
          durationMs: 8000,
          metadata: { movscript: { resourceId: 55, contentUnitId: 'cu_rain_call', selected: true } },
        }],
      }],
    },
  }
  const productionEditingProject = {
    version: 1,
    id: 'edit_pilot',
    title: 'Pilot',
    timeline: {
      durationMs: 8000,
      tracks: [{
        id: 'video',
        type: 'video',
        clips: [{
          id: 'production_clip_1',
          assetType: 'video',
          asset: { resourceId: 55, label: 'Rain call clip' },
          timelineStartMs: 0,
          durationMs: 8000,
          metadata: { movscript: { resourceId: 55, contentUnitId: 'cu_rain_call', selected: true } },
        }],
      }],
    },
  }
  const gateway = {
    service: {
      queryEntities: async (query: { entityKind?: string }) => {
        if (query.entityKind === 'project') return []
        if (query.entityKind === 'production') return [production]
        if (query.entityKind === 'scene_moment') return [sceneMoment]
        return []
      },
      querySettings: async () => [],
      queryAssets: async () => ({ assets: [] }),
    },
    loadContentSourceWorkspaceData: async () => ({
      source: 'workspace',
      hierarchyTree: [],
      previewMoments: [],
      contentUnitCandidates: {
        cu_rain_call: [
          {
            id: 'cand_scene',
            title: 'Scene candidate',
            model: 'video-model',
            inputHash: 'job:42',
            selected: true,
            note: 'succeeded',
            resourceId: 55,
            resourceKind: 'video',
            status: 'succeeded',
          },
          {
            id: 'cand_scene',
            title: 'Scene candidate alternate',
            model: 'video-model',
            inputHash: 'job:43',
            selected: false,
            note: 'succeeded',
            resourceId: 56,
            resourceKind: 'video',
            status: 'succeeded',
          },
        ],
      },
      expressionUnitsByMoment: {},
      audioCuesByMoment: {},
      expressionUnitWorkspaceDetails: {},
      assetReferenceUnits: {},
      editingTimelines: [{
        targetKind: 'scene_moment',
        targetId: 'rain_call',
        targetPath: sceneMoment.path,
        status: 'ready_to_compose',
        mediaEditingProject: editingProject,
      }, {
        targetKind: 'production',
        targetId: 'pilot',
        targetPath: production.path,
        status: 'ready_to_compose',
        mediaEditingProject: productionEditingProject,
      }],
    }),
  } as never

  const project = await loadContentCanvasProject(7, gateway)

  assert.equal(project.editingProjectsByNodeId?.rain_call, editingProject)
  assert.equal(project.editingProjectsByNodeId?.['scene_moment:rain_call'], editingProject)
  assert.equal(project.editingProjectsByNodeId?.pilot, productionEditingProject)
  assert.equal(project.editingProjectsByNodeId?.['production:pilot'], productionEditingProject)
  assert.equal(project.contentUnitCandidates.cu_rain_call[0].id, 'cand_scene')
  assert.equal(project.contentUnitCandidates.cu_rain_call[0].selected, true)
  assert.equal(project.contentUnitCandidates.cu_rain_call[0].resourceId, 55)
  assert.equal(project.contentUnitCandidates.cu_rain_call.length, 2)
  assert.equal(project.contentUnitCandidates.cu_rain_call[1].resourceId, 56)
})

test('content canvas view plan delegates hidden relation summaries', () => {
  const viewPlanSource = readFileSync(resolve('src/features/content/application/contentCanvasViewPlan.ts'), 'utf8')
  const summariesSource = readFileSync(resolve('src/features/content/application/contentCanvasViewSummaries.ts'), 'utf8')
  const issuesSource = readFileSync(resolve('src/features/content/application/contentCanvasViewPlanIssues.ts'), 'utf8')
  const edgesSource = readFileSync(resolve('src/features/content/application/contentCanvasViewPlanEdges.ts'), 'utf8')
  const nodesSource = readFileSync(resolve('src/features/content/application/contentCanvasViewPlanNodes.ts'), 'utf8')
  const snapshotSource = readFileSync(resolve('src/features/content/application/contentCanvasViewPlanGraph.ts'), 'utf8')
  const typesSource = readFileSync(resolve('src/features/content/application/contentCanvasViewPlanTypes.ts'), 'utf8')

  assert.match(viewPlanSource, /from '\.\/contentCanvasViewSummaries'/)
  assert.match(viewPlanSource, /from '\.\/contentCanvasViewPlanIssues'/)
  assert.match(viewPlanSource, /from '\.\/contentCanvasViewPlanEdges'/)
  assert.match(viewPlanSource, /from '\.\/contentCanvasViewPlanNodes'/)
  assert.match(viewPlanSource, /from '\.\/contentCanvasViewPlanTypes'/)
  assert.match(summariesSource, /export function contentCanvasCollapsedSummaries/)
  assert.match(summariesSource, /export function contentCanvasHiddenEdgeSummaries/)
  assert.match(summariesSource, /function hiddenEdgeRelationLabel/)
  assert.match(issuesSource, /export function issueNodeIdsForFilters/)
  assert.match(issuesSource, /export function issueNodeIdsForGraph/)
  assert.match(issuesSource, /function workItemMatchesFilters/)
  assert.match(edgesSource, /export function applyContentCanvasEdgeBudget/)
  assert.match(edgesSource, /export function contentCanvasModeAllowsEdge/)
  assert.match(edgesSource, /function edgeRenderRank/)
  assert.match(nodesSource, /export function contentCanvasModeNodeIds/)
  assert.match(nodesSource, /export function traceNodeIdsAllowedBySelection/)
  assert.match(nodesSource, /function collapsedDescendantNodeIds/)
  assert.match(snapshotSource, /export function relatedEdgesForNode/)
  assert.match(snapshotSource, /export function outgoingEdgesForNode/)
  assert.match(typesSource, /export interface ContentCanvasViewPlanInput/)
  assert.match(typesSource, /export interface ContentCanvasViewPlan/)
  assert.doesNotMatch(viewPlanSource, /function hiddenEdgeRelationLabel/)
  assert.doesNotMatch(viewPlanSource, /function anchorVisibleNodeForHiddenNode/)
  assert.doesNotMatch(viewPlanSource, /function collapsedKindLabel/)
  assert.doesNotMatch(viewPlanSource, /function workItemMatchesFilters/)
  assert.doesNotMatch(viewPlanSource, /function workItemMatchesTargetKind/)
  assert.doesNotMatch(viewPlanSource, /function edgeRenderRank/)
  assert.doesNotMatch(viewPlanSource, /function defaultEdgeRenderLimitForDensity/)
  assert.doesNotMatch(viewPlanSource, /function collapsedDescendantNodeIds/)
  assert.doesNotMatch(viewPlanSource, /function relatedEdgesForNode/)
})

test('content canvas workspace page delegates pane layout to route layout controllers', () => {
  const pageSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspacePage.tsx'), 'utf8')
  const controllerSource = readFileSync(resolve('src/features/content/components/useContentCanvasWorkspaceController.ts'), 'utf8')
  const workspaceSessionSource = readFileSync(resolve('src/features/content/components/useContentCanvasWorkspaceSession.ts'), 'utf8')
  const workspaceCreationCommandsSource = readFileSync(resolve('src/features/content/components/useContentCanvasWorkspaceCreationCommands.ts'), 'utf8')
  const detailsSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspaceDetails.tsx'), 'utf8')
  const promptReferencesSource = readFileSync(resolve('src/features/content/components/ContentCanvasPromptReferences.tsx'), 'utf8')
  const inspectorPartsSource = readFileSync(resolve('src/features/content/components/ContentCanvasInspectorParts.tsx'), 'utf8')
  const resourceCandidatePickerSource = readFileSync(resolve('src/features/content/components/ContentCanvasResourceCandidatePicker.tsx'), 'utf8')
  const resourceLibraryPickerSource = readFileSync(resolve('../resource/src/resourceLibraryPicker.tsx'), 'utf8')
  const resourceLibraryPickerUiSource = readFileSync(resolve('../resource/src/resourceLibraryPickerUi.tsx'), 'utf8')
  const panelsSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspacePanels.tsx'), 'utf8')
  const previewPanelSource = readFileSync(resolve('src/features/content/components/ContentCanvasPreviewPanel.tsx'), 'utf8')
  const promptCanvasPanelSource = readFileSync(resolve('src/features/content/components/ContentPromptCanvasPanel.tsx'), 'utf8')
  const promptEditorSource = readFileSync(resolve('src/features/content/components/ContentCanvasPromptEditor.tsx'), 'utf8')
  const creativeLayoutSource = readFileSync(resolve('src/features/content/application/contentCreativeCanvasLayout.ts'), 'utf8')
  const viewModelSource = readFileSync(resolve('src/features/content/components/contentCanvasWorkspaceViewModel.ts'), 'utf8')
  const workspaceModelSource = readFileSync(resolve('src/features/content/components/contentCanvasWorkspaceModel.ts'), 'utf8')
  const workspaceNodeModelSource = readFileSync(resolve('src/features/content/components/contentCanvasWorkspaceNodeModel.ts'), 'utf8')
  const workspaceCommandModelSource = readFileSync(resolve('src/features/content/components/contentCanvasWorkspaceCommandModel.ts'), 'utf8')
  const workspaceCandidateModelSource = readFileSync(resolve('src/features/content/components/contentCanvasWorkspaceCandidateModel.ts'), 'utf8')
  const workspaceGenerationModelSource = readFileSync(resolve('src/features/content/components/contentCanvasWorkspaceGenerationModel.ts'), 'utf8')
  const workspaceDisplayModelSource = readFileSync(resolve('src/features/content/components/contentCanvasWorkspaceDisplayModel.ts'), 'utf8')
  const workspaceGraphModelSource = readFileSync(resolve('src/features/content/components/contentCanvasWorkspaceGraphModel.ts'), 'utf8')
  const commandsSource = readFileSync(resolve('src/features/content/application/contentCanvasCommands.ts'), 'utf8')
  const createNodeCommandsSource = readFileSync(resolve('src/features/content/application/contentCanvasCreateNodeCommands.ts'), 'utf8')
  const expressionUnitKindsSource = readFileSync(resolve('src/features/content/application/contentCanvasExpressionUnitKinds.ts'), 'utf8')
  const contentUnitCommandsSource = readFileSync(resolve('src/features/content/application/contentCanvasContentUnitCommands.ts'), 'utf8')
  const contentUnitCreateNodeCommandsSource = readFileSync(resolve('src/features/content/application/contentCanvasContentUnitCreateNodeCommands.ts'), 'utf8')
  const createNodeCommandHelpersSource = readFileSync(resolve('src/features/content/application/contentCanvasCreateNodeCommandHelpers.ts'), 'utf8')
  const candidateCommandsSource = readFileSync(resolve('src/features/content/application/contentCanvasCandidateCommands.ts'), 'utf8')
  const snapshotSource = readFileSync(resolve('src/features/content/domain/contentCanvasWorkspaceSnapshot.ts'), 'utf8')
  const graphNodesSource = readFileSync(resolve('src/features/content/domain/contentCanvasGraphNodes.ts'), 'utf8')
  const graphCandidatesSource = readFileSync(resolve('src/features/content/domain/contentCanvasGraphCandidates.ts'), 'utf8')
  const graphLayoutSource = readFileSync(resolve('src/features/content/domain/contentCanvasGraphLayout.ts'), 'utf8')
  const snapshotSummarySource = readFileSync(resolve('src/features/content/domain/contentCanvasWorkspaceSnapshotSummary.ts'), 'utf8')
  const workItemsGraphSource = readFileSync(resolve('src/features/content/domain/contentCanvasGraphWorkItems.ts'), 'utf8')
  const graphAssetsSource = readFileSync(resolve('src/features/content/domain/contentCanvasGraphAssets.ts'), 'utf8')
  const graphReferencesSource = readFileSync(resolve('src/features/content/domain/contentCanvasGraphReferences.ts'), 'utf8')
  const loadProjectSource = readFileSync(resolve('src/features/content/application/loadContentCanvasProject.ts'), 'utf8')
  const gatewaySource = readFileSync(resolve('src/features/content/application/contentCanvasWorkspaceGateway.ts'), 'utf8')
  const electronGatewaySource = readFileSync(resolve('src/features/content/integrations/contentCanvasWorkspaceElectronGateway.ts'), 'utf8')
  const layoutSource = readFileSync(resolve('src/features/content/components/contentCanvasWorkspaceLayout.tsx'), 'utf8')
  const inspectorCssSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspacePage.inspector.css'), 'utf8')
  const inspectorCreateCssSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspacePage.inspector-create.css'), 'utf8')
  const inspectorGenerationCssSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspacePage.inspector-generation.css'), 'utf8')
  const inspectorNodeListCssSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspacePage.inspector-node-list.css'), 'utf8')
  const inspectorPromptCssSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspacePage.inspector-prompt.css'), 'utf8')
  const inspectorCandidatesCssSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspacePage.inspector-candidates.css'), 'utf8')
  const promptCanvasCssSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspacePage.prompt-canvas.css'), 'utf8')
  const workspaceCssSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspacePage.css'), 'utf8')
  const cssSource = [
    'ContentCanvasWorkspacePage.base.css',
    'ContentCanvasWorkspacePage.layout.css',
  ].map((filename) => readFileSync(resolve('src/features/content/components', filename), 'utf8')).join('\n')

  assert.match(pageSource, /useContentCanvasPaneLayout/)
  assert.match(pageSource, /useContentCanvasWorkspaceController/)
  assert.doesNotMatch(pageSource, /SettingCatalogPanel/)
  assert.match(pageSource, /ContentCanvasPreviewPanel/)
  assert.match(pageSource, /graphIndex=\{viewModel\.graphIndex\}/)
  assert.match(pageSource, /ContentPromptCanvasPanel/)
  assert.match(pageSource, /controller\.workspaceTab/)
  assert.match(pageSource, /export function ContentCanvasPage/)
  assert.match(pageSource, /export function ContentCanvasPreviewPage/)
  assert.match(pageSource, /workspaceMode: mode/)
  assert.match(pageSource, /showInspectorPanel = activeTab === 'preview'/)
  assert.doesNotMatch(pageSource, /controller\.setWorkspaceTab\('canvas'\)/)
  assert.doesNotMatch(pageSource, /setCanvasMode/)
  assert.doesNotMatch(pageSource, /useQuery/)
  assert.doesNotMatch(pageSource, /useProjectStore/)
  assert.doesNotMatch(pageSource, /\blocalStorage\b/)
  assert.match(previewPanelSource, /content-canvas-preview-player/)
  assert.match(previewPanelSource, /content-canvas-preview-candidates/)
  assert.match(previewPanelSource, /ResourceFileVideo/)
  assert.match(previewPanelSource, /ResourceFileImage/)
  assert.match(previewPanelSource, /function previewTargetNodes/)
  assert.match(previewPanelSource, /node\.kind === 'production' \|\| node\.kind === 'segment'[\s\S]*descendantsOfKind\(node, graphIndex, 'scene_moment'\)/)
  assert.match(previewPanelSource, /node\.kind === 'setting' \|\| node\.kind === 'state'[\s\S]*descendantsOfKind\(node, graphIndex, 'asset'\)/)
  assert.match(previewPanelSource, /candidateDecisionForNode/)
  assert.match(promptCanvasPanelSource, /ReactFlow/)
  assert.match(promptCanvasPanelSource, /onConnect=\{handleConnect\}/)
  assert.match(promptCanvasPanelSource, /onPaneContextMenu=\{openQuickAddMenu\}/)
  assert.match(promptCanvasPanelSource, /creativeCanvasQuickAddOptionsForPosition/)
  assert.match(promptCanvasPanelSource, /ContentPromptCanvasQuickCreateDialog/)
  assert.match(promptCanvasPanelSource, /setQuickCreateDialog\(\{ option, position \}\)/)
  assert.match(promptCanvasPanelSource, /onCreateNode\(state\.option\.nodeKind, state\.position, input\)/)
  assert.match(promptCanvasPanelSource, /onCreateChild\(state\.option\.parentNode, state\.option\.childKind, state\.position, input\)/)
  assert.match(promptCanvasPanelSource, /groups: quickAdd\.groups/)
  assert.match(promptCanvasPanelSource, /primaryOption: directQuickAddOption\('task_image', '图片'\)/)
  assert.match(promptCanvasPanelSource, /primaryOption: directQuickAddOption\('task_video', '视频'\)/)
  assert.match(promptCanvasPanelSource, /primaryOption: directQuickAddOption\('task_audio', '音频'\)/)
  assert.match(promptCanvasPanelSource, /primaryOption: directQuickAddOption\('task_text', '文本'\)/)
  assert.match(promptCanvasPanelSource, /directQuickAddOption\('scene_moment', '情节'\)/)
  assert.match(promptCanvasPanelSource, /directQuickAddOption\('asset_image', '资产'\)/)
  assert.match(promptCanvasPanelSource, /directQuickAddOption\('keyframe', '关键帧'\)/)
  assert.match(promptCanvasPanelSource, /directQuickAddOption\('storyboard', '故事板'\)/)
  assert.match(promptCanvasPanelSource, /directQuickAddOption\('asset_video', '资产'\)/)
  assert.match(promptCanvasPanelSource, /directQuickAddOption\('asset_audio', '资产'\)/)
  assert.match(promptCanvasPanelSource, /className="content-prompt-canvas-quick-add-menu__submenu"/)
  assert.match(promptCanvasPanelSource, /quickCreateDialogNeedsVisualOwner/)
  assert.match(promptCanvasPanelSource, /targetOwnerNodeId: selectedVisualOwnerId/)
  assert.match(promptCanvasPanelSource, /挂载对象/)
  assert.match(promptCanvasPanelSource, /挂载制作/)
  assert.match(promptCanvasPanelSource, /挂载段落/)
  assert.match(promptCanvasPanelSource, /挂载设定/)
  assert.match(promptCanvasPanelSource, /挂载状态/)
  assert.match(promptCanvasPanelSource, /ContentPromptFlowNodeCurrentState/)
  assert.match(promptCanvasPanelSource, /currentCandidatePreview/)
  assert.match(promptCanvasPanelSource, /ContentPromptFlowNodeGenerationPanel/)
  assert.match(promptCanvasPanelSource, /ContentCanvasModelSelector/)
  assert.match(promptCanvasPanelSource, /ContentCanvasGenerationParamControls/)
  assert.match(promptCanvasPanelSource, /onGenerateWithOptions/)
  assert.match(promptCanvasPanelSource, /node=\{generationTarget\?\.node \?\? node\}/)
  assert.match(promptCanvasPanelSource, /content-prompt-flow-node__preview-card/)
  assert.match(promptCanvasPanelSource, /content-prompt-flow-node__prompt-panel/)
  assert.doesNotMatch(promptCanvasPanelSource, /GenerationCandidateDialog/)
  assert.match(promptCanvasPanelSource, /appendContentNodeReferenceToPrompt/)
  assert.match(promptCanvasPanelSource, /expressionUnitKindShortLabel/)
  assert.match(promptCanvasPanelSource, /data-expression-kind/)
  assert.match(promptCanvasPanelSource, /function creativeFlowNodeDisplay/)
  assert.doesNotMatch(promptCanvasPanelSource, /<small>\{node\.kind\} · \{node\.subtitle\}<\/small>/)
  assert.match(promptCanvasPanelSource, /<ContentCanvasPromptEditor/)
  assert.match(promptCanvasPanelSource, /onChange=\{\(prompt\) => data\.onPromptDraftChange/)
  assert.match(promptCanvasPanelSource, /onBlur=\{\(prompt\) => data\.onPromptCommit/)
  assert.match(promptCanvasPanelSource, /editablePromptNodeIds\.has\(target\.id\)/)
  assert.match(promptCanvasPanelSource, /buildCreativeCanvasGraph/)
  assert.match(promptCanvasPanelSource, /buildCreativeCanvasGraph\(\{ nodes, edges \}, \{ nodeIds: canvasNodeIds \}\)/)
  assert.match(promptCanvasPanelSource, /layoutCreativeCanvas/)
  assert.doesNotMatch(promptCanvasPanelSource, /downstreamCreativeCanvasNodeIds/)
  assert.match(promptCanvasPanelSource, /creativeCanvasActionsForNode/)
  assert.match(promptCanvasPanelSource, /onNodeDragStop/)
  assert.match(promptCanvasPanelSource, /onNodeClick=/)
  assert.doesNotMatch(promptCanvasPanelSource, /onDoubleClick=\{\(\) => data\.onSelectNode/)
  assert.match(promptCanvasPanelSource, /onContextMenu/)
  assert.match(promptCanvasPanelSource, /zoomOnScroll=\{false\}/)
  assert.match(promptCanvasPanelSource, /zoomOnPinch/)
  assert.match(promptCanvasPanelSource, /panOnScroll/)
  assert.match(promptCanvasPanelSource, /panOnScrollMode=\{PanOnScrollMode\.Free\}/)
  assert.match(promptCanvasPanelSource, /defaultViewport=\{savedViewport\}/)
  assert.match(promptCanvasPanelSource, /onMoveEnd=\{\(_event, viewport\) => onViewportCommit\(viewport\)\}/)
  assert.match(promptCanvasPanelSource, /fitView=\{!savedViewport\}/)
  assert.doesNotMatch(promptCanvasPanelSource, /onNodePositionCommit/)
  assert.match(promptCanvasPanelSource, /onNodePositionsCommit/)
  assert.match(promptCanvasPanelSource, /整理画布/)
  assert.match(promptCanvasPanelSource, /measuredNodeSizes: creativeCanvasMeasuredNodeSizes\(flowNodes\)/)
  assert.match(promptCanvasPanelSource, /function creativeCanvasMeasuredNodeSizes/)
  assert.doesNotMatch(promptCanvasPanelSource, /pinnedPositions: manualPositions/)
  assert.match(promptCanvasPanelSource, /focusedNodeId/)
  assert.match(promptCanvasPanelSource, /flowInstance\.setCenter/)
  assert.match(promptCanvasPanelSource, /onInit=\{setFlowInstance\}/)
  assert.match(promptCanvasPanelSource, /ResourceFileImage/)
  assert.match(promptCanvasPanelSource, /content-prompt-flow-node__candidate/)
  assert.match(promptCanvasPanelSource, /onReferenceToActivePrompt/)
  assert.match(promptCanvasPanelSource, /CONTENT_PROMPT_REFERENCE_DRAG_MIME/)
  assert.match(promptCanvasPanelSource, /data-reference-drop-target/)
  assert.match(promptCanvasPanelSource, /onReferenceDrop/)
  assert.match(promptCanvasPanelSource, /ContentCanvasResourceCandidatePicker/)
  assert.match(promptCanvasPanelSource, /content-prompt-canvas-node-drawer/)
  assert.match(promptCanvasPanelSource, /onAddNodeToCanvas/)
  assert.match(promptCanvasPanelSource, /onRemoveNodeFromCanvas/)
  assert.match(promptCanvasPanelSource, /action\.kind === 'remove_from_canvas'/)
  assert.match(promptCanvasPanelSource, /onRemoveNodeFromCanvas\(sourceNode\.id\)/)
  assert.match(promptCanvasPanelSource, /content-prompt-canvas-asset-drawer/)
  assert.match(promptCanvasPanelSource, /resourceDropAcceptsPayload/)
  assert.match(promptCanvasPanelSource, /readResourceDragPayload/)
  assert.match(promptCanvasPanelSource, /onResourceDrop/)
  assert.match(promptCanvasPanelSource, /onDrop=\{handleCanvasResourceDrop\}/)
  assert.match(promptCanvasPanelSource, /screenToFlowPosition\(\{ x: event\.clientX, y: event\.clientY \}\)/)
  assert.match(promptCanvasPanelSource, /creativeCanvasResourceTargetForPosition/)
  assert.match(promptCanvasPanelSource, /contentCanvasUploadedResourceFromDropEvent/)
  assert.match(controllerSource, /position\?: ContentCanvasNodePosition/)
  assert.match(controllerSource, /createCandidateFromResourceForContentUnit\(projectId, contentUnitNode, resource, position, gateway\)/)
  assert.match(promptCanvasPanelSource, /appendReferenceToActivePrompt/)
  assert.match(promptCanvasPanelSource, /content-prompt-flow-node__candidate-reference/)
  assert.match(promptCanvasPanelSource, /draggable/)
  assert.match(resourceLibraryPickerSource, /startResourceDragSource/)
  assert.match(resourceLibraryPickerUiSource, /onDragStart/)
  assert.match(resourceLibraryPickerUiSource, /draggable=\{Boolean\(item\.onDragStart\)\}/)
  assert.match(promptCanvasPanelSource, /candidatePreviews: CreativeFlowNodeCandidatePreview\[\]/)
  assert.match(promptCanvasPanelSource, /candidatePreviewsForNode/)
  assert.match(promptCanvasPanelSource, /data\.candidatePreviews\.map/)
  assert.match(promptCanvasPanelSource, /variant !== 'resource'/)
  assert.match(promptCanvasPanelSource, /memo\(ContentPromptFlowNode,\s*areCreativeFlowNodePropsEqual\)/)
  assert.match(promptCanvasPanelSource, /onlyRenderVisibleElements/)
  assert.match(promptCanvasPanelSource, /CREATIVE_CANVAS_MINIMAP_NODE_LIMIT/)
  assert.match(promptCanvasPanelSource, /type CreativeFlowNodeData = \{[\s\S]*candidateBadge: string[\s\S]*\}/)
  assert.match(promptCanvasPanelSource.match(/type CreativeFlowNodeData = \{[\s\S]*?\n\}/)?.[0] ?? '', /candidateSelections/)
  assert.doesNotMatch(promptCanvasPanelSource, /PromptReferenceInlineEditor/)
  assert.match(promptEditorSource, /PromptReferenceInlineEditor/)
  assert.match(promptEditorSource, /PromptReferenceStrip/)
  assert.match(promptEditorSource, /className="nodrag"/)
  assert.doesNotMatch(promptCanvasPanelSource, /CandidateDecisionPanel/)
  assert.match(creativeLayoutSource, /function outgoingCreativeCanvasEdges/)
  assert.match(creativeLayoutSource, /function alignSceneMomentRanks/)
  assert.match(creativeLayoutSource, /function creativeCanvasLanePlacement/)
  assert.match(creativeLayoutSource, /function creativeCanvasScatterLanePlacements/)
  assert.match(creativeLayoutSource, /const COLUMN_GAP = 420/)
  assert.match(creativeLayoutSource, /const ROW_GAP = 120/)
  assert.doesNotMatch(creativeLayoutSource, /lanesByRank\.set\(rank,\s*\[\.\.\./)
  assert.doesNotMatch(creativeLayoutSource, /outgoing\.set\(edge\.source,\s*\[\.\.\./)
  assert.doesNotMatch(promptCanvasCssSource.match(/\.content-prompt-flow-node__candidate-list\s*\{[\s\S]*?\}/)?.[0] ?? '', /max-height|overflow/)
  assert.match(promptCanvasCssSource.match(/\.content-prompt-flow-node__candidate-panel \.content-prompt-flow-node__candidate-list\s*\{[\s\S]*?\}/)?.[0] ?? '', /max-height:\s*142px/)
  assert.match(promptCanvasCssSource.match(/\.content-prompt-flow-node__candidate-panel \.content-prompt-flow-node__candidate-list\s*\{[\s\S]*?\}/)?.[0] ?? '', /overflow:\s*auto/)
  assert.match(promptCanvasCssSource.match(/\.content-prompt-flow-node__candidate\[data-preview-kind="resource"\]\s*\{[\s\S]*?\}/)?.[0] ?? '', /display:\s*block/)
  assert.match(promptCanvasCssSource, /\.content-prompt-flow-node__candidate-reference/)
  assert.match(promptCanvasCssSource, /\.content-prompt-flow-node__preview-card/)
  assert.match(promptCanvasCssSource, /\.content-prompt-flow-node__prompt-panel/)
  assert.match(promptCanvasCssSource.match(/\.content-prompt-flow-node\[data-expanded="true"\] \.content-prompt-flow-node__preview-card\s*\{[\s\S]*?\}/)?.[0] ?? '', /justify-self:\s*center/)
  assert.match(promptCanvasCssSource, /\.content-prompt-flow-node__prompt-panel\s*\{[\s\S]*?width:\s*100%/)
  assert.match(promptCanvasCssSource.match(/\.content-prompt-flow-node__prompt-panel \.content-canvas-prompt-inline-editor\s*\{[\s\S]*?\}/)?.[0] ?? '', /min-height:\s*216px/)
  assert.match(promptCanvasCssSource, /\.content-prompt-flow-node__generation-controls/)
  assert.match(promptCanvasCssSource, /\.content-prompt-canvas-panel__side-rail\s*\{/)
  assert.match(promptCanvasCssSource, /\.content-prompt-canvas-quick-add-menu__group\s*\{/)
  assert.match(promptCanvasCssSource, /\.content-prompt-canvas-quick-add-menu__submenu\s*\{/)
  assert.match(promptCanvasCssSource, /\.content-prompt-canvas-quick-add-menu__group:hover > \.content-prompt-canvas-quick-add-menu__submenu/)
  assert.match(promptCanvasCssSource, /\.content-prompt-canvas-asset-drawer,\s*\n\.content-prompt-canvas-node-drawer\s*\{/)
  assert.match(promptCanvasCssSource, /\.content-prompt-canvas-node-drawer__row\s*\{/)
  assert.match(promptCanvasCssSource, /\.content-prompt-canvas-panel__canvas-select\s*\{/)
  assert.match(promptCanvasCssSource, /\.content-prompt-canvas-asset-drawer \.content-canvas-resource-candidate-picker\s*\{/)

  assert.doesNotMatch(panelsSource, /CanvasStagePanel/)
  assert.doesNotMatch(panelsSource, /ContentCanvasStarCanvas/)
  assert.doesNotMatch(panelsSource, /useContentCanvasRadialLayout/)

  assert.match(controllerSource, /useQuery/)
  assert.match(controllerSource, /buildContentCanvasWorkspaceViewModel/)
  assert.match(controllerSource, /lastCommittedPromptByNodeIdRef/)
  assert.doesNotMatch(controllerSource, /const lastCommittedPromptByNodeId: Record/)
  assert.match(controllerSource, /readContentCanvasDocumentsState/)
  assert.match(controllerSource, /addContentCanvasDocumentNodes/)
  assert.match(controllerSource, /updateContentCanvasDocumentNodePositions/)
  assert.match(controllerSource, /updateContentCanvasDocumentViewport/)
  assert.match(controllerSource, /const selectNode = useCallback\(\(kind: InspectorSelectionRef\['kind'\], nodeId: string\) => \{[\s\S]*setActiveCanvasNodeId\(nodeId\)[\s\S]*setSelection\(\{ kind, nodeId \}\)/)
  assert.match(controllerSource, /commitCreativeCanvasViewport/)
  assert.match(controllerSource, /addCommandResultNodesToActiveCanvas/)
  assert.match(controllerSource, /contentCanvasDocumentNodeInputsWithReferences/)
  assert.match(controllerSource, /existingNodeIds: creativeCanvasNodeIds/)
  assert.match(controllerSource, /contentCanvasCommandResultNodeIsDerived/)
  assert.match(controllerSource, /node\.kind === 'production'/)
  assert.match(controllerSource, /node\.kind === 'segment'/)
  assert.match(controllerSource, /node\.kind === 'setting'/)
  assert.match(controllerSource, /node\.kind === 'state'/)
  assert.match(controllerSource, /node\.kind === 'content_unit'/)
  assert.match(controllerSource, /requestedCanvasId/)
  assert.match(controllerSource, /selectContentCanvasDocument\(projectId, requestedCanvasId\)/)
  assert.match(controllerSource, /positionForCreativeCanvasChild/)
  assert.match(controllerSource, /creativeCanvasNodePositions\[node\.id\] \?\? node\.position/)
  assert.match(pageSource, /activeCanvasDocument=\{controller\.activeCreativeCanvasDocument\}/)
  assert.match(pageSource, /canvasNodeIds=\{controller\.creativeCanvasNodeIds\}/)
  assert.match(pageSource, /onAddNodeToCanvas=\{controller\.addNodeToCreativeCanvas\}/)
  assert.match(pageSource, /onRemoveNodeFromCanvas=\{controller\.removeNodeFromCreativeCanvas\}/)
  assert.match(pageSource, /savedViewport=\{controller\.creativeCanvasViewport\}/)
  assert.match(pageSource, /onViewportCommit=\{controller\.commitCreativeCanvasViewport\}/)
  assert.match(controllerSource, /removeContentCanvasDocumentNodes/)
  assert.match(controllerSource, /useContentCanvasWorkspaceSession\(\{/)
  assert.match(controllerSource, /useContentCanvasWorkspaceCreationCommands\(\{/)
  assert.doesNotMatch(controllerSource, /useProjectEntrySessionStore/)
  assert.doesNotMatch(controllerSource, /resolveContentCanvasProjectEntrySessionState/)
  assert.match(workspaceSessionSource, /useProjectEntrySessionStore/)
  assert.match(workspaceSessionSource, /resolveContentCanvasProjectEntrySessionState/)
  assert.match(workspaceSessionSource, /buildContentCanvasProjectEntrySessionSearch/)
  assert.match(workspaceCreationCommandsSource, /export function useContentCanvasWorkspaceCreationCommands/)
  assert.match(workspaceCreationCommandsSource, /createRootContentCanvasNode/)
  assert.match(workspaceCreationCommandsSource, /createChildContentCanvasNode/)
  assert.match(workspaceCreationCommandsSource, /\{ input, position \}/)
  assert.doesNotMatch(workspaceCreationCommandsSource, /ensureDefaultContentUnitFromCanvasNode/)
  assert.doesNotMatch(workspaceCreationCommandsSource, /childKind === 'content_unit'/)
  assert.match(workspaceCreationCommandsSource, /createSceneMomentCanvasNode/)
  assert.match(workspaceCreationCommandsSource, /targetOwnerNodeId/)
  assert.match(workspaceCreationCommandsSource, /nodeKind === 'keyframe' \|\| nodeKind === 'storyboard'/)
  assert.match(workspaceCreationCommandsSource, /createChildContentCanvasNode\(projectId, ownerNode, nodeKind/)
  assert.match(workspaceCreationCommandsSource, /createAssetCanvasNode/)
  assert.match(workspaceCreationCommandsSource, /childNodesByHierarchy/)
  assert.doesNotMatch(workspaceCreationCommandsSource, /nodeContextActions/)
  assert.doesNotMatch(controllerSource, /createRootContentCanvasNode/)
  assert.doesNotMatch(controllerSource, /createChildContentCanvasNode/)
  assert.doesNotMatch(controllerSource, /connectSceneMomentSettingFromCanvas/)
  assert.doesNotMatch(controllerSource, /setManualSceneSettingGroupsBySceneId/)
  assert.doesNotMatch(controllerSource, /nodeContextActions/)
  assert.match(controllerSource, /draftAssetPrompts/)
  assert.match(controllerSource, /selectContentUnitCandidateFromCanvas/)
  assert.match(controllerSource, /createCandidateFromContentUnit/)
  assert.match(controllerSource, /uploadCandidateForContentUnit/)
  assert.match(controllerSource, /uploadCandidateForNode/)
  assert.match(controllerSource, /createCandidateFromResourceForContentUnit/)
  assert.match(controllerSource, /createResourceCandidateForNode/)
  assert.match(controllerSource, /withLocalContentCanvasCandidates/)
  assert.match(controllerSource, /mergeContentCanvasCommandCandidates/)
  assert.match(controllerSource, /mergeContentCanvasCommandSelections/)
  assert.match(controllerSource, /updateContentUnitPromptFromCanvas/)
  assert.match(controllerSource, /updateExpressionUnitFromCanvas/)
  assert.match(controllerSource, /contentCanvasGenerationTargetForNode/)
  assert.match(controllerSource, /contentCanvasCommandFocusState/)
  assert.match(controllerSource, /contentUnitNodeForGenerationTask/)
  assert.doesNotMatch(controllerSource, /function contentUnitNodeForGenerationTask/)
  assert.doesNotMatch(workspaceModelSource, /export function contentCanvasCommandFocusState/)
  assert.doesNotMatch(workspaceModelSource, /export function contentUnitNodeForGenerationTask/)
  assert.match(workspaceCommandModelSource, /export function contentCanvasCommandFocusState/)
  assert.match(workspaceCommandModelSource, /contentCanvasWorkspaceGenerationModel/)
  assert.match(workspaceCandidateModelSource, /export function mergeContentCanvasCommandCandidates/)
  assert.match(workspaceCandidateModelSource, /export function withLocalContentCanvasCandidates/)
  assert.match(workspaceGenerationModelSource, /export function contentCanvasGenerationTargetForNode/)
  assert.match(workspaceGenerationModelSource, /export function contentUnitNodeForGenerationTask/)
  assert.match(workspaceDisplayModelSource, /export function settingTypeLabel/)
  assert.match(workspaceDisplayModelSource, /export function expressionUnitKindLabel/)
  assert.doesNotMatch(controllerSource, /label: '添加素材'/)
  assert.doesNotMatch(controllerSource, /label: '放入 Scene Moment'/)
  assert.doesNotMatch(controllerSource, /label: '添加表达单元'/)
  assert.doesNotMatch(workspaceCreationCommandsSource, /label: '添加表达单元'/)
  assert.doesNotMatch(workspaceCreationCommandsSource, /label: '添加关键帧'/)
  assert.doesNotMatch(workspaceCreationCommandsSource, /label: '添加分镜图'/)
  assert.doesNotMatch(controllerSource, /createKeyframeForShot/)
  assert.match(detailsSource, /selection\.kind === 'create_keyframe'/)
  assert.match(detailsSource, /from '\.\/ContentCanvasInspectorParts'/)
  assert.doesNotMatch(detailsSource, /function GenerationTaskPanel/)
  assert.doesNotMatch(detailsSource, /function CandidateDecisionPanel/)
  assert.doesNotMatch(detailsSource, /function CreateChildNodeInspector/)
  assert.match(detailsSource, /function ContentCanvasInspectorTabs/)
  assert.match(detailsSource, />\s*实体\s*<\/button>/)
  assert.match(detailsSource, />\s*创作片段\s*<\/button>/)
  assert.match(detailsSource, /function ContentUnitInspector/)
  assert.match(detailsSource, /<ContentCanvasPromptEditor/)
  assert.match(detailsSource, /function ContentUnitInspector[\s\S]*<PromptReferenceAppendButtons/)
  assert.match(detailsSource, /function ContentUnitInspector[\s\S]*<CandidateDecisionPanel/)
  assert.match(promptReferencesSource, /export function PromptReferenceInlineEditor/)
  assert.match(promptReferencesSource, /contentEditable/)
  assert.match(promptReferencesSource, /export function PromptReferenceStrip/)
  assert.match(promptReferencesSource, /:\{1,2\}/)
  assert.doesNotMatch(promptCanvasPanelSource, /<PromptReferenceStrip/)
  assert.match(promptReferencesSource, /serializePromptEditor/)
  assert.match(promptReferencesSource, /data-state=\{reference\.state\}/)
  assert.match(promptReferencesSource, /selectedResourceId/)
  assert.match(promptReferencesSource, /explicitSelectedCandidateForNode/)
  assert.match(inspectorPartsSource, /export function GenerationTaskPanel/)
  assert.match(inspectorPartsSource, /export function CandidateDecisionPanel/)
  assert.match(inspectorPartsSource, /type="file"/)
  assert.match(inspectorPartsSource, /上传候选/)
  assert.match(inspectorPartsSource, /资源库候选/)
  assert.match(inspectorPartsSource, /ContentCanvasResourceCandidatePicker/)
  assert.match(inspectorPartsSource, /ResourceCandidatePickerDialog/)
  assert.match(inspectorPartsSource, /role="dialog"/)
  assert.match(inspectorPartsSource, /aria-modal="true"/)
  assert.match(inspectorPartsSource, /createPortal/)
  assert.match(inspectorPartsSource, /function CandidateResourcePreview/)
  assert.match(inspectorPartsSource, /ResourceFileImage/)
  assert.match(inspectorPartsSource, /ResourceFileVideo/)
  assert.match(inspectorPartsSource, /function candidatePromptText/)
  assert.match(inspectorPartsSource, /editPromptText\(snapshot\.edit_prompt\)/)
  assert.match(inspectorPartsSource, /compiledPromptText\(snapshot\.compiled_prompt\)/)
  assert.match(inspectorPartsSource, /resource:\{1,2\}/)
  assert.match(inspectorPartsSource, /<CandidateDetailPrompt[\s\S]*preview=\{compiledPromptPreview\}[\s\S]*prompt=\{promptText\}/)
  assert.match(inspectorPartsSource, /<CompiledPromptPreview[\s\S]*preview=\{preview \?\? null\}[\s\S]*fallbackText=\{prompt\}/)
  assert.match(detailsSource, /function ResourceInspector/)
  assert.match(detailsSource, /ResourceFileImage/)
  assert.match(detailsSource, /ResourceFileVideo/)
  assert.match(inspectorPartsSource, /candidateUploadAccept/)
  assert.match(resourceCandidatePickerSource, /ResourceLibraryPicker/)
  assert.match(resourceCandidatePickerSource, /resourceKeys\.contentWorkspaceCandidates/)
  assert.match(resourceCandidatePickerSource, /api\.get\(`\/resources/)
  assert.match(inspectorPartsSource, /export function CreateChildNodeInspector/)
  assert.match(inspectorPartsSource, /title="创作片段"/)
  assert.doesNotMatch(detailsSource, /InspectorChildGroups/)
  assert.match(detailsSource, /function PromptReferenceAppendButtons/)
	  for (const stylesheet of [
	    'inspector-fields',
	    'inspector-create',
	    'inspector-node-list',
	    'inspector-generation',
	    'inspector-candidates',
	  ]) {
	    assert.match(inspectorCssSource, new RegExp(`ContentCanvasWorkspacePage\\.${stylesheet}\\.css`))
	  }
  assert.match(workspaceCssSource, /ContentCanvasWorkspacePage\.inspector-prompt\.css/)
  assert.doesNotMatch(inspectorCssSource, /\.content-canvas-inspector-create-form\s*\{/)
  assert.doesNotMatch(inspectorCssSource, /\.content-canvas-generation-task\s*\{/)
  assert.doesNotMatch(inspectorCssSource, /\.content-canvas-inspector-node-list\s*\{/)
  assert.doesNotMatch(inspectorCssSource, /\.content-canvas-prompt-reference-strip\s*\{/)
  assert.doesNotMatch(inspectorCssSource, /\.content-canvas-candidate-summary\s*\{/)
  assert.match(inspectorCreateCssSource, /\.content-canvas-inspector-create-form\s*\{/)
  assert.match(inspectorCandidatesCssSource, /\.content-canvas-resource-candidate-dialog[\s\S]*\{\s*position: fixed;/)
  assert.match(inspectorCandidatesCssSource, /\.content-canvas-resource-candidate-dialog__panel[\s\S]*\{\s*position: relative;/)
  assert.match(promptCanvasCssSource, /\.content-prompt-flow-node__candidate-list\s*\{/)
  assert.doesNotMatch(inspectorPartsSource, /ExpressionUnitKindCandidates/)
  assert.doesNotMatch(detailsSource, /ExpressionUnitKindCandidates/)
  assert.doesNotMatch(inspectorCreateCssSource, /\.content-canvas-expression-kind-list\s*\{/)
  assert.match(inspectorGenerationCssSource, /\.content-canvas-generation-task\s*\{/)
  assert.match(inspectorNodeListCssSource, /\.content-canvas-inspector-node-list\s*\{/)
  assert.match(inspectorPromptCssSource, /\.content-canvas-prompt-reference-strip\s*\{/)
  assert.match(inspectorPromptCssSource, /\.content-canvas-prompt-inline-editor-shell\s*\{/)
  assert.match(inspectorPromptCssSource, /\.content-canvas-prompt-inline-editor\s*\{/)
  assert.match(inspectorPromptCssSource, /\.content-canvas-prompt-reference-strip__fallback\s*\{/)
  assert.match(inspectorPromptCssSource, /\.content-canvas-prompt-reference-strip button\[data-missing="true"\]/)
  assert.match(inspectorPromptCssSource, /\.content-canvas-reference-assets\s*\{/)
  assert.match(inspectorCssSource, /\.content-canvas-resource-preview\s*\{/)
  assert.match(detailsSource, /useState<'entity' \| 'content_unit'>\('content_unit'\)/)
  assert.match(cssSource, /\.content-canvas-workspace-tabs\s*\{/)
  assert.match(cssSource, /grid-template-rows:\s*minmax\(300px, 1fr\)/)
  assert.match(cssSource, /\.content-canvas-workspace-tabs\s*\{[\s\S]*grid-column:\s*2;/)
  assert.match(cssSource, /\.content-canvas-workspace-tabs\s*\{[\s\S]*justify-self:\s*center;/)
  assert.doesNotMatch(cssSource, /grid-template-rows:[\s\S]*auto[\s\S]*minmax\(300px, 1fr\)/)
  const previewCssSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspacePage.preview.css'), 'utf8')
  assert.match(previewCssSource, /\.content-canvas-preview-panel\s*\{/)
  assert.match(previewCssSource, /\.content-canvas-preview-candidate-card\s*\{/)
  assert.match(previewCssSource, /\.content-canvas-preview-candidate-card\[data-state="selected"\][\s\S]*var\(--cc-success\)/)
  assert.match(previewCssSource, /\.content-canvas-preview-candidate-card\[data-state="pending"\][\s\S]*var\(--cc-warning\)/)
  assert.match(previewCssSource, /\.content-canvas-preview-candidate-card\[data-state="empty"\][\s\S]*var\(--cc-danger\)/)
  assert.match(promptCanvasCssSource, /\.content-prompt-canvas-panel\s*\{/)
  assert.match(promptCanvasCssSource, /\.content-prompt-flow-node\s*\{/)
  assert.match(inspectorCandidatesCssSource, /\.content-canvas-candidate-summary\s*\{/)
  assert.match(inspectorCandidatesCssSource, /\.content-canvas-candidate-card\s*\{/)
  assert.match(inspectorCandidatesCssSource, /\.content-canvas-candidate-card__actions button/)
  assert.match(inspectorCandidatesCssSource, /\.content-canvas-candidate-detail-dialog\s*\{/)
  assert.match(inspectorCandidatesCssSource, /\.content-canvas-candidate-upload-input\s*\{/)
  assert.match(inspectorCandidatesCssSource, /\.content-canvas-resource-candidate-picker\s*\{/)
  assert.match(inspectorCandidatesCssSource, /\.content-canvas-candidate-preview\s*\{/)
  assert.match(detailsSource, /submitLabel="创建关键帧"/)
  assert.match(detailsSource, /submitLabel="创建分镜图"/)

  assert.match(viewModelSource, /export function buildContentCanvasWorkspaceViewModel/)
  assert.match(viewModelSource, /reconcileContentCanvasInspectorSelection/)
  assert.doesNotMatch(viewModelSource, /useState/)
  assert.doesNotMatch(viewModelSource, /useQuery/)
  assert.match(workspaceModelSource, /from '\.\/contentCanvasWorkspaceGraphModel'/)
  assert.match(workspaceModelSource, /from '\.\/contentCanvasWorkspaceNodeModel'/)
  assert.doesNotMatch(workspaceModelSource, /function candidateDecisionForNode/)
  assert.doesNotMatch(workspaceModelSource, /function mediaKindForNode/)
  assert.match(workspaceNodeModelSource, /export function candidateDecisionForNode/)
  assert.match(workspaceNodeModelSource, /export function mediaKindForNode/)
  assert.doesNotMatch(workspaceModelSource, /function fallbackContentCanvasInspectorSelection/)
  assert.doesNotMatch(workspaceModelSource, /function sceneScopedNodeIds/)
  assert.match(workspaceGraphModelSource, /export function contentCanvasWorkspaceIndex/)
  assert.match(workspaceGraphModelSource, /export function radialNodesAround/)
  assert.doesNotMatch(workspaceGraphModelSource, /main\.kind === 'scene_moment' && node\.kind === 'shot'/)
  assert.match(workspaceGraphModelSource, /export function reconcileContentCanvasInspectorSelection/)
  assert.match(workspaceGraphModelSource, /function sceneScopedNodeIds/)
  assert.match(workspaceGraphModelSource, /childNodesByHierarchy/)
  assert.match(workspaceGraphModelSource, /edge\.kind === 'hierarchy'\) appendMapArray\(childNodesByHierarchy/)

  assert.match(gatewaySource, /export interface ContentCanvasWorkspaceGateway/)
  assert.doesNotMatch(gatewaySource, /createShot/)
  assert.match(gatewaySource, /createKeyframe/)
  assert.match(gatewaySource, /createStoryboard/)
  assert.match(gatewaySource, /createContentUnit/)
  assert.match(gatewaySource, /ensureContentUnitForEntity/)
  assert.doesNotMatch(electronGatewaySource, /createShot/)
  assert.match(electronGatewaySource, /createKeyframe/)
  assert.match(electronGatewaySource, /createStoryboard/)
  assert.match(electronGatewaySource, /createMovScriptEngineContentUnit/)
  assert.match(electronGatewaySource, /ensureContentUnitForEntity/)
  assert.doesNotMatch(electronGatewaySource, /shots: \[\{/)
  assert.match(commandsSource, /ContentCanvasWorkspaceGateway/)
  assert.match(commandsSource, /from '.\/contentCanvasCreateNodeCommands'/)
  assert.doesNotMatch(commandsSource, /connectContentUnitRelationFromCanvas/)
  assert.doesNotMatch(commandsSource, /function patchContentUnitRelation/)
  assert.match(commandsSource, /defaultContentUnitDraftForNode/)
  assert.match(commandsSource, /contentUnitType: 'keyframe_ref'/)
  assert.match(commandsSource, /contentUnitType: 'storyboard_ref'/)
  assert.doesNotMatch(commandsSource, /shot_ref/)
  assert.doesNotMatch(commandsSource, /async function createSettingFromCanvas/)
  assert.doesNotMatch(commandsSource, /async function createStoryboardFromShot/)
  assert.doesNotMatch(commandsSource, /function requiredShotRefs/)
  assert.match(createNodeCommandsSource, /export async function createRootContentCanvasNode/)
  assert.match(createNodeCommandsSource, /export async function createChildContentCanvasNode/)
  assert.match(createNodeCommandsSource, /export function suggestedContentCanvasChildNodePosition/)
  assert.match(createNodeCommandsSource, /targetOwnerNodeId\?: string/)
  assert.match(createNodeCommandsSource, /from '.\/contentCanvasContentUnitCreateNodeCommands'/)
  assert.match(createNodeCommandsSource, /from '.\/contentCanvasCreateNodeCommandHelpers'/)
  assert.doesNotMatch(createNodeCommandsSource, /async function createStoryboardFromShot/)
  assert.doesNotMatch(createNodeCommandsSource, /ensureContentUnitForRef/)
  assert.doesNotMatch(createNodeCommandsSource, /function requiredShotRefs/)
  assert.match(contentUnitCreateNodeCommandsSource, /export async function createAssetFromSettingState/)
  assert.match(contentUnitCreateNodeCommandsSource, /export async function createNakedGenerationTaskCanvasNode/)
  assert.match(contentUnitCreateNodeCommandsSource, /export async function createSceneMomentCanvasNode/)
  assert.match(contentUnitCreateNodeCommandsSource, /export async function createAssetCanvasNode/)
  assert.match(contentUnitCreateNodeCommandsSource, /connectSceneMomentSetting/)
  assert.match(contentUnitCreateNodeCommandsSource, /export async function createExpressionUnitFromSceneMoment/)
  assert.doesNotMatch(contentUnitCreateNodeCommandsSource, /export async function createKeyframeFromShot/)
  assert.match(contentUnitCreateNodeCommandsSource, /ensureContentUnitForRef/)
  assert.match(contentUnitCreateNodeCommandsSource, /refKind: 'expression_unit'/)
  assert.match(contentUnitCommandsSource, /refKind: 'asset' \| 'scene_moment' \| 'expression_unit' \| 'keyframe' \| 'storyboard'/)
  assert.doesNotMatch(contentUnitCommandsSource, /shot/)
  assert.match(expressionUnitKindsSource, /\| 'shot'/)
  assert.match(expressionUnitKindsSource, /value: 'shot'/)
  assert.match(expressionUnitKindsSource, /return 'video'/)
  assert.doesNotMatch(createNodeCommandHelpersSource, /export function requiredShotRefs/)
  assert.match(createNodeCommandHelpersSource, /export function createdNodeResult/)
  assert.match(createNodeCommandHelpersSource, /export function createInputOrDefault/)
  assert.match(commandsSource, /from '.\/contentCanvasCandidateCommands'/)
  assert.doesNotMatch(commandsSource, /function contentCanvasCandidateFromContentRecord/)
  assert.doesNotMatch(commandsSource, /function selectCandidateNodeFromCanvas/)
  assert.match(candidateCommandsSource, /export async function createCandidateFromContentUnit/)
  assert.match(candidateCommandsSource, /export async function createCandidateFromResourceForContentUnit/)
  assert.match(candidateCommandsSource, /export async function selectContentUnitCandidateFromCanvas/)
  assert.match(candidateCommandsSource, /export async function selectCandidateNodeFromCanvas/)
  assert.match(candidateCommandsSource, /buildContentSourceWorkspaceCandidateCreatePlan/)
  assert.match(snapshotSource, /from '.\/contentCanvasGraphNodes'/)
  assert.match(snapshotSource, /createContentCanvasEntityNode\(entity, data\.projectId/)
  assert.doesNotMatch(snapshotSource, /function createNode/)
  assert.doesNotMatch(snapshotSource, /function metricsForEntity/)
  assert.doesNotMatch(snapshotSource, /function statusForEntity/)
  assert.match(graphNodesSource, /export function createContentCanvasEntityNode/)
  assert.match(graphNodesSource, /function metricsForEntity/)
  assert.match(graphNodesSource, /function statusForEntity/)
  assert.match(snapshotSource, /from '.\/contentCanvasGraphWorkItems'/)
  assert.doesNotMatch(snapshotSource, /owner_type/)
  assert.doesNotMatch(snapshotSource, /owner_id/)
  assert.doesNotMatch(snapshotSource, /function createWorkItemNodes/)
  assert.doesNotMatch(snapshotSource, /function createActorNodes/)
  assert.match(workItemsGraphSource, /export function createWorkItemNodes/)
  assert.match(workItemsGraphSource, /export function createActorNodes/)
  assert.match(workItemsGraphSource, /export function targetNodeForWorkItem/)
  assert.match(snapshotSource, /from '.\/contentCanvasWorkspaceSnapshotSummary'/)
  assert.doesNotMatch(snapshotSource, /function buildContentCanvasWorkspaceSnapshotIndexes/)
  assert.doesNotMatch(snapshotSource, /function buildContentCanvasWorkspaceSnapshotSummary/)
  assert.doesNotMatch(snapshotSource, /function withStructureSummaryMetrics/)
  assert.match(snapshotSummarySource, /export function withGraphIndexesAndSummary/)
  assert.match(snapshotSummarySource, /export function withStructureSummaryMetrics/)
  assert.match(snapshotSource, /from '.\/contentCanvasGraphCandidates'/)
  assert.doesNotMatch(snapshotSource, /function createCandidateNodes/)
  assert.doesNotMatch(snapshotSource, /function createSelectionNodes/)
  assert.doesNotMatch(snapshotSource, /function createResourceNodes/)
  assert.match(graphCandidatesSource, /export function createCandidateNodes/)
  assert.match(graphCandidatesSource, /export function createSelectionNodes/)
  assert.match(graphCandidatesSource, /export function resourceNodeIdFor/)
  assert.match(snapshotSource, /from '.\/contentCanvasGraphLayout'/)
  assert.doesNotMatch(snapshotSource, /function appendSequenceEdges/)
  assert.doesNotMatch(snapshotSource, /function assignDeterministicPositions/)
  assert.match(graphLayoutSource, /export function appendSequenceEdges/)
  assert.match(graphLayoutSource, /export function assignDeterministicPositions/)
  assert.match(snapshotSource, /from '.\/contentCanvasGraphAssets'/)
  assert.match(snapshotSource, /appendAssetDownstreamEdges\(edges, data\.assetReferenceUnits/)
  assert.doesNotMatch(snapshotSource, /function assetNodeForReferenceUnit/)
  assert.doesNotMatch(snapshotSource, /function targetNodeForAssetDownstream/)
  assert.doesNotMatch(snapshotSource, /function assetDownstreamLabel/)
  assert.match(graphAssetsSource, /export function appendAssetDownstreamEdges/)
  assert.match(graphAssetsSource, /relation: 'asset_downstream'/)
  assert.match(snapshotSource, /from '.\/contentCanvasGraphReferences'/)
  assert.match(snapshotSource, /appendContentCanvasReferenceEdges\(\{ data, edges, entityNodes, nodeByEntityKindAndKey, nodeByPath \}\)/)
  assert.doesNotMatch(snapshotSource, /function referencedNodeFor/)
  assert.doesNotMatch(snapshotSource, /function settingStateRefsForRecord/)
  assert.doesNotMatch(snapshotSource, /function expressionStoryboardRefs/)
  assert.match(graphReferencesSource, /export function appendContentCanvasReferenceEdges/)
  assert.match(graphReferencesSource, /relation: 'content_unit_scene'/)
  assert.match(graphReferencesSource, /relation: 'expression_unit_storyboard'/)
  assert.match(graphReferencesSource, /relation: 'audio_cue_storyboard'/)
  assert.match(graphReferencesSource, /relation: 'setting_state_reference'/)
  assert.match(loadProjectSource, /ContentCanvasWorkspaceGateway/)
  assert.doesNotMatch(commandsSource, /createElectronMovScriptWorkspaceService/)
  assert.doesNotMatch(commandsSource, /readSurfaceHostApi/)
  assert.doesNotMatch(commandsSource, /currentWorkspaceOwnerContext/)
  assert.doesNotMatch(loadProjectSource, /createElectronMovScriptWorkspaceService/)
  assert.doesNotMatch(loadProjectSource, /readSurfaceHostApi/)
  assert.doesNotMatch(loadProjectSource, /currentWorkspaceOwnerContext/)
  assert.match(electronGatewaySource, /createSurfaceWorkspaceDomainService/)
  assert.match(electronGatewaySource, /readSurfaceHostApi/)

  assert.match(panelsSource, /PanelResizeHandle/)
  assert.match(panelsSource, /ContentCanvasResizeHandle/)
  assert.doesNotMatch(panelsSource, /onNodePositionCommit/)
  assert.doesNotMatch(panelsSource, /defaultValue="雨夜"/)

  assert.match(layoutSource, /useRouteLayoutPaneController/)
  assert.match(layoutSource, /useResizablePanel/)
  assert.doesNotMatch(layoutSource, /readContentCanvasViewState/)
  assert.doesNotMatch(layoutSource, /mergeContentCanvasNodePositions/)
  assert.doesNotMatch(layoutSource, /clearContentCanvasNodePositions/)
  assert.doesNotMatch(layoutSource, /CONTENT_CANVAS_SETTING_CATALOG_PANE_ID/)
  assert.match(layoutSource, /CONTENT_CANVAS_STRUCTURE_PANE_ID/)
  assert.match(layoutSource, /CONTENT_CANVAS_INSPECTOR_PANE_ID/)
  assert.match(layoutSource, /CONTENT_CANVAS_TIMELINE_PANE_ID/)
  assert.doesNotMatch(layoutSource, /fallbackSize:/)
  assert.doesNotMatch(layoutSource, /clampSize:/)
  assert.doesNotMatch(layoutSource, /function clampPaneSize/)

  assert.doesNotMatch(cssSource, /var\(--content-canvas-setting-catalog-height\)/)
  assert.match(cssSource, /var\(--content-canvas-structure-width\)/)
  assert.match(cssSource, /var\(--content-canvas-inspector-width\)/)
  assert.doesNotMatch(cssSource, /var\(--content-canvas-timeline-height\)/)
  assert.doesNotMatch(cssSource, /content-canvas-workspace-top/)
  assert.match(cssSource, /content-canvas-resize-handle--left/)
  assert.match(cssSource, /content-canvas-resize-handle--right/)
  assert.match(cssSource, /content-canvas-resize-handle--bottom/)
})

test('content canvas desktop gateway is scoped by the active workspace root', () => {
  const controllerSource = readFileSync(resolve('src/features/content/components/useContentCanvasWorkspaceController.ts'), 'utf8')
  const electronGatewaySource = readFileSync(resolve('src/features/content/integrations/contentCanvasWorkspaceElectronGateway.ts'), 'utf8')
  const queryKeysSource = readFileSync(resolve('src/features/content/application/contentCanvasQueryKeys.ts'), 'utf8')
  const mutationInvalidationSource = readFileSync(resolve('src/features/content/application/contentCanvasMutationInvalidation.ts'), 'utf8')
  const desktopInvalidationSource = readFileSync(resolve('../../apps/desktop/src/shared/application/appEventQueryInvalidation.ts'), 'utf8')

  assert.match(controllerSource, /workspaceRoot = useSurfaceHostState\(\(state\) => state\.workspaceRoot\)/)
  assert.match(controllerSource, /workspaceRoot\?\.trim\(\) \|\| project\?\.workspace_path\?\.trim\(\) \|\| project\?\.project_path\?\.trim\(\)/)
  assert.match(controllerSource, /createElectronContentCanvasWorkspaceGateway\(projectId, \{ projectDir \}\)/)
  assert.match(controllerSource, /contentCanvasKeys\.project\(projectId, projectDir\)/)
  assert.match(electronGatewaySource, /options: \{ projectDir\?: string \| null \} = \{\}/)
  assert.match(electronGatewaySource, /options\.projectDir\?\.trim\(\) \|\| currentSurfaceWorkspaceProjectDir\(\)/)
  assert.match(electronGatewaySource, /currentProjectDataCandidateContext\(\)/)
  assert.match(electronGatewaySource, /context\.project_uid = projectUid/)
  assert.match(electronGatewaySource, /context\.scope_kind = 'user'/)
  assert.match(electronGatewaySource, /context\.scope_kind = 'org'/)
  assert.match(queryKeysSource, /projectScope: \(projectId: number \| undefined\)/)
  assert.match(queryKeysSource, /project: \(projectId: number \| undefined, projectDir\?: string \| null\)/)
  assert.match(mutationInvalidationSource, /contentCanvasKeys\.projectScope\(event\.projectId\)/)
  assert.match(desktopInvalidationSource, /contentCanvasKeys\.projectScope\(projectId\)/)
})

test('content canvas graph state keeps unchanged node references during structural merge', () => {
  const first = createContentCanvasWorkspaceSnapshotState(graphFixture())
  const second = createContentCanvasWorkspaceSnapshotState(graphFixture(), first)
  const changed = createContentCanvasWorkspaceSnapshotState(graphFixture({
    nodes: [
      nodeFixture({ id: 'expression_unit:1', entityKey: '1', kind: 'expression_unit', title: 'Shot 1 updated', position: { x: 0, y: 0 }, record: { kind: 'shot' } }),
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Asset 1', position: { x: 900, y: 0 } }),
    ],
  }), second)

  assert.equal(second.nodesById['expression_unit:1'], first.nodesById['expression_unit:1'])
  assert.equal(second.nodesById['asset:1'], first.nodesById['asset:1'])
  assert.notEqual(changed.nodesById['expression_unit:1'], second.nodesById['expression_unit:1'])
  assert.equal(changed.nodesById['asset:1'], second.nodesById['asset:1'])
  assert.equal(second.nodeIds, first.nodeIds)
  assert.equal(second.outgoingEdgeIdsByNodeId['expression_unit:1'], first.outgoingEdgeIdsByNodeId['expression_unit:1'])
})

test('content canvas inspector selection rehydrates from the latest workspace graph', () => {
  const previousSetting = nodeFixture({ id: 'setting:1', entityKey: '1', kind: 'setting', title: 'Setting old', position: { x: 0, y: 0 } })
  const nextSetting = nodeFixture({ id: 'setting:1', entityKey: '1', kind: 'setting', title: 'Setting updated', position: { x: 0, y: 0 } })
  const scene = nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene 1', position: { x: 720, y: 0 } })
  const graph = graphFixture({ nodes: [scene, nextSetting], edges: [] })
  const nextSelection = reconcileContentCanvasInspectorSelection({
    graphIndex: contentCanvasWorkspaceIndex(graph),
    sceneMainNode: radialNodeFromContentNode(scene, 0, 0, 'primary'),
    selection: { kind: 'setting', nodeId: previousSetting.id },
    settingMainNode: radialNodeFromContentNode(nextSetting, 0, 0, 'primary'),
  })

  assert.equal(nextSelection.kind, 'setting')
  if (nextSelection.kind === 'setting') {
    assert.equal(nextSelection.setting, nextSetting)
    assert.equal(nextSelection.setting.title, 'Setting updated')
  }
})

test('content canvas inspector selection falls back only when the selected node disappeared', () => {
  const staleNode = nodeFixture({ id: 'expression_unit:deleted', entityKey: 'deleted', kind: 'expression_unit', title: 'Deleted shot expression', position: { x: 0, y: 0 }, record: { kind: 'shot' } })
  const scene = nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene 1', position: { x: 720, y: 0 } })
  const sceneMainNode = radialNodeFromContentNode(scene, 0, 0, 'primary')
  const nextSelection = reconcileContentCanvasInspectorSelection({
    graphIndex: contentCanvasWorkspaceIndex(graphFixture({ nodes: [scene], edges: [] })),
    sceneMainNode,
    selection: { kind: 'other', nodeId: staleNode.id },
  })

  assert.equal(nextSelection.kind, 'scene_moment')
  if (nextSelection.kind === 'scene_moment') {
    assert.equal(nextSelection.node, sceneMainNode)
  }
})

test('content canvas presentation exposes stable type short codes for dense nodes', () => {
  assert.deepEqual([
    kindShortCode('setting'),
    kindShortCode('state'),
    kindShortCode('asset'),
    kindShortCode('expression_unit'),
    kindShortCode('audio_cue'),
    kindShortCode('keyframe'),
    kindShortCode('storyboard'),
    kindShortCode('content_unit'),
    kindShortCode('actor'),
    kindShortCode('group'),
  ], ['SET', 'STATE', 'AST', 'EXP', 'AUD', 'KEY', 'STB', 'UNIT', 'ACT', 'GRP'])
})

test('content canvas edge presentation assigns distinct visual layers and focus dimming', () => {
  const edges: ContentCanvasEdge[] = [
    edgeFixture({ id: 'structure', kind: 'hierarchy' }),
    edgeFixture({ id: 'sequence', kind: 'sequence' }),
    edgeFixture({ id: 'input', relation: 'content_unit_asset', type: 'depends_on' }),
    edgeFixture({ id: 'product', relation: 'content_unit_candidate', type: 'generates' }),
    edgeFixture({ id: 'selection', relation: 'selection_candidate', type: 'selected_from' }),
    edgeFixture({ id: 'issue', relation: 'work_item_target', type: 'work_item_targets' }),
  ]

  assert.deepEqual(edges.map((edge) => contentCanvasEdgeVisualLayer(edge)), [
    'structure',
    'sequence',
    'input',
    'product',
    'selection',
    'issue',
  ])
  assert.notEqual(contentCanvasEdgeVisualState(edges[2]).color, contentCanvasEdgeVisualState(edges[3]).color)
  assert.notEqual(contentCanvasEdgeVisualState(edges[3]).color, contentCanvasEdgeVisualState(edges[4]).color)

  const unrelated = contentCanvasEdgeVisualState(edgeFixture({
    id: 'unrelated',
    source: 'asset:1',
    target: 'content_unit:2',
    relation: 'content_unit_asset',
  }), { selectedNodeId: 'content_unit:1' })
  const related = contentCanvasEdgeVisualState(edgeFixture({
    id: 'related',
    source: 'asset:1',
    target: 'content_unit:1',
    relation: 'content_unit_asset',
  }), { selectedNodeId: 'content_unit:1' })

  assert.equal(unrelated.classNames.includes('content-canvas-edge--dimmed'), true)
  assert.equal(unrelated.style.opacity, 0.18)
  assert.equal(related.classNames.includes('content-canvas-edge--focused'), true)
  assert.notEqual(related.style.opacity, 0.18)
})

test('content canvas edge presentation reverses input edges for left-to-right flow only', () => {
  assert.deepEqual(contentCanvasVisualEdgeEndpoints(edgeFixture({
    source: 'content_unit:render',
    target: 'asset:phone',
    relation: 'content_unit_asset',
  })), {
    source: 'asset:phone',
    target: 'content_unit:render',
    reversed: true,
  })
  assert.deepEqual(contentCanvasVisualEdgeEndpoints(edgeFixture({
    source: 'content_unit:render',
    target: 'candidate:render:a',
    relation: 'content_unit_candidate',
  })), {
    source: 'content_unit:render',
    target: 'candidate:render:a',
    reversed: false,
  })
  assert.deepEqual(contentCanvasVisualEdgeEndpoints(edgeFixture({
    source: 'candidate:render:a',
    target: 'resource:42',
    relation: 'candidate_resource',
  })), {
    source: 'candidate:render:a',
    target: 'resource:42',
    reversed: false,
  })
})

test('content canvas edge presentation chooses vertical handles for cross-lane constraints', () => {
  assert.deepEqual(contentCanvasVisualEdgeHandles(
    edgeFixture({ relation: 'audio_cue_storyboard' }),
    { x: 1440, y: -260, width: 260, height: 118 },
    { x: 1440, y: 0, width: 260, height: 118 },
  ), {
    sourceHandle: 'source-bottom',
    targetHandle: 'target-top',
  })
  assert.deepEqual(contentCanvasVisualEdgeHandles(
    edgeFixture({ relation: 'content_unit_candidate' }),
    { x: 1810, y: 0, width: 260, height: 210 },
    { x: 2170, y: 260, width: 260, height: 118 },
  ), {
    sourceHandle: 'source-right',
    targetHandle: 'target-left',
  })
  const reversed = contentCanvasVisualEdgeEndpoints(edgeFixture({
    source: 'content_unit:render',
    target: 'asset:phone',
    relation: 'content_unit_asset',
  }))
  assert.deepEqual(contentCanvasVisualEdgeHandles(
    edgeFixture({ relation: 'content_unit_asset' }),
    { x: 720, y: -260, width: 260, height: 118 },
    { x: 1810, y: 0, width: 260, height: 210 },
  ), {
    sourceHandle: 'source-right',
    targetHandle: 'target-left',
  })
  assert.equal(reversed.reversed, true)
})

test('content canvas layout preserves manual positions across graph refreshes', () => {
  const first = createContentCanvasWorkspaceSnapshotState(graphFixture())
  const movedLayouts = patchContentCanvasNodeLayout(
    first.layoutByNodeId,
    'expression_unit:1',
    { x: 320, y: 240 },
    { markManual: true, updatedAt: '2026-06-15T00:00:00.000Z' },
  )
  const second = createContentCanvasWorkspaceSnapshotState(graphFixture({
    nodes: [
      nodeFixture({ id: 'expression_unit:1', entityKey: '1', kind: 'expression_unit', title: 'Shot 1', position: { x: 0, y: 0 }, record: { kind: 'shot' } }),
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Asset 1', position: { x: 1200, y: 100 } }),
    ],
  }), {
    ...first,
    layoutByNodeId: movedLayouts,
  })

  assert.deepEqual(second.layoutByNodeId['expression_unit:1'], {
    ...movedLayouts['expression_unit:1'],
    x: 320,
    y: 240,
    manual: true,
    source: 'manual',
  })
  assert.deepEqual(second.layoutByNodeId['asset:1'], first.layoutByNodeId['asset:1'])
})

test('content canvas layout retains disappeared node tombstones for later recovery', () => {
  const first = createContentCanvasWorkspaceSnapshotState(graphFixture({
    nodes: [
      nodeFixture({ id: 'expression_unit:1', entityKey: '1', kind: 'expression_unit', title: 'Shot 1', position: { x: 0, y: 0 }, record: { kind: 'shot' } }),
      nodeFixture({ id: 'content_unit:transient', entityKey: 'transient', kind: 'content_unit', title: 'Transient unit', position: { x: 720, y: 120 } }),
    ],
    edges: [],
  }))
  const movedLayouts = patchContentCanvasNodeLayout(
    first.layoutByNodeId,
    'content_unit:transient',
    { x: 680, y: 220 },
    { markManual: true, updatedAt: '2026-06-15T00:00:00.000Z' },
  )
  const disappeared = createContentCanvasWorkspaceSnapshotState(graphFixture({
    nodes: [
      nodeFixture({ id: 'expression_unit:1', entityKey: '1', kind: 'expression_unit', title: 'Shot 1', position: { x: 0, y: 0 }, record: { kind: 'shot' } }),
    ],
    edges: [],
  }), {
    ...first,
    layoutByNodeId: movedLayouts,
  })
  const recovered = createContentCanvasWorkspaceSnapshotState(graphFixture({
    nodes: [
      nodeFixture({ id: 'expression_unit:1', entityKey: '1', kind: 'expression_unit', title: 'Shot 1', position: { x: 0, y: 0 }, record: { kind: 'shot' } }),
      nodeFixture({ id: 'content_unit:transient', entityKey: 'transient', kind: 'content_unit', title: 'Transient unit', position: { x: 1440, y: 600 } }),
    ],
    edges: [],
  }), disappeared)

  assert.deepEqual(disappeared.layoutByNodeId['content_unit:transient'], movedLayouts['content_unit:transient'])
  assert.deepEqual(recovered.layoutByNodeId['content_unit:transient'], movedLayouts['content_unit:transient'])
})

test('content canvas command positions apply as manual layouts immediately', () => {
  const layouts = patchContentCanvasNodeLayouts(
    {},
    contentCanvasLayoutPatchFromPositions({
      'expression_unit:new': { x: 42, y: 84 },
    }),
    { markManual: true, updatedAt: '2026-06-15T00:00:00.000Z' },
  )

  assert.deepEqual(layouts['expression_unit:new'], {
    x: 42,
    y: 84,
    width: 260,
    height: 118,
    manual: true,
    source: 'manual',
    updatedAt: '2026-06-15T00:00:00.000Z',
  })
})

test('content canvas command suggests derived nodes near their anchor', () => {
  const anchor = nodeFixture({
    id: 'asset:phone',
    entityKey: 'phone',
    kind: 'asset',
    title: 'Phone asset',
    position: { x: 720, y: 240 },
  })

  assert.deepEqual(suggestedContentCanvasChildNodePosition(anchor), { x: 1080, y: 240 })
  assert.deepEqual(suggestedContentCanvasChildNodePosition(anchor, 2), { x: 1080, y: 408 })
})

test('content canvas drag persistence writes only changed position patches', () => {
  const layouts = {
    'expression_unit:stable': {
      x: 10,
      y: 20,
      width: 260,
      height: 118,
    },
    'expression_unit:moved': {
      x: 30,
      y: 40,
      width: 260,
      height: 118,
    },
  }

  const patches = contentCanvasChangedPositionPatches(layouts, {
    'expression_unit:stable': { x: 10, y: 20 },
    'expression_unit:moved': { x: 32, y: 44 },
    'expression_unit:new': { x: 100, y: 120 },
  })

  assert.deepEqual(patches, {
    'expression_unit:moved': { x: 32, y: 44 },
    'expression_unit:new': { x: 100, y: 120 },
  })
})

test('content canvas view state is scoped by graph mode with legacy fallback', () => {
  const restoreWindow = installLocalStorageFixture()
  try {
    writeContentCanvasViewState(71, {
      viewport: { x: 10, y: 20, zoom: 0.8 },
    }, { mode: 'structure' })
    writeContentCanvasViewState(71, {
      viewport: { x: 100, y: 200, zoom: 1.2 },
    }, { mode: 'dependency' })
    writeContentCanvasViewState(72, {
      focusedNodeId: 'shot:legacy',
    })

    assert.equal(readContentCanvasViewState(71, { mode: 'structure' })?.schema, 'movscript.content_canvas_layout.v1')
    assert.deepEqual(readContentCanvasViewState(71, { mode: 'structure' })?.viewport, { x: 10, y: 20, zoom: 0.8 })
    assert.deepEqual(readContentCanvasViewState(71, { mode: 'dependency' })?.viewport, { x: 100, y: 200, zoom: 1.2 })
    assert.equal(readContentCanvasViewState(72, { mode: 'issues' })?.focusedNodeId, 'shot:legacy')

    clearContentCanvasViewState(71, { mode: 'structure' })
    assert.equal(readContentCanvasViewState(71, { mode: 'structure' }), undefined)
    assert.deepEqual(readContentCanvasViewState(71, { mode: 'dependency' })?.viewport, { x: 100, y: 200, zoom: 1.2 })
  } finally {
    restoreWindow()
  }
})

test('content canvas view state clears manual positions for selected node ids only', () => {
  const restoreWindow = installLocalStorageFixture()
  try {
    writeContentCanvasViewState(73, {
      nodePositions: {
        'scene_moment:1': { x: 10, y: 20 },
        'content_unit:cu': { x: 30, y: 40 },
        'candidate:cu:a': { x: 50, y: 60 },
      },
      nodeLayouts: {
        'scene_moment:1': { x: 10, y: 20, width: 260, height: 128, manual: true, source: 'manual' },
        'content_unit:cu': { x: 30, y: 40, width: 260, height: 128, manual: true, source: 'manual' },
        'candidate:cu:a': { x: 50, y: 60, width: 180, height: 82, manual: true, source: 'manual' },
      },
    }, { mode: 'creative' })

    clearContentCanvasNodePositionsForIds(73, ['content_unit:cu', 'candidate:cu:a'], { mode: 'creative' })

    const state = readContentCanvasViewState(73, { mode: 'creative' })
    assert.deepEqual(state?.nodePositions, {
      'scene_moment:1': { x: 10, y: 20 },
    })
    assert.deepEqual(Object.keys(state?.nodeLayouts ?? {}), ['scene_moment:1'])
  } finally {
    restoreWindow()
  }
})

test('content canvas view state persistence is routed through desktop Home storage', () => {
  const source = readFileSync(resolve('src/features/content/application/contentCanvasViewStateStore.ts'), 'utf8')
  const layoutSource = readFileSync(resolve('src/features/content/components/contentCanvasWorkspaceLayout.tsx'), 'utf8')

  assert.equal(CONTENT_CANVAS_VIEW_STATE_DESKTOP_PREFIX, 'movscript-content-canvas-view-state-v1')
  assert.match(source, /api\.getDesktopState\(\{ key: desktopKey \}\)/)
  assert.match(source, /api\.setDesktopState\(\{ key: contentCanvasViewStateDesktopKey\(projectId, scope\), value: serialized \}\)/)
  assert.match(source, /api\.removeDesktopState\(\{ key: contentCanvasViewStateDesktopKey\(projectId, scope\) \}\)/)
  assert.doesNotMatch(layoutSource, /subscribeContentCanvasViewState/)
})

test('content canvas view state keeps pure model logic outside persistence adapters', () => {
  const source = readFileSync(resolve('src/features/content/application/contentCanvasViewState.ts'), 'utf8')
  const modelSource = readFileSync(resolve('src/features/content/application/contentCanvasViewStateModel.ts'), 'utf8')
  const storeSource = readFileSync(resolve('src/features/content/application/contentCanvasViewStateStore.ts'), 'utf8')

  assert.match(source, /from '\.\/contentCanvasViewStateModel'/)
  assert.match(source, /from '\.\/contentCanvasViewStateStore'/)
  assert.match(storeSource, /from '\.\/contentCanvasViewStateModel'/)
  assert.match(modelSource, /export function parseContentCanvasViewState/)
  assert.match(modelSource, /export function contentCanvasViewStateStorageKey/)
  assert.doesNotMatch(modelSource, /readSurfaceHostApi|readBrowserStorageItem|writeBrowserStorageItem|listenToWindowEvent|publishWindowEvent/)
  assert.doesNotMatch(source, /readSurfaceHostApi|readBrowserStorageItem|writeBrowserStorageItem|listenToWindowEvent|publishWindowEvent/)
  assert.doesNotMatch(source, /function isViewState|function isViewport|function contentCanvasViewStateScopeKey/)
})

test('content canvas documents are free canvases with local node refs and layout', () => {
  const restoreWindow = installLocalStorageFixture()
  try {
    const initial = ensureContentCanvasDocumentsState(91)
    const firstCanvasId = initial?.activeCanvasId ?? ''

    assert.ok(firstCanvasId)
    assert.equal(activeContentCanvasDocument(initial)?.title, '自由画布')
    assert.equal('mode' in (activeContentCanvasDocument(initial) ?? {}), false)
    assert.equal('type' in (activeContentCanvasDocument(initial) ?? {}), false)

    addContentCanvasDocumentNodes(91, firstCanvasId, [{
      nodeId: 'scene_moment:ending',
      kind: 'scene_moment',
      position: { x: 20, y: 40 },
    }])
    const secondState = createContentCanvasDocument(91, { title: '收尾帧互联' })
    const secondCanvasId = secondState?.activeCanvasId ?? ''
    addContentCanvasDocumentNodes(91, secondCanvasId, [{
      nodeId: 'scene_moment:ending',
      kind: 'scene_moment',
      position: { x: 420, y: 240 },
    }])
    updateContentCanvasDocumentViewport(91, secondCanvasId, { x: -200, y: -80, zoom: 0.72 })

    const stored = readContentCanvasDocumentsState(91)
    const first = stored?.documents[firstCanvasId]
    const second = stored?.documents[secondCanvasId]

    assert.deepEqual(contentCanvasDocumentNodeIds(first), ['scene_moment:ending'])
    assert.deepEqual(contentCanvasDocumentNodeIds(second), ['scene_moment:ending'])
    assert.deepEqual(contentCanvasDocumentPositions(first), { 'scene_moment:ending': { x: 20, y: 40 } })
    assert.deepEqual(contentCanvasDocumentPositions(second), { 'scene_moment:ending': { x: 420, y: 240 } })
    assert.deepEqual(second?.viewport, { x: -200, y: -80, zoom: 0.72 })
    assert.deepEqual(second?.nodes['scene_moment:ending'], {
      nodeId: 'scene_moment:ending',
      kind: 'scene_moment',
      addedAt: second?.nodes['scene_moment:ending']?.addedAt,
    })
    assert.equal(Object.prototype.hasOwnProperty.call(second?.nodes['scene_moment:ending'] ?? {}, 'title'), false)

    removeContentCanvasDocumentNodes(91, firstCanvasId, ['scene_moment:ending'])
    assert.deepEqual(contentCanvasDocumentNodeIds(readContentCanvasDocumentsState(91)?.documents[firstCanvasId]), [])
    assert.deepEqual(contentCanvasDocumentNodeIds(readContentCanvasDocumentsState(91)?.documents[secondCanvasId]), ['scene_moment:ending'])

    removeContentCanvasDocumentNodesEverywhere(91, ['scene_moment:ending'])
    assert.deepEqual(contentCanvasDocumentNodeIds(readContentCanvasDocumentsState(91)?.documents[firstCanvasId]), [])
    assert.deepEqual(contentCanvasDocumentNodeIds(readContentCanvasDocumentsState(91)?.documents[secondCanvasId]), [])

    selectContentCanvasDocument(91, firstCanvasId)
    assert.equal(readContentCanvasDocumentsState(91)?.activeCanvasId, firstCanvasId)
  } finally {
    restoreWindow()
  }
})

test('creative canvas graph renders only current document refs while sharing domain node data', () => {
  const firstGraph = graphFixture({
    nodes: [
      nodeFixture({ id: 'scene_moment:ending', entityKey: 'ending', kind: 'scene_moment', title: 'Ending draft', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'scene_moment:next', entityKey: 'next', kind: 'scene_moment', title: 'Next beat', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'asset:hero', entityKey: 'hero', kind: 'asset', title: 'Hero ref', position: { x: 720, y: 0 } }),
    ],
    edges: [
      { id: 'ending-next', source: 'scene_moment:ending', target: 'scene_moment:next', kind: 'sequence' },
      { id: 'ending-asset', source: 'asset:hero', target: 'scene_moment:ending', kind: 'reference', relation: 'content_unit_asset' },
    ],
  })
  const secondGraph = {
    ...firstGraph,
    nodes: firstGraph.nodes.map((node) => (
      node.id === 'scene_moment:ending' ? { ...node, title: 'Ending locked' } : node
    )),
  }

  const scoped = buildCreativeCanvasGraph(firstGraph, { nodeIds: ['scene_moment:ending', 'asset:hero'] })
  const synced = buildCreativeCanvasGraph(secondGraph, { nodeIds: ['scene_moment:ending', 'asset:hero'] })

  assert.deepEqual(scoped.nodes.map((node) => node.id), ['scene_moment:ending', 'asset:hero'])
  assert.equal(scoped.nodes.some((node) => node.id === 'scene_moment:next'), false)
  assert.deepEqual(scoped.edges.map((edge) => [edge.source, edge.target]), [['scene_moment:ending', 'asset:hero']])
  assert.equal(synced.nodes.find((node) => node.id === 'scene_moment:ending')?.source.title, 'Ending locked')
})

test('creative canvas document node insert pulls referenced cards into the same canvas', () => {
  const scene = nodeFixture({
    id: 'scene_moment:ending',
    entityKey: 'ending',
    kind: 'scene_moment',
    title: 'Ending draft',
    position: { x: 0, y: 0 },
    generationTask: generationTaskFixture({
      id: 'cu_ending',
      nodeId: 'content_unit:cu_ending',
      outputKind: 'video',
      prompt: '尾声镜头参考 {{resource::42}}',
    }),
  })
  const contentUnit = nodeFixture({
    id: 'content_unit:cu_ending',
    entityKey: 'cu_ending',
    kind: 'content_unit',
    title: 'Ending unit',
    position: { x: 120, y: 0 },
    record: { output_kind: 'video' },
  })
  const asset = nodeFixture({
    id: 'asset:hero',
    entityKey: 'hero',
    kind: 'asset',
    title: 'Hero ref',
    position: { x: 720, y: 0 },
    generationTask: generationTaskFixture({
      id: 'cu_hero',
      nodeId: 'content_unit:cu_hero',
      prompt: '角色图参考 {{resource:43}}',
    }),
  })
  const resource42 = nodeFixture({ id: 'resource:42', entityKey: '42', kind: 'resource', title: 'Tail frame', position: { x: 900, y: -120 } })
  const resource43 = nodeFixture({ id: 'resource:43', entityKey: '43', kind: 'resource', title: 'Hero still', position: { x: 900, y: 120 } })
  const production = nodeFixture({ id: 'production:pilot', entityKey: 'pilot', kind: 'production', title: 'Pilot', position: { x: -240, y: 0 } })
  const graph = graphFixture({
    nodes: [scene, contentUnit, asset, resource42, resource43, production],
    edges: [
      { id: 'scene-unit', source: scene.id, target: contentUnit.id, kind: 'reference', relation: 'content_unit_scene' },
      { id: 'unit-asset', source: contentUnit.id, target: asset.id, kind: 'reference', relation: 'content_unit_asset' },
      { id: 'resource-unit', source: resource42.id, target: contentUnit.id, kind: 'reference', relation: 'content_unit_resource' },
      { id: 'production-scene', source: production.id, target: scene.id, kind: 'hierarchy' },
    ],
  })

  const inputs = contentCanvasDocumentNodeInputsWithReferences({
    graph,
    nodeId: scene.id,
    position: { x: 320, y: 180 },
  })

  assert.deepEqual(inputs.map((input) => input.nodeId), [
    'scene_moment:ending',
    'asset:hero',
    'resource:42',
    'resource:43',
  ])
  assert.equal(inputs.some((input) => input.nodeId === 'content_unit:cu_ending'), false)
  assert.equal(inputs.some((input) => input.nodeId === 'production:pilot'), false)
  assert.equal(inputs[1]?.position?.x, -70)
})

test('content canvas presentation groups persist locally and merge into graph view only', () => {
  const restoreWindow = installLocalStorageFixture()
  try {
    const state = createContentCanvasPresentationGroupNode(81, {
      position: { x: 320, y: 180 },
      title: 'Act 1 board',
      summary: 'Local grouping note',
    }, { mode: 'dependency' })
    const groupId = Object.keys(state?.presentationNodes ?? {})[0]
    const graph = applyContentCanvasPresentationNodes(graphFixture(), state?.presentationNodes)
    const groupNode = graph.nodes.find((node) => node.id === groupId)

    assert.ok(groupId)
    assert.deepEqual(state?.nodeLayouts?.[groupId], {
      x: 320,
      y: 180,
      width: 260,
      height: 118,
      manual: true,
      source: 'manual',
      updatedAt: state?.presentationNodes?.[groupId]?.createdAt,
    })
    assert.deepEqual(groupNode && {
      id: groupNode.id,
      kind: groupNode.kind,
      title: groupNode.title,
      summary: groupNode.summary,
      status: groupNode.status,
      sourcePath: groupNode.sourcePath,
      presentationOnly: groupNode.record.presentationOnly,
    }, {
      id: groupId,
      kind: 'group',
      title: 'Act 1 board',
      summary: 'Local grouping note',
      status: 'neutral',
      sourcePath: '',
      presentationOnly: true,
    })
    assert.deepEqual(graph.edges, graphFixture().edges)
  } finally {
    restoreWindow()
  }
})

test('content canvas presentation group edits remain local to view state', () => {
  const restoreWindow = installLocalStorageFixture()
  try {
    const created = createContentCanvasPresentationGroupNode(82, {
      position: { x: 120, y: 160 },
    }, { mode: 'structure' })
    const groupId = Object.keys(created?.presentationNodes ?? {})[0]
    const updated = updateContentCanvasPresentationNode(82, groupId, {
      title: 'Reviewed beat cluster',
      summary: 'Manual grouping for review pass',
    }, { mode: 'structure' })
    const graph = applyContentCanvasPresentationNodes(graphFixture(), updated?.presentationNodes)
    const groupNode = graph.nodes.find((node) => node.id === groupId)

    assert.equal(updated?.presentationNodes?.[groupId]?.title, 'Reviewed beat cluster')
    assert.equal(updated?.presentationNodes?.[groupId]?.summary, 'Manual grouping for review pass')
    assert.equal(groupNode?.title, 'Reviewed beat cluster')
    assert.equal(groupNode?.summary, 'Manual grouping for review pass')
    assert.equal(groupNode?.record.presentationOnly, true)
  } finally {
    restoreWindow()
  }
})

test('content canvas view state persists hidden kind preferences by scope', () => {
  const restoreWindow = installLocalStorageFixture()
  try {
    toggleContentCanvasHiddenKindPreference(83, 'group', { mode: 'dependency' })
    toggleContentCanvasHiddenKindPreference(83, 'asset', { mode: 'structure' })
    assert.deepEqual(readContentCanvasViewState(83, { mode: 'dependency' })?.preferences?.hiddenKinds, ['group'])
    assert.deepEqual(readContentCanvasViewState(83, { mode: 'structure' })?.preferences?.hiddenKinds, ['asset'])

    toggleContentCanvasHiddenKindPreference(83, 'group', { mode: 'dependency' })
    assert.deepEqual(readContentCanvasViewState(83, { mode: 'dependency' })?.preferences?.hiddenKinds, [])
  } finally {
    restoreWindow()
  }
})

test('content canvas view state persists edge filter preferences by scope', () => {
  const restoreWindow = installLocalStorageFixture()
  try {
    toggleContentCanvasEdgeFilterPreference(84, 'content_unit_candidate', { mode: 'dependency' })
    toggleContentCanvasEdgeFilterPreference(84, 'candidate_resource', { mode: 'issues' })
    assert.deepEqual(readContentCanvasViewState(84, { mode: 'dependency' })?.preferences?.edgeFilters, ['content_unit_candidate'])
    assert.deepEqual(readContentCanvasViewState(84, { mode: 'issues' })?.preferences?.edgeFilters, ['candidate_resource'])

    toggleContentCanvasEdgeFilterPreference(84, 'content_unit_candidate', { mode: 'dependency' })
    assert.deepEqual(readContentCanvasViewState(84, { mode: 'dependency' })?.preferences?.edgeFilters, [])
  } finally {
    restoreWindow()
  }
})

test('content canvas view state can hide and restore edge layers in batches', () => {
  const restoreWindow = installLocalStorageFixture()
  try {
    setContentCanvasEdgeFilterPreferences(84, ['content_unit_asset', 'content_unit_keyframe', 'content_unit_storyboard'], true, { mode: 'dependency' })
    assert.deepEqual(readContentCanvasViewState(84, { mode: 'dependency' })?.preferences?.edgeFilters, [
      'content_unit_asset',
      'content_unit_keyframe',
      'content_unit_storyboard',
    ])

    setContentCanvasEdgeFilterPreferences(84, ['content_unit_keyframe', 'content_unit_storyboard'], false, { mode: 'dependency' })
    assert.deepEqual(readContentCanvasViewState(84, { mode: 'dependency' })?.preferences?.edgeFilters, ['content_unit_asset'])
  } finally {
    restoreWindow()
  }
})

test('content canvas local arrange moves only unpinned target nodes', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Asset 1', position: { x: 800, y: 400 } }),
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Unit 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'candidate:1', entityKey: '1', kind: 'candidate', title: 'Candidate 1', position: { x: 100, y: 100 } }),
      nodeFixture({ id: 'expression_unit:outside', entityKey: 'outside', kind: 'expression_unit', title: 'Outside shot expression', position: { x: 30, y: 40 }, record: { kind: 'shot' } }),
    ],
  })
  const state = createContentCanvasWorkspaceSnapshotState(graph)
  const layouts = {
    ...state.layoutByNodeId,
    'asset:1': { ...state.layoutByNodeId['asset:1'], x: 800, y: 400, pinned: true },
    'content_unit:1': { ...state.layoutByNodeId['content_unit:1'], x: 20, y: 20 },
    'candidate:1': { ...state.layoutByNodeId['candidate:1'], x: 30, y: 30 },
  }

  const arranged = arrangeContentCanvasNodeLayouts(
    graph,
    layouts,
    ['asset:1', 'content_unit:1', 'candidate:1'],
    { origin: { x: 10, y: 15 }, updatedAt: '2026-06-15T00:00:00.000Z' },
  )
  const patches = contentCanvasLayoutPatchesBetween(layouts, arranged, ['asset:1', 'content_unit:1', 'candidate:1', 'expression_unit:outside'])

  assert.deepEqual(arranged['asset:1'], layouts['asset:1'])
  assert.equal(arranged['content_unit:1'].x, 1810)
  assert.equal(arranged['content_unit:1'].y, 15)
  assert.equal(arranged['candidate:1'].x, 2170)
  assert.equal(arranged['candidate:1'].y, 275)
  assert.equal(arranged['expression_unit:outside'], layouts['expression_unit:outside'])
  assert.deepEqual(Object.keys(patches), ['content_unit:1', 'candidate:1'])
})

test('content canvas viewport culling returns visible nodes and necessary edges only', () => {
  const state = createContentCanvasWorkspaceSnapshotState(graphFixture({
    nodes: [
      nodeFixture({ id: 'expression_unit:1', entityKey: '1', kind: 'expression_unit', title: 'Shot 1', position: { x: 0, y: 0 }, record: { kind: 'shot' } }),
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Asset 1', position: { x: 900, y: 0 } }),
      nodeFixture({ id: 'candidate:1', entityKey: '1', kind: 'candidate', title: 'Candidate 1', position: { x: 2600, y: 0 } }),
    ],
    edges: [
      { id: 'expression-asset', source: 'expression_unit:1', target: 'asset:1', kind: 'reference', relation: 'content_unit_asset' },
      { id: 'asset-candidate', source: 'asset:1', target: 'candidate:1', kind: 'reference', relation: 'content_unit_candidate' },
    ],
  }))

  const visible = contentCanvasVisibleGraphIds({
    nodeIds: state.nodeIds,
    edges: Object.values(state.edgesById),
    layoutsByNodeId: state.layoutByNodeId,
    viewport: { x: 0, y: 0, zoom: 1 },
    viewportSize: { width: 500, height: 300 },
    bufferRatio: 0,
  })

  assert.deepEqual(visible.visibleNodeIds, ['expression_unit:1'])
  assert.deepEqual(visible.visibleEdgeIds, ['expression-asset'])
})

test('content canvas navigator derives hierarchy depth and work item counts', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'production:1', entityKey: '1', kind: 'production', title: 'Production 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'segment:1', entityKey: '1', kind: 'segment', title: 'Segment 1', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene 1', position: { x: 720, y: 0 } }),
      nodeFixture({ id: 'expression_unit:1', entityKey: '1', kind: 'expression_unit', title: 'Shot 1', position: { x: 1080, y: 0 }, record: { kind: 'shot' } }),
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Unit 1', position: { x: 1440, y: 0 } }),
      nodeFixture({ id: 'work_item:1', entityKey: '1', kind: 'work_item', title: 'Work 1', position: { x: 1800, y: 0 } }),
    ],
    edges: [
      { id: 'production-segment', source: 'production:1', target: 'segment:1', kind: 'hierarchy' },
      { id: 'segment-scene', source: 'segment:1', target: 'scene_moment:1', kind: 'hierarchy' },
      { id: 'scene-expression', source: 'scene_moment:1', target: 'expression_unit:1', kind: 'hierarchy' },
      { id: 'work-expression', source: 'work_item:1', target: 'expression_unit:1', kind: 'reference', relation: 'work_item_target' },
    ],
  })

  const items = buildContentCanvasNavigatorItems(graph)

  assert.deepEqual(items.map((item) => [item.nodeId, item.depth, item.childCount, item.workItemCount]), [
    ['production:1', 0, 1, 0],
    ['segment:1', 1, 1, 0],
    ['scene_moment:1', 2, 0, 0],
  ])
})

test('content canvas right pane pointer creates on click and pans after threshold', () => {
  const start = startContentCanvasRightPanePointer({
    button: 2,
    screenPoint: { x: 100, y: 100 },
    graphPoint: { x: 40, y: 50 },
    viewport: { x: 0, y: 0, zoom: 1 },
  })

  assert.deepEqual(endContentCanvasRightPanePointer({
    state: start,
    screenPoint: { x: 103, y: 102 },
  }), {
    type: 'create',
    graphPosition: { x: 40, y: 50 },
  })

  const panning = updateContentCanvasRightPanePointer({
    state: start,
    screenPoint: { x: 120, y: 112 },
  })

  assert.equal(panning.type, 'panning')
  assert.deepEqual(endContentCanvasRightPanePointer({
    state: panning,
    screenPoint: { x: 130, y: 140 },
  }), {
    type: 'pan',
    viewport: { x: 30, y: 40, zoom: 1 },
  })
})

test('content canvas relation ledger explains dependency direction from business semantics', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Shot video', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Phone screen', position: { x: 900, y: 0 } }),
      nodeFixture({ id: 'candidate:1', entityKey: '1', kind: 'candidate', title: 'Candidate A', position: { x: 1200, y: 0 } }),
    ],
    edges: [
      { id: 'cu-asset', source: 'content_unit:1', target: 'asset:1', kind: 'reference', relation: 'content_unit_asset', label: '素材' },
      { id: 'cu-candidate', source: 'content_unit:1', target: 'candidate:1', kind: 'reference', relation: 'content_unit_candidate', label: '候选' },
    ],
  })

  const contentUnitLedger = buildContentCanvasRelationLedger(graph, graph.nodes[0])
  const assetLedger = buildContentCanvasRelationLedger(graph, graph.nodes[1])

  assert.deepEqual(contentUnitLedger.upstream.map((item) => [item.nodeId, item.relation]), [
    ['asset:1', '素材输入'],
  ])
  assert.deepEqual(contentUnitLedger.downstream.map((item) => [item.nodeId, item.relation]), [
    ['candidate:1', '生成候选'],
  ])
  assert.deepEqual(assetLedger.downstream.map((item) => [item.nodeId, item.relation]), [
    ['content_unit:1', '依赖此素材'],
  ])
})

test('content canvas relation ledger exposes node-specific current product facts', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({
        id: 'expression_unit:1',
        entityKey: '1',
        kind: 'expression_unit',
        title: 'Rain shot expression',
        position: { x: 0, y: 0 },
        summary: 'Hero answers the phone in rain.',
        record: {
          kind: 'shot',
          duration_sec: 3.5,
          camera: 'slow push-in',
          expression_ref: 'exp_1',
          content_unit_status: 'needs_candidate',
        },
      }),
      nodeFixture({
        id: 'content_unit:1',
        entityKey: '1',
        kind: 'content_unit',
        title: 'Shot render',
        position: { x: 360, y: 0 },
        record: {
          output_kind: 'video',
          content_unit_type: 'shot_render',
          edit_prompt: { text: 'Render rain phone shot.' },
        },
        candidates: [{
          id: 'cand_1',
          title: 'Candidate A',
          source: 'model-a',
          selected: true,
          notes: 'Selected render',
        }],
      }),
      nodeFixture({
        id: 'storyboard:1',
        entityKey: '1',
        kind: 'storyboard',
        title: 'Board main',
        position: { x: 720, y: 0 },
        record: {
          selection_state: 'selected',
          selected_candidate_id: 'board_cand',
          input_hash: 'sha256:board',
          slot: 'main',
        },
      }),
    ],
    edges: [],
  })

  const shotLedger = buildContentCanvasRelationLedger(graph, graph.nodes[0])
  const contentUnitLedger = buildContentCanvasRelationLedger(graph, graph.nodes[1])
  const storyboardLedger = buildContentCanvasRelationLedger(graph, graph.nodes[2])

  assert.deepEqual(shotLedger.current.map((fact) => [fact.label, fact.value]), [
    ['类型', '表达单元'],
    ['状态', '推进中'],
    ['来源', 'expression_unit/1.json'],
    ['表达类型', 'shot'],
    ['表达描述', 'Hero answers the phone in rain.'],
    ['时长秒', '3.5'],
    ['Camera', 'slow push-in'],
    ['表达', 'exp_1'],
    ['制作状态', 'needs_candidate'],
  ])
  assert.deepEqual(contentUnitLedger.current.map((fact) => [fact.label, fact.value]), [
    ['类型', '创作片段'],
    ['状态', '推进中'],
    ['来源', 'content_unit/1.json'],
    ['产物类型', 'video'],
    ['创作片段类型', 'shot_render'],
    ['Edit prompt', 'Render rain phone shot.'],
    ['候选数', '1'],
    ['已选候选', 'Candidate A'],
    ['候选', '1 个'],
  ])
  assert.deepEqual(storyboardLedger.current.map((fact) => [fact.label, fact.value]), [
    ['类型', '分镜图'],
    ['状态', '推进中'],
    ['来源', 'storyboard/1.json'],
    ['选择状态', 'selected'],
    ['已选候选', 'board_cand'],
    ['Input hash', 'sha256:board'],
    ['槽位', 'main'],
  ])
})

test('content canvas edge insight exposes evidence and navigation endpoints', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Shot video', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Phone screen', position: { x: 900, y: 0 } }),
    ],
    edges: [
      { id: 'cu-asset', source: 'content_unit:1', target: 'asset:1', kind: 'reference', relation: 'content_unit_asset', label: '素材' },
    ],
  })

  const insight = buildContentCanvasEdgeInsight(graph, 'cu-asset')

  assert.deepEqual(insight && {
    relation: insight.relation,
    sourceNodeId: insight.sourceNodeId,
    targetNodeId: insight.targetNodeId,
    evidence: insight.evidence,
    action: insight.action,
    primaryActionNodeId: insight.primaryActionNodeId,
    primaryActionLabel: insight.primaryActionLabel,
  }, {
    relation: '素材输入',
    sourceNodeId: 'content_unit:1',
    targetNodeId: 'asset:1',
    evidence: 'content_unit_asset · 素材 · asset/1.json',
    action: '定位素材输入',
    primaryActionNodeId: 'content_unit:1',
    primaryActionLabel: '定位Shot video',
  })
})

test('content canvas view plan keeps candidates embedded when a content unit is selected', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Shot video', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'candidate:1', entityKey: '1', kind: 'candidate', title: 'Candidate A', position: { x: 900, y: 0 } }),
    ],
    edges: [
      { id: 'cu-candidate', source: 'content_unit:1', target: 'candidate:1', kind: 'reference', relation: 'content_unit_candidate', label: '候选' },
    ],
  })

  const unfocused = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: null,
    impactByNodeId: {},
  })
  const traced = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: 'content_unit:1',
    impactByNodeId: {},
  })

  assert.deepEqual(unfocused.graph.nodes.map((node) => node.id), ['content_unit:1'])
  assert.deepEqual(unfocused.graph.edges, [])
  assert.deepEqual(unfocused.collapsedSummariesByNodeId['content_unit:1'], [
    { kind: 'candidate', count: 1, label: '候选' },
  ])
  assert.deepEqual(traced.graph.nodes.map((node) => node.id), ['content_unit:1'])
  assert.deepEqual(traced.graph.edges, [])
  assert.deepEqual(traced.collapsedSummariesByNodeId['content_unit:1'], [
    { kind: 'candidate', count: 1, label: '候选' },
  ])
})

test('content canvas candidate trace keeps selection folded into candidate state', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Shot video', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'candidate:1', entityKey: '1', kind: 'candidate', title: 'Candidate A', position: { x: 900, y: 0 } }),
      nodeFixture({ id: 'selection:1', entityKey: '1', kind: 'selection', title: 'Selected A', position: { x: 900, y: 180 } }),
      nodeFixture({ id: 'resource:1', entityKey: '1', kind: 'resource', title: 'Resource A', position: { x: 1260, y: 0 } }),
    ],
    edges: [
      { id: 'cu-candidate', source: 'content_unit:1', target: 'candidate:1', kind: 'reference', relation: 'content_unit_candidate', label: '候选' },
      { id: 'selection-candidate', source: 'selection:1', target: 'candidate:1', kind: 'reference', relation: 'selection_candidate', label: '当前采纳' },
      { id: 'candidate-resource', source: 'candidate:1', target: 'resource:1', kind: 'reference', relation: 'candidate_resource', label: '资源' },
    ],
  })

  const plan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: 'candidate:1',
    impactByNodeId: {},
  })

  assert.deepEqual(plan.graph.nodes.map((node) => node.id), ['content_unit:1', 'candidate:1', 'resource:1'])
  assert.deepEqual(plan.graph.edges.map((edge) => edge.id), ['cu-candidate', 'candidate-resource'])
  assert.equal(plan.hiddenNodeIds.has('selection:1'), true)
  assert.equal(plan.hiddenEdgeIds.has('selection-candidate'), true)
})

test('content canvas view plan limits large dependency graphs to selected trace', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Selected unit', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Visible asset', position: { x: 900, y: 0 } }),
      nodeFixture({ id: 'expression_unit:unrelated', entityKey: 'unrelated', kind: 'expression_unit', title: 'Unrelated shot expression', position: { x: 2600, y: 0 }, record: { kind: 'shot' } }),
    ],
    edges: [
      { id: 'cu-asset', source: 'content_unit:1', target: 'asset:1', kind: 'reference', relation: 'content_unit_asset' },
    ],
  })

  const plan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: 'content_unit:1',
    impactByNodeId: {},
    largeGraphNodeThreshold: 2,
  })

  assert.equal(plan.density, 'trace')
  assert.deepEqual(plan.graph.nodes.map((node) => node.id), ['content_unit:1', 'asset:1'])
  assert.equal(plan.hiddenNodeIds.has('expression_unit:unrelated'), true)
})

test('content canvas view plan clusters very large unselected dependency maps to semantic backbone', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'expression_unit:1', entityKey: '1', kind: 'expression_unit', title: 'Shot 1', position: { x: 360, y: 0 }, record: { kind: 'shot' } }),
      nodeFixture({ id: 'setting:weather', entityKey: 'weather', kind: 'setting', title: 'Weather', position: { x: -360, y: 0 } }),
      nodeFixture({ id: 'asset:phone', entityKey: 'phone', kind: 'asset', title: 'Phone', position: { x: -720, y: 0 } }),
      nodeFixture({ id: 'content_unit:render', entityKey: 'render', kind: 'content_unit', title: 'Render unit', position: { x: 720, y: 0 } }),
      nodeFixture({ id: 'candidate:render', entityKey: 'render', kind: 'candidate', title: 'Candidate', position: { x: 1080, y: 0 } }),
    ],
    edges: [
      { id: 'scene-expression', source: 'scene_moment:1', target: 'expression_unit:1', kind: 'hierarchy' },
      { id: 'unit-candidate', source: 'content_unit:render', target: 'candidate:render', kind: 'reference', relation: 'content_unit_candidate' },
    ],
  })

  const plan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: null,
    impactByNodeId: {},
    largeGraphNodeThreshold: 2,
    clusterGraphNodeThreshold: 4,
    focusedGraphNodeThreshold: 99,
  })

  assert.equal(plan.lodTier, 'clustered')
  assert.deepEqual(plan.graph.nodes.map((node) => node.id), ['scene_moment:1', 'setting:weather', 'asset:phone'])
  assert.equal(plan.hiddenNodeIds.has('content_unit:render'), true)
  assert.equal(plan.hiddenNodeIds.has('candidate:render'), true)
})

test('content canvas view plan focuses extreme unselected maps on issue-bearing nodes', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'asset:phone', entityKey: 'phone', kind: 'asset', title: 'Phone', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'storyboard:1', entityKey: '1', kind: 'storyboard', title: 'Storyboard', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'work_item:1', entityKey: '1', kind: 'work_item', title: 'Review stale board', position: { x: 720, y: 0 } }),
      nodeFixture({ id: 'actor:agent', entityKey: 'agent', kind: 'actor', title: 'Agent', position: { x: 1080, y: 0 } }),
      nodeFixture({ id: 'content_unit:noise', entityKey: 'noise', kind: 'content_unit', title: 'Noise', position: { x: 1440, y: 0 } }),
    ],
    edges: [
      { id: 'asset-storyboard', source: 'asset:phone', target: 'storyboard:1', kind: 'reference', relation: 'asset_downstream', state: 'stale' },
      { id: 'work-target', source: 'work_item:1', target: 'storyboard:1', kind: 'reference', relation: 'work_item_target' },
      { id: 'actor-work', source: 'actor:agent', target: 'work_item:1', kind: 'reference', relation: 'actor_work_item' },
    ],
  })

  const plan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: null,
    impactByNodeId: {},
    largeGraphNodeThreshold: 2,
    clusterGraphNodeThreshold: 3,
    focusedGraphNodeThreshold: 5,
  })

  assert.equal(plan.lodTier, 'focused')
  assert.deepEqual(plan.graph.nodes.map((node) => node.id), ['asset:phone', 'storyboard:1', 'work_item:1', 'actor:agent'])
  assert.deepEqual(plan.graph.edges.map((edge) => edge.id), ['asset-storyboard', 'work-target', 'actor-work'])
  assert.equal(plan.hiddenNodeIds.has('content_unit:noise'), true)
})

test('content canvas structure view keeps production units out of scene moment structure', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene 1', position: { x: -360, y: 0 } }),
      nodeFixture({ id: 'expression_unit:1', entityKey: '1', kind: 'expression_unit', title: 'Shot 1', position: { x: 0, y: 0 }, record: { kind: 'shot' } }),
      nodeFixture({ id: 'keyframe:1', entityKey: '1', kind: 'keyframe', title: 'Keyframe 1', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'storyboard:1', entityKey: '1', kind: 'storyboard', title: 'Storyboard 1', position: { x: 360, y: 180 } }),
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Unit 1', position: { x: 720, y: 0 } }),
    ],
    edges: [
      { id: 'scene-expression', source: 'scene_moment:1', target: 'expression_unit:1', kind: 'hierarchy' },
      { id: 'expression-keyframe', source: 'expression_unit:1', target: 'keyframe:1', kind: 'hierarchy' },
      { id: 'expression-storyboard', source: 'expression_unit:1', target: 'storyboard:1', kind: 'hierarchy' },
      { id: 'expression-unit', source: 'expression_unit:1', target: 'content_unit:1', kind: 'reference', relation: 'expression_unit_content_unit' },
    ],
  })

  const folded = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'structure',
    selectedNodeId: null,
    impactByNodeId: {},
  })
  const expanded = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'structure',
    selectedNodeId: 'expression_unit:1',
    impactByNodeId: {},
  })

  assert.deepEqual(folded.graph.nodes.map((node) => node.id), ['scene_moment:1'])
  assert.deepEqual(folded.collapsedSummariesByNodeId['scene_moment:1'], [
    { kind: 'keyframe', count: 1, label: '关键帧' },
    { kind: 'storyboard', count: 1, label: '分镜' },
    { kind: 'expression_unit', count: 1, label: '表达' },
  ])
  assert.deepEqual(expanded.graph.nodes.map((node) => node.id), ['scene_moment:1', 'expression_unit:1', 'keyframe:1', 'storyboard:1'])
})

test('content canvas structure view keeps shot expression constraints folded under scene moment', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene 1', position: { x: -360, y: 0 } }),
      nodeFixture({ id: 'expression_unit:1', entityKey: '1', kind: 'expression_unit', title: 'Shot Expression 1', position: { x: 360, y: 0 }, record: { kind: 'shot' } }),
      nodeFixture({ id: 'audio_cue:1', entityKey: '1', kind: 'audio_cue', title: 'Audio 1', position: { x: 360, y: 180 } }),
    ],
    edges: [
      { id: 'scene-expression', source: 'scene_moment:1', target: 'expression_unit:1', kind: 'hierarchy' },
    ],
  })

  const plan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'structure',
    selectedNodeId: null,
    impactByNodeId: {},
  })

  assert.deepEqual(plan.graph.nodes.map((node) => node.id), ['scene_moment:1'])
  assert.deepEqual(plan.collapsedSummariesByNodeId['scene_moment:1'], [
    { kind: 'expression_unit', count: 1, label: '表达' },
  ])
})

test('content canvas collapsed layout hides descendants but keeps selected descendant reachable', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene 1', position: { x: -360, y: 0 } }),
      nodeFixture({ id: 'expression_unit:1', entityKey: '1', kind: 'expression_unit', title: 'Shot 1', position: { x: 0, y: 0 }, record: { kind: 'shot' } }),
      nodeFixture({ id: 'keyframe:1', entityKey: '1', kind: 'keyframe', title: 'Keyframe 1', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'storyboard:1', entityKey: '1', kind: 'storyboard', title: 'Storyboard 1', position: { x: 360, y: 180 } }),
    ],
    edges: [
      { id: 'scene-expression', source: 'scene_moment:1', target: 'expression_unit:1', kind: 'hierarchy' },
      { id: 'expression-keyframe', source: 'expression_unit:1', target: 'keyframe:1', kind: 'hierarchy' },
      { id: 'expression-storyboard', source: 'expression_unit:1', target: 'storyboard:1', kind: 'hierarchy' },
    ],
  })

  const collapsed = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'structure',
    selectedNodeId: null,
    impactByNodeId: {},
    layoutByNodeId: {
      'scene_moment:1': { collapsed: true },
    },
  })
  const selectedDescendant = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'structure',
    selectedNodeId: 'keyframe:1',
    impactByNodeId: {},
    layoutByNodeId: {
      'scene_moment:1': { collapsed: true },
    },
  })

  assert.deepEqual(collapsed.graph.nodes.map((node) => node.id), ['scene_moment:1'])
  assert.deepEqual(collapsed.collapsedSummariesByNodeId['scene_moment:1'], [
    { kind: 'keyframe', count: 1, label: '关键帧' },
    { kind: 'storyboard', count: 1, label: '分镜' },
    { kind: 'expression_unit', count: 1, label: '表达' },
  ])
  assert.deepEqual(selectedDescendant.graph.nodes.map((node) => node.id), ['scene_moment:1', 'keyframe:1'])
})

test('content canvas view plan budgets visible edges and summarizes hidden rendered edges', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Unit 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Asset 1', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'asset:2', entityKey: '2', kind: 'asset', title: 'Asset 2', position: { x: 360, y: 180 } }),
      nodeFixture({ id: 'asset:3', entityKey: '3', kind: 'asset', title: 'Asset 3', position: { x: 360, y: 360 } }),
    ],
    edges: [
      { id: 'selected-asset', source: 'content_unit:1', target: 'asset:1', kind: 'reference', relation: 'content_unit_asset' },
      { id: 'hidden-asset-2', source: 'content_unit:1', target: 'asset:2', kind: 'reference', relation: 'content_unit_asset' },
      { id: 'hidden-asset-3', source: 'content_unit:1', target: 'asset:3', kind: 'reference', relation: 'content_unit_asset' },
    ],
  })

  const plan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: 'asset:1',
    impactByNodeId: {},
    edgeRenderLimit: 1,
  })

  assert.deepEqual(plan.graph.edges.map((edge) => edge.id), ['selected-asset'])
  assert.deepEqual(plan.backgroundEdges.map((edge) => edge.id), ['hidden-asset-2', 'hidden-asset-3'])
  assert.deepEqual([...plan.hiddenEdgeIds].sort(), ['hidden-asset-2', 'hidden-asset-3'])
  assert.deepEqual(plan.edgeSummariesByNodeId['content_unit:1'], [
    { relation: 'content_unit_asset', count: 2, label: '素材边' },
  ])
})

test('content canvas view plan applies persistent hidden kind preferences', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'group:local', entityKey: 'group:local', kind: 'group', title: 'Local group', position: { x: 360, y: 0 } }),
    ],
    edges: [],
  })

  const plan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'structure',
    selectedNodeId: null,
    impactByNodeId: {},
    hiddenKinds: ['group'],
  })

  assert.deepEqual(plan.graph.nodes.map((node) => node.id), ['scene_moment:1'])
  assert.equal(plan.hiddenNodeIds.has('group:local'), true)
})

test('content canvas view plan applies persistent edge relation filters', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Unit 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Asset 1', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'candidate:1', entityKey: '1', kind: 'candidate', title: 'Candidate 1', position: { x: 720, y: 0 } }),
    ],
    edges: [
      { id: 'unit-asset', source: 'content_unit:1', target: 'asset:1', kind: 'reference', relation: 'content_unit_asset' },
      { id: 'unit-candidate', source: 'content_unit:1', target: 'candidate:1', kind: 'reference', relation: 'content_unit_candidate' },
    ],
  })

  const plan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: 'content_unit:1',
    impactByNodeId: {},
    edgeFilters: ['content_unit_candidate'],
  })

  assert.deepEqual(plan.graph.edges.map((edge) => edge.id), ['unit-asset'])
  assert.equal(plan.hiddenEdgeIds.has('unit-candidate'), true)
  assert.deepEqual(plan.edgeSummariesByNodeId['content_unit:1'], [
    { relation: 'content_unit_candidate', count: 1, label: '候选边' },
  ])
})

test('content canvas graph turns production work plan items into issue nodes', () => {
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    storyboards: [],
    expressionUnits: [],
    contentUnits: [
      {
        id: 'cu_1',
        entityKind: 'content_unit',
        path: 'content_units/cu_1/content_unit.json',
        index: 0,
        record: {
          id: 'cu_1',
          title: 'Shot render',
          edit_prompt: 'Render the shot',
        },
      },
    ],
    keyframes: [],
    assets: [],
    settings: [],
    contentUnitCandidates: {},
    productionWorkPlan: {
      summary: {
        open: 1,
        blocking: 1,
        humanRecommended: 0,
        agentRecommended: 1,
        readyToGenerate: 0,
        staleSelections: 0,
      },
      items: [
        {
          id: 'wi_1',
          kind: 'missing_candidate',
          status: 'blocked',
          severity: 'blocking',
          priority: 10,
          reason: 'Missing candidate for shot render',
          targetKind: 'content_unit',
          targetId: 'cu_1',
          targetPath: 'content_units/cu_1/content_unit.json',
          recommendedActor: 'agent',
          actionLabels: ['生成候选'],
        },
      ],
    },
  })

  const issuePlan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'issues',
    selectedNodeId: null,
    impactByNodeId: {},
  })

  assert.deepEqual(graph.nodes.map((node) => [node.id, node.kind]), [
    ['content_unit:cu_1', 'content_unit'],
    ['actor:agent', 'actor'],
    ['work_item:wi_1', 'work_item'],
  ])
  assert.deepEqual(graph.edges.map((edge) => [edge.id, edge.relation]), [
    ['actor:agent->work_item:wi_1:actor-work-item', 'actor_work_item'],
    ['work_item:wi_1->content_unit:cu_1:work-item-target', 'work_item_target'],
  ])
  assert.deepEqual(graph.edges.map((edge) => [edge.relation, edge.type]), [
    ['actor_work_item', 'work_item_targets'],
    ['work_item_target', 'work_item_targets'],
  ])
  assert.equal(graph.indexes?.nodeById['content_unit:cu_1']?.title, 'Shot render')
  assert.equal(graph.indexes?.edgeById['work_item:wi_1->content_unit:cu_1:work-item-target']?.relation, 'work_item_target')
  assert.deepEqual(graph.indexes?.upstreamEdgeIdsByNodeId['content_unit:cu_1'], ['work_item:wi_1->content_unit:cu_1:work-item-target'])
  assert.deepEqual(graph.indexes?.downstreamEdgeIdsByNodeId['actor:agent'], ['actor:agent->work_item:wi_1:actor-work-item'])
  assert.deepEqual(graph.indexes?.workItemIdsByTargetId['content_unit:cu_1'], ['work_item:wi_1'])
  assert.deepEqual(graph.summary, {
    nodeCount: 3,
    edgeCount: 2,
    nodeCountByKind: {
      content_unit: 1,
      actor: 1,
      work_item: 1,
    },
    productionCount: 0,
    staleCount: 0,
    needsCandidateCount: 1,
    missingCount: 1,
    openWorkItemCount: 1,
    actorWorkItemCount: {
      human: 0,
      agent: 1,
      workflow: 0,
    },
  })
  assert.deepEqual(issuePlan.graph.nodes.map((node) => node.id), ['content_unit:cu_1', 'actor:agent', 'work_item:wi_1'])
  assert.deepEqual(issuePlan.graph.edges.map((edge) => edge.id), [
    'actor:agent->work_item:wi_1:actor-work-item',
    'work_item:wi_1->content_unit:cu_1:work-item-target',
  ])
})

test('content canvas dependency view keeps work items as issue overlay by default', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Render unit', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'actor:agent', entityKey: 'agent', kind: 'actor', title: 'Agent', position: { x: 360, y: 0 } }),
      nodeFixture({
        id: 'work_item:1',
        entityKey: '1',
        kind: 'work_item',
        title: 'Generate candidate',
        position: { x: 720, y: 0 },
        status: 'missing',
        record: { kind: 'missing_candidate', recommendedActor: 'agent' },
      }),
    ],
    edges: [
      { id: 'actor-work', source: 'actor:agent', target: 'work_item:1', kind: 'reference', relation: 'actor_work_item' },
      { id: 'work-target', source: 'work_item:1', target: 'content_unit:1', kind: 'reference', relation: 'work_item_target' },
    ],
  })

  const dependency = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: null,
    impactByNodeId: {},
  })
  const issues = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'issues',
    selectedNodeId: null,
    impactByNodeId: {},
  })

  assert.deepEqual(dependency.graph.nodes.map((node) => node.id), ['content_unit:1'])
  assert.deepEqual(dependency.graph.edges, [])
  assert.deepEqual(dependency.collapsedSummariesByNodeId['content_unit:1'], [
    { kind: 'work_item', count: 1, label: '工作项' },
  ])
  assert.deepEqual(issues.graph.nodes.map((node) => node.id), ['content_unit:1', 'actor:agent', 'work_item:1'])
  assert.deepEqual(issues.graph.edges.map((edge) => edge.id), ['actor-work', 'work-target'])
})

test('content canvas graph adds structure summary metrics for overview density', () => {
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: entityFixture('project', '7', 'project.json', { id: 7, title: 'Project' }),
    productions: [entityFixture('production', 'prod', 'productions/prod/production.json', { id: 'prod', title: 'Prod' })],
    segments: [entityFixture('segment', 'seg', 'productions/prod/segments/seg/segment.json', { id: 'seg', production_id: 'prod', title: 'Seg' })],
    sceneMoments: [entityFixture('scene_moment', 'scene', 'productions/prod/segments/seg/scene_moments/scene/scene_moment.json', { id: 'scene', segment_id: 'seg', title: 'Scene' })],
    storyboards: [entityFixture('storyboard', 'main', 'productions/prod/segments/seg/scene_moments/scene/expression_units/shot/storyboards/main/storyboard.json', { id: 'main', expression_unit_id: 'shot', title: 'Main board' })],
    expressionUnits: [
      entityFixture('expression_unit', 'shot', 'productions/prod/segments/seg/scene_moments/scene/expression_units/shot/expression_unit.json', { id: 'shot', scene_moment_id: 'scene', kind: 'shot', title: 'Shot' }),
      entityFixture('expression_unit', 'exp', 'productions/prod/segments/seg/scene_moments/scene/expression_units/exp/expression_unit.json', { id: 'exp', scene_moment_id: 'scene', title: 'Expression' }),
    ],
    contentUnits: [entityFixture('content_unit', 'cu', 'productions/prod/segments/seg/scene_moments/scene/content_units/cu/content_unit.json', { id: 'cu', scene_moment_id: 'scene', title: 'Render shot' })],
    keyframes: [entityFixture('keyframe', 'kf', 'productions/prod/segments/seg/scene_moments/scene/expression_units/shot/keyframes/kf/keyframe.json', { id: 'kf', expression_unit_id: 'shot', title: 'Keyframe' })],
    assets: [],
    settings: [],
    audioCues: [entityFixture('audio_cue', 'buzz', 'productions/prod/segments/seg/scene_moments/scene/audio_cues/buzz/audio_cue.json', { id: 'buzz', scene_moment_id: 'scene', title: 'Buzz' })],
    contentUnitCandidates: {},
    productionWorkPlan: {
      summary: {
        open: 2,
        blocking: 1,
        humanRecommended: 1,
        agentRecommended: 1,
        readyToGenerate: 0,
        staleSelections: 1,
      },
      items: [
        {
          id: 'wi_missing',
          kind: 'missing_candidate',
          status: 'blocked',
          severity: 'blocking',
          priority: 10,
          reason: 'Missing candidate',
          targetKind: 'content_unit',
          targetId: 'cu',
          targetPath: 'productions/prod/segments/seg/scene_moments/scene/content_units/cu/content_unit.json',
          recommendedActor: 'agent',
          actionLabels: ['生成候选'],
        },
        {
          id: 'wi_stale',
          kind: 'stale_selection',
          status: 'open',
          severity: 'warning',
          priority: 5,
          reason: 'Selection is stale',
          targetKind: 'storyboard',
          targetId: 'main',
          targetPath: 'productions/prod/segments/seg/scene_moments/scene/expression_units/shot/storyboards/main/storyboard.json',
          recommendedActor: 'human',
          actionLabels: ['复核选择'],
        },
      ],
    },
  })
  const scene = graph.nodes.find((node) => node.id === 'scene_moment:scene')
  const shotExpression = graph.nodes.find((node) => node.id === 'expression_unit:shot')

  assert.ok(scene)
  assert.ok(shotExpression)
  assert.equal(graph.edges.find((edge) => edge.kind === 'hierarchy' && edge.source === 'scene_moment:scene' && edge.target === 'expression_unit:shot')?.type, 'contains')
  assert.equal(graph.edges.find((edge) => edge.kind === 'hierarchy' && edge.source === 'expression_unit:shot' && edge.target === 'storyboard:main')?.type, 'contains')
  assert.deepEqual(scene.metrics, [
    '关键帧 1',
    '分镜 1',
    '声音 1',
    '表达 2',
    '工作项 2',
    '需候选 1',
    '需复核 1',
    '缺失 1',
  ])
  assert.deepEqual(shotExpression.metrics, [
    '关键帧 1',
    '分镜 1',
    '工作项 1',
    '需复核 1',
  ])
})

test('content canvas work item ledger exposes evidence and suggested actions', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Render unit', position: { x: 0, y: 0 } }),
      nodeFixture({
        id: 'work_item:1',
        entityKey: '1',
        kind: 'work_item',
        title: 'Generate candidate',
        summary: 'Candidate is missing',
        position: { x: 360, y: 0 },
        status: 'missing',
        sourcePath: 'content_units/1/content_unit.json',
        record: {
          severity: 'blocking',
          status: 'blocked',
          priority: 8,
          reason: 'Candidate is missing for render unit',
          targetKind: 'content_unit',
          targetPath: 'content_units/1/content_unit.json',
          recommendedActor: 'agent',
          actionLabels: ['生成候选', '复核输入'],
        },
      }),
    ],
    edges: [
      { id: 'work-target', source: 'work_item:1', target: 'content_unit:1', kind: 'reference', relation: 'work_item_target' },
    ],
  })

  const workItemLedger = buildContentCanvasRelationLedger(graph, graph.nodes[1])
  const targetLedger = buildContentCanvasRelationLedger(graph, graph.nodes[0])

  assert.deepEqual(workItemLedger.current.map((fact) => [fact.label, fact.value]), [
    ['类型', '工作项'],
    ['状态', '待补齐'],
    ['来源', 'content_units/1/content_unit.json'],
    ['严重度', 'blocking'],
    ['推荐处理', 'agent'],
    ['优先级', '8'],
    ['建议动作', '生成候选 / 复核输入'],
  ])
  assert.deepEqual(workItemLedger.downstream.map((item) => [item.nodeId, item.relation, item.evidence]), [
    ['content_unit:1', '处理目标', 'Candidate is missing for render unit · content_units/1/content_unit.json · blocking'],
  ])
  assert.deepEqual(targetLedger.upstream.map((item) => [item.nodeId, item.action]), [
    ['work_item:1', '生成候选'],
  ])
})

test('content canvas work item actions map only safe targets to executable commands', () => {
  const workItem = nodeFixture({
    id: 'work_item:1',
    entityKey: '1',
    kind: 'work_item',
    title: 'Resolve work',
    position: { x: 0, y: 0 },
    record: {
      actionLabels: ['生成候选', '选择候选', '复核输入'],
    },
  })
  const plans = planContentCanvasWorkItemActions(workItem, [
    nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Asset 1', position: { x: 360, y: 0 } }),
    nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene 1', position: { x: 720, y: 0 } }),
    nodeFixture({ id: 'candidate:1', entityKey: '1', kind: 'candidate', title: 'Candidate 1', position: { x: 1080, y: 0 } }),
    nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Unit 1', position: { x: 1440, y: 0 } }),
  ])

  assert.deepEqual(plans.map((plan) => [plan.kind, plan.targetNodeId, plan.actionLabel, plan.executable]), [
    ['create_content_unit_from_asset', 'asset:1', '生成候选', true],
    ['unsupported', 'asset:1', '选择候选', false],
    ['unsupported', 'asset:1', '复核输入', false],
    ['create_content_unit_from_scene_moment', 'scene_moment:1', '生成候选', true],
    ['unsupported', 'scene_moment:1', '选择候选', false],
    ['unsupported', 'scene_moment:1', '复核输入', false],
    ['unsupported', 'candidate:1', '生成候选', false],
    ['select_candidate', 'candidate:1', '选择候选', true],
    ['unsupported', 'candidate:1', '复核输入', false],
    ['unsupported', 'content_unit:1', '生成候选', false],
    ['unsupported', 'content_unit:1', '选择候选', false],
    ['unsupported', 'content_unit:1', '复核输入', false],
  ])
  assert.deepEqual(plans.filter((plan) => plan.executable).map((plan) => plan.label), [
    '准备素材生成',
    '准备情节生成',
    '选择候选',
  ])
})

test('content canvas work item actions disable already selected candidates', () => {
  const workItem = nodeFixture({
    id: 'work_item:1',
    entityKey: '1',
    kind: 'work_item',
    title: 'Resolve work',
    position: { x: 0, y: 0 },
    record: {
      actionLabels: ['选择候选'],
    },
  })
  const plans = planContentCanvasWorkItemActions(workItem, [
    nodeFixture({
      id: 'candidate:1',
      entityKey: '1',
      kind: 'candidate',
      title: 'Candidate 1',
      position: { x: 360, y: 0 },
      record: { selected: true },
    }),
  ])

  assert.deepEqual(plans.map((plan) => [plan.kind, plan.executable, plan.disabledReason]), [
    ['select_candidate', false, '候选已选择'],
  ])
})

test('content canvas graph derives selection and resource trace from selected candidates', () => {
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    storyboards: [],
    expressionUnits: [],
    contentUnits: [
      {
        id: 'cu_selected',
        entityKind: 'content_unit',
        path: 'content_units/cu_selected/content_unit.json',
        index: 0,
        record: {
          id: 'cu_selected',
          title: 'Selected unit',
          edit_prompt: 'Render selected unit',
        },
      },
    ],
    keyframes: [],
    assets: [],
    settings: [],
    contentUnitCandidates: {
      cu_selected: [
        {
          id: 'cand_a',
          title: 'Candidate A',
          resourceId: 42,
          inputHash: 'sha256:candidate-a',
          source: 'model-a',
          selected: true,
          notes: 'input-hash-a',
        },
      ],
    },
  })
  const folded = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: null,
    impactByNodeId: {},
  })
  const traced = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: 'content_unit:cu_selected',
    impactByNodeId: {},
  })
  const ledger = buildContentCanvasRelationLedger(graph, graph.nodes.find((node) => node.id === 'candidate:cu_selected:cand_a') ?? null)
  const graphState = createContentCanvasWorkspaceSnapshotState(graph)

  assert.deepEqual(graph.nodes.map((node) => [node.id, node.kind]), [
    ['content_unit:cu_selected', 'content_unit'],
    ['candidate:cu_selected:cand_a', 'candidate'],
    ['selection:cu_selected:cand_a', 'selection'],
    ['resource:42', 'resource'],
  ])
  assert.deepEqual(graph.nodes.find((node) => node.id === 'candidate:cu_selected:cand_a')?.metrics, [
    '资源 42',
    'Input sha256:candidate-a',
    '模型 model-a',
    '已选',
  ])
  assert.deepEqual(graph.nodes.find((node) => node.id === 'resource:42')?.metrics, [
    '来源 model-a',
    'Resource 42',
    'Input sha256:candidate-a',
  ])
  assert.deepEqual(graph.edges.map((edge) => [edge.id, edge.relation]), [
    ['content_unit:cu_selected->candidate:cu_selected:cand_a:candidate', 'content_unit_candidate'],
    ['selection:cu_selected:cand_a->candidate:cu_selected:cand_a:selection', 'selection_candidate'],
    ['candidate:cu_selected:cand_a->resource:42:resource', 'candidate_resource'],
  ])
  assert.deepEqual(graph.edges.map((edge) => [edge.relation, edge.type]), [
    ['content_unit_candidate', 'generates'],
    ['selection_candidate', 'selected_from'],
    ['candidate_resource', 'generates'],
  ])
  assert.deepEqual(graph.indexes?.downstreamEdgeIdsByNodeId['content_unit:cu_selected'], [
    'content_unit:cu_selected->candidate:cu_selected:cand_a:candidate',
  ])
  assert.deepEqual(graph.indexes?.upstreamEdgeIdsByNodeId['candidate:cu_selected:cand_a'], [
    'content_unit:cu_selected->candidate:cu_selected:cand_a:candidate',
    'selection:cu_selected:cand_a->candidate:cu_selected:cand_a:selection',
  ])
  assert.deepEqual(folded.graph.nodes.map((node) => node.id), ['content_unit:cu_selected'])
  assert.deepEqual(folded.collapsedSummariesByNodeId['content_unit:cu_selected'], [
    { kind: 'candidate', count: 1, label: '候选' },
    { kind: 'selection', count: 1, label: '选择' },
    { kind: 'resource', count: 1, label: '资源' },
  ])
  assert.deepEqual(traced.graph.nodes.map((node) => node.id), ['content_unit:cu_selected'])
  assert.deepEqual(graphState.nodesById['content_unit:cu_selected']?.candidates, [{
    id: 'cand_a',
    title: 'Candidate A',
    resourceId: 42,
    inputHash: 'sha256:candidate-a',
    source: 'model-a',
    selected: true,
    notes: 'input-hash-a',
  }])
  assert.deepEqual(ledger.upstream.map((item) => [item.nodeId, item.relation]), [
    ['content_unit:cu_selected', '候选来源'],
    ['selection:cu_selected:cand_a', '当前采纳'],
  ])
  assert.deepEqual(ledger.downstream.map((item) => [item.nodeId, item.relation]), [
    ['resource:42', '产出资源'],
  ])
})

test('content canvas group frames wrap content unit candidate clusters without external dependencies', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'asset:phone', entityKey: 'phone', kind: 'asset', title: 'Phone asset', position: { x: -320, y: 0 } }),
      nodeFixture({ id: 'content_unit:render', entityKey: 'render', kind: 'content_unit', title: 'Render unit', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'candidate:render:cand', entityKey: 'cand', kind: 'candidate', title: 'Candidate render', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'selection:render:cand', entityKey: 'render:cand', kind: 'selection', title: 'Selection', position: { x: 360, y: 180 } }),
      nodeFixture({ id: 'resource:9', entityKey: '9', kind: 'resource', title: 'Resource 9', position: { x: 720, y: 0 } }),
    ],
    edges: [
      { id: 'render-asset', source: 'content_unit:render', target: 'asset:phone', kind: 'reference', relation: 'content_unit_asset' },
      { id: 'render-candidate', source: 'content_unit:render', target: 'candidate:render:cand', kind: 'reference', relation: 'content_unit_candidate' },
      { id: 'selection-candidate', source: 'selection:render:cand', target: 'candidate:render:cand', kind: 'reference', relation: 'selection_candidate' },
      { id: 'candidate-resource', source: 'candidate:render:cand', target: 'resource:9', kind: 'reference', relation: 'candidate_resource' },
    ],
  })

  const frames = buildContentCanvasGroupFrames(graph, {
    'asset:phone': { x: -320, y: 0, width: 260, height: 118 },
    'content_unit:render': { x: 0, y: 0, width: 260, height: 118 },
    'candidate:render:cand': { x: 360, y: 0, width: 260, height: 210 },
    'selection:render:cand': { x: 360, y: 180, width: 260, height: 118 },
    'resource:9': { x: 720, y: 0, width: 260, height: 210 },
  })

  assert.equal(frames.length, 1)
  assert.equal(frames[0]?.id, 'auto-group:content_unit:render')
  assert.deepEqual(frames[0]?.nodeIds, [
    'content_unit:render',
    'candidate:render:cand',
    'selection:render:cand',
    'resource:9',
  ])
  assert.equal(frames[0]?.nodeIds.includes('asset:phone'), false)
  assert.deepEqual(frames[0]?.rect, {
    x: -42,
    y: -42,
    width: 1064,
    height: 382,
  })
})

test('content canvas graph carries candidate resource metadata for preview playback', () => {
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    storyboards: [],
    expressionUnits: [],
    contentUnits: [
      {
        id: 'cu_video',
        entityKind: 'content_unit',
        path: 'content_units/cu_video/content_unit.json',
        index: 0,
        record: {
          id: 'cu_video',
          title: 'Video unit',
          edit_prompt: 'Render a video.',
        },
      },
    ],
    keyframes: [],
    assets: [],
    settings: [],
    contentUnitCandidates: {
      cu_video: [
        {
          id: 'cand_video',
          title: 'Candidate video',
          resourceId: 77,
          resourceKind: 'video',
          artifactRef: 'resources/video-77.mp4',
          inputHash: 'hash-video',
          source: 'model-video',
          selected: true,
          notes: 'video output',
        },
      ],
    },
  })

  const candidate = graph.nodes.find((node) => node.id === 'candidate:cu_video:cand_video')
  const resource = graph.nodes.find((node) => node.id === 'resource:77')
  assert.equal(candidate?.record.resourceId, 77)
  assert.equal(candidate?.record.resourceKind, 'video')
  assert.equal(candidate?.record.artifactRef, 'resources/video-77.mp4')
  assert.equal(resource?.record.resourceId, 77)
  assert.equal(resource?.record.resourceKind, 'video')
  assert.equal(resource?.record.artifactRef, 'resources/video-77.mp4')
})

test('content canvas media helper builds playable resource previews for candidate and resource nodes', () => {
  assert.deepEqual(contentCanvasNodeResourceMedia({
    id: 'candidate:cu:cand',
    entityKey: 'cand',
    kind: 'candidate',
    title: 'Candidate',
    subtitle: '',
    summary: '',
    status: 'ready',
    metrics: [],
    sourcePath: '',
    candidateCount: 0,
    resourceId: 77,
    resourceKind: 'video',
    artifactRef: 'outputs/candidate.mp4',
    summaryHash: '',
  }), {
    resourceId: 77,
    url: '/api/v1/resources/77/file',
    type: 'video',
  })
  assert.deepEqual(contentCanvasNodeResourceMedia({
    id: 'resource:12',
    entityKey: '12',
    kind: 'resource',
    title: 'Resource',
    subtitle: '',
    summary: '',
    status: 'ready',
    metrics: [],
    sourcePath: '',
    candidateCount: 0,
    resourceId: 12,
    artifactRef: 'voice.wav',
    summaryHash: '',
  })?.type, 'audio')
  assert.equal(contentCanvasResourceMediaType({ kind: 'candidate', artifactRef: 'frame.webp' }), 'image')
  assert.equal(contentCanvasResourceMediaType({ kind: 'candidate', artifactRef: 'archive.bin' }), 'file')
  assert.equal(contentCanvasNodeResourceMedia({
    id: 'content_unit:cu',
    entityKey: 'cu',
    kind: 'content_unit',
    title: 'Unit',
    subtitle: '',
    summary: '',
    status: 'active',
    metrics: [],
    sourcePath: '',
    candidateCount: 0,
    resourceId: 77,
    summaryHash: '',
  }), undefined)
})

test('content canvas graph ignores local asset candidates and only traces content unit candidates', () => {
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    storyboards: [],
    expressionUnits: [],
    contentUnits: [],
    keyframes: [],
    assets: [
      {
        id: 'asset_phone',
        entityKind: 'asset',
        path: 'assets/asset_phone.json',
        index: 0,
        record: {
          id: 'asset_phone',
          title: 'Phone reference',
          asset_kind: 'image',
          resource_id: 77,
          candidates: [
            {
              id: 'asset_cand',
              title: 'Phone Candidate',
              resourceId: 77,
              source: 'model-a',
              selected: true,
            },
          ],
        },
      },
    ],
    settings: [],
    contentUnitCandidates: {},
  })
  const traced = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: 'asset:asset_phone',
    impactByNodeId: {},
  })
  const ledger = buildContentCanvasRelationLedger(graph, graph.nodes.find((node) => node.id === 'asset:asset_phone') ?? null)

  assert.deepEqual(graph.nodes.map((node) => [node.id, node.kind]), [
    ['asset:asset_phone', 'asset'],
  ])
  assert.deepEqual(graph.nodes.find((node) => node.id === 'asset:asset_phone')?.metrics, [
    '素材 image',
    '资源 77',
  ])
  assert.deepEqual(graph.edges.map((edge) => [edge.id, edge.relation]), [])
  assert.deepEqual(traced.graph.nodes.map((node) => node.id), [
    'asset:asset_phone',
  ])
  assert.deepEqual(ledger.downstream.map((item) => [item.nodeId, item.relation]), [])
})

test('content canvas asset downstream stale edges carry review evidence into trace and issues view', () => {
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    storyboards: [
      {
        id: 'storyboard_1',
        entityKind: 'storyboard',
        path: 'storyboards/storyboard_1.json',
        index: 0,
        record: {
          id: 'storyboard_1',
          title: 'Storyboard 1',
        },
      },
    ],
    expressionUnits: [],
    contentUnits: [],
    keyframes: [],
    assets: [
      {
        id: 'phone',
        entityKind: 'asset',
        path: 'assets/phone.json',
        index: 0,
        record: {
          id: 'phone',
          title: 'Phone reference',
        },
      },
    ],
    settings: [],
    contentUnitCandidates: {},
    assetReferenceUnits: {
      phone: {
        assetId: 'phone',
        title: 'Phone reference',
        path: 'content_units/cu_asset_phone/content_unit.json',
        contentUnitId: 'cu_asset_phone',
        contentUnitType: 'asset_ref',
        outputKind: 'image',
        editPrompt: 'Phone prompt',
        usage: 'Reference for storyboard',
        lockPolicy: 'Review downstream when stale',
        acceptedInputHash: 'sha256:new',
        selectionState: 'selected',
        upstream: [],
        candidates: [],
        downstream: [
          {
            id: 'dep_storyboard',
            title: 'Storyboard 1',
            kind: 'storyboard',
            ownerNodeId: 'storyboard_1',
            momentId: 'm1',
            shotId: 'shot_1',
            dependencyHash: 'sha256:old',
            state: 'stale',
            action: '跳转后重新生成分镜候选',
            preview: '仍引用旧参考图',
          },
        ],
      },
    },
  })
  const trace = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: 'asset:phone',
    impactByNodeId: {},
  })
  const issues = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'issues',
    selectedNodeId: null,
    impactByNodeId: {},
  })
  const ledger = buildContentCanvasRelationLedger(graph, graph.nodes.find((node) => node.id === 'asset:phone') ?? null)
  const insight = buildContentCanvasEdgeInsight(graph, 'asset:phone->storyboard:storyboard_1:asset-downstream:dep_storyboard')

  assert.deepEqual(graph.edges.map((edge) => [edge.id, edge.relation, edge.type, edge.state, edge.evidence, edge.action]), [
    [
      'asset:phone->storyboard:storyboard_1:asset-downstream:dep_storyboard',
      'asset_downstream',
      'invalidates',
      'stale',
      'sha256:old · 仍引用旧参考图',
      '跳转后重新生成分镜候选',
    ],
  ])
  assert.deepEqual(trace.graph.nodes.map((node) => node.id), ['asset:phone', 'storyboard:storyboard_1'])
  assert.deepEqual(trace.graph.edges.map((edge) => edge.id), ['asset:phone->storyboard:storyboard_1:asset-downstream:dep_storyboard'])
  assert.deepEqual(issues.graph.nodes.map((node) => node.id), ['asset:phone', 'storyboard:storyboard_1'])
  assert.deepEqual(ledger.downstream.map((item) => [item.nodeId, item.relation, item.evidence, item.action]), [
    ['storyboard:storyboard_1', '下游影响', 'sha256:old · 仍引用旧参考图', '跳转后重新生成分镜候选'],
  ])
  assert.deepEqual(insight && [insight.relation, insight.evidence, insight.action, insight.targetNodeId, insight.primaryActionNodeId, insight.primaryActionLabel], [
    '下游影响',
    'sha256:old · 仍引用旧参考图',
    '跳转后重新生成分镜候选',
    'storyboard:storyboard_1',
    'storyboard:storyboard_1',
    '跳转后重新生成分镜候选 · 定位复核',
  ])
})

test('content canvas graph maps dependency and non-invalidating impact edge semantics', () => {
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    storyboards: [
      entityFixture('storyboard', 'board_ready', 'storyboards/board_ready.json', { id: 'board_ready', title: 'Ready board' }),
    ],
    expressionUnits: [],
    contentUnits: [
      entityFixture('content_unit', 'cu_asset', 'content_units/cu_asset/content_unit.json', {
        id: 'cu_asset',
        title: 'Asset unit',
        asset_ref: 'phone',
      }),
    ],
    keyframes: [],
    assets: [
      entityFixture('asset', 'phone', 'assets/phone.json', { id: 'phone', title: 'Phone reference' }),
    ],
    settings: [],
    contentUnitCandidates: {},
    assetReferenceUnits: {
      phone: {
        assetId: 'phone',
        title: 'Phone reference',
        path: 'content_units/cu_asset/content_unit.json',
        contentUnitId: 'cu_asset',
        contentUnitType: 'asset_ref',
        outputKind: 'image',
        editPrompt: 'Phone prompt',
        usage: 'Reference for ready board',
        lockPolicy: 'Review downstream when stale',
        acceptedInputHash: 'sha256:ready',
        selectionState: 'selected',
        upstream: [],
        candidates: [],
        downstream: [
          {
            id: 'dep_ready',
            title: 'Ready board',
            kind: 'storyboard',
            ownerNodeId: 'board_ready',
            dependencyHash: 'sha256:ready',
            state: 'ready',
            preview: 'Ready dependency',
          },
        ],
      },
    },
  })

  assert.equal(graph.edges.find((edge) => edge.relation === 'content_unit_asset')?.type, 'depends_on')
  assert.equal(graph.edges.find((edge) => edge.relation === 'asset_downstream')?.type, 'affects')
})

test('content canvas read model hydrates asset generation task from matching content unit', () => {
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    storyboards: [],
    expressionUnits: [],
    contentUnits: [
      entityFixture('content_unit', 'cu_phone', 'content_units/cu_phone/content_unit.json', {
        id: 'cu_phone',
        title: 'Phone generation',
        content_unit_type: 'asset_ref',
        output_kind: 'image',
        asset_ref: 'phone',
        edit_prompt: { text: 'Generate phone reference' },
      }),
    ],
    keyframes: [],
    assets: [
      entityFixture('asset', 'phone', 'assets/phone/asset.json', { id: 'phone', title: 'Phone reference', asset_kind: 'image' }),
    ],
    settings: [],
    contentUnitCandidates: {
      cu_phone: [{
        id: 'cand_1',
        title: 'Candidate 1',
        resourceId: 88,
        resourceKind: 'image',
        source: 'model',
        selected: true,
        notes: 'selected',
      }],
    },
  })

  const asset = graph.nodes.find((node) => node.id === 'asset:phone')
  assert.equal(asset?.generationTask?.id, 'cu_phone')
  assert.equal(asset?.generationTask?.contentUnitType, 'asset_ref')
  assert.equal(asset?.generationTask?.status, 'selected')
  assert.deepEqual(asset?.metrics, [
    '素材 image',
    '创作片段 image',
    '候选 1',
    '已选择候选',
  ])
})

test('content canvas read model hydrates keyframe generation task from path ref by default', () => {
  const keyframePath = 'productions/prod/segments/seg/scene_moments/scene/expression_units/shot/keyframes/kf_1/keyframe.json'
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    storyboards: [],
    expressionUnits: [],
    contentUnits: [
      entityFixture('content_unit', 'cu_kf', 'content_units/cu_kf/content_unit.json', {
        id: 'cu_kf',
        title: 'Keyframe generation',
        content_unit_type: 'keyframe_ref',
        keyframe_ref: keyframePath,
        edit_prompt: { text: 'Generate keyframe anchor' },
      }),
    ],
    keyframes: [
      entityFixture('keyframe', 'kf_1', keyframePath, { id: 'kf_1', title: 'Keyframe 1' }),
    ],
    assets: [],
    settings: [],
    contentUnitCandidates: {},
  })

  const keyframe = graph.nodes.find((node) => node.id === 'keyframe:kf_1')
  assert.equal(keyframe?.generationTask?.id, 'cu_kf')
  assert.equal(keyframe?.generationTask?.outputKind, 'image')
  assert.equal(keyframe?.generationTask?.prompt, 'Generate keyframe anchor')
  assert.deepEqual(keyframe?.metrics, [
    '创作片段 image',
    '待生成候选',
  ])
})

test('content canvas node helpers use hydrated generation task as the default user-facing generation surface', () => {
  const node = nodeFixture({
    id: 'asset:phone',
    entityKey: 'phone',
    kind: 'asset',
    title: 'Phone',
    position: { x: 0, y: 0 },
    generationTask: {
      id: 'cu_phone',
      nodeId: 'content_unit:cu_phone',
      contentUnitType: 'asset_ref',
      outputKind: 'image',
      title: 'Phone generation',
      prompt: 'Generate the phone reference.',
      status: 'needs_candidate',
      sourcePath: 'content_units/cu_phone/content_unit.json',
      record: {
        id: 'cu_phone',
        content_unit_type: 'asset_ref',
      },
      candidates: [{
        id: 'candidate_1',
        title: 'Candidate 1',
        source: 'model',
        selected: false,
        notes: 'draft',
      }],
    },
  })

  assert.equal(promptFromContentNode(node), 'Generate the phone reference.')
  assert.deepEqual(candidatesForNode(node).map((candidate) => candidate.id), ['candidate_1'])
  assert.deepEqual(candidateDecisionForNode(node, {}), {
    tone: 'pending',
    label: '待选择',
    summary: '已有候选结果，但尚未确认当前选择。',
    actionLabel: '选择候选',
    candidateCount: 1,
    hasExplicitSelection: false,
  })
})

test('content canvas content unit ensure delegates matching and naming to engine', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const existing = {
    path: 'content_units/existing/content_unit.json',
    record: {
      id: 'existing',
      content_unit_type: 'asset_ref',
      asset_ref: 'settings/hero/states/day/assets/phone/asset.json',
    },
  }
  const gateway = {
    ensureContentUnitForEntity: async (payload: unknown) => {
      calls.push({ kind: 'ensureContentUnitForEntity', payload })
      return existing
    },
  } as never

  const result = await ensureContentUnitForRef(gateway, {
    id: 'cu_asset_phone',
    refKind: 'asset',
    ref: 'phone',
    contentUnitType: 'asset_ref',
    outputKind: 'image',
    title: 'Phone 创作片段',
    description: 'Create a phone reference.',
    prompt: 'Generate phone.',
  })

  assert.deepEqual(result, existing)
  assert.deepEqual(calls, [{
    kind: 'ensureContentUnitForEntity',
    payload: {
      targetKind: 'asset',
      targetRef: 'phone',
      id: 'cu_asset_phone',
      title: 'Phone 创作片段',
      contentUnitType: 'asset_ref',
      outputKind: 'image',
      description: 'Create a phone reference.',
      prompt: 'Generate phone.',
      modelIntent: {
        source: 'content_canvas',
      },
    },
  }])
})

test('content canvas scene moment generation command ensures a scene_moment_ref content unit', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    service: {
      querySettings: async () => [],
      queryAssets: async () => ({ assets: [] }),
      upsertSetting: async () => ({ record: {}, path: '' }),
      updateContentUnitEditPrompt: async () => ({ record: {}, path: '' }),
    },
    loadContentSourceWorkspaceData: async () => ({
      source: 'workspace',
      hierarchyTree: [],
      previewMoments: [],
      contentUnitCandidates: {},
      expressionUnitsByMoment: {},
      audioCuesByMoment: {},
      expressionUnitWorkspaceDetails: {},
      assetReferenceUnits: {},
    }),
    createProduction: async () => undefined,
    createSegment: async () => undefined,
    createSceneMoment: async () => undefined,
    createExpressionUnit: async () => undefined,
    updateExpressionUnit: async () => undefined,
    ensureContentUnitForEntity: async (payload: unknown) => {
      calls.push({ kind: 'ensureContentUnitForEntity', payload })
      return {
        path: 'content_units/cu_scene_scene_1/content_unit.json',
        record: { id: 'cu_scene_scene_1' },
      }
    },
    createContentUnitCandidate: async () => ({}),
    selectContentUnitCandidate: async () => undefined,
    writeHierarchyNode: async () => undefined,
  } as never
  const scene = nodeFixture({
    id: 'scene_moment:scene_1',
    entityKey: 'scene_1',
    kind: 'scene_moment',
    title: 'Scene 1',
    sourcePath: 'productions/prod/segments/seg/scene_moments/scene_1/scene_moment.json',
    position: { x: 0, y: 0 },
  })

  const result = await createContentUnitFromSceneMoment(7, scene, gateway)

  assert.equal(result.message, '已确保情节创作片段')
  assert.deepEqual(result.changedNodeIds, ['content_unit:cu_scene_scene_1'])
  assert.deepEqual(calls[0], {
    kind: 'ensureContentUnitForEntity',
    payload: {
    targetKind: 'scene_moment',
    targetRef: 'scene_1',
    id: 'cu_scene_scene_1',
    title: 'Scene 1 创作片段',
    contentUnitType: 'scene_moment_ref',
    outputKind: 'video',
    description: '从编排画布基于情节「Scene 1」创建。',
    prompt: '将情节「Scene 1」转化为可制作镜头，保留上游叙事目标和已有素材约束。',
    modelIntent: {
      source: 'content_canvas',
      scene_moment_node_id: 'scene_moment:scene_1',
    },
    },
  })
})

test('content canvas expression unit creation also ensures an expression_unit_ref content unit', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    service: {
      querySettings: async () => [],
      queryAssets: async () => ({ assets: [] }),
      upsertSetting: async () => ({ record: {}, path: '' }),
      updateContentUnitEditPrompt: async () => ({ record: {}, path: '' }),
    },
    loadContentSourceWorkspaceData: async () => ({
      source: 'workspace',
      hierarchyTree: [],
      previewMoments: [],
      contentUnitCandidates: {},
      expressionUnitsByMoment: {},
      audioCuesByMoment: {},
      expressionUnitWorkspaceDetails: {},
      assetReferenceUnits: {},
    }),
    createProduction: async () => undefined,
    createSegment: async () => undefined,
    createSceneMoment: async () => undefined,
    createExpressionUnit: async (payload: unknown) => {
      calls.push({ kind: 'createExpressionUnit', payload })
    },
    updateExpressionUnit: async () => undefined,
    ensureContentUnitForEntity: async (payload: unknown) => {
      calls.push({ kind: 'ensureContentUnitForEntity', payload })
      return {
        path: 'content_units/cu_expression_expr_1/content_unit.json',
        record: { id: 'cu_expression_expr_1' },
      }
    },
    createContentUnitCandidate: async () => ({}),
    selectContentUnitCandidate: async () => undefined,
    writeHierarchyNode: async () => undefined,
  } as never
  const scene = nodeFixture({
    id: 'scene_moment:scene_1',
    entityKey: 'scene_1',
    kind: 'scene_moment',
    title: 'Scene 1',
    sourcePath: 'productions/prod/segments/seg/scene_moments/scene_1/scene_moment.json',
    record: {
      production_id: 'prod',
      segment_id: 'seg',
    },
    position: { x: 0, y: 0 },
  })

  const result = await createChildContentCanvasNode(7, scene, 'expression_unit', {
    input: { id: 'expr_1', title: 'Line 1', status: 'dialogue' },
    position: { x: 360, y: 120 },
  }, gateway)

  assert.deepEqual(calls.map((call) => call.kind), ['createExpressionUnit', 'ensureContentUnitForEntity'])
  assert.equal(result.message, '已创建表达单元并确保创作片段')
  assert.deepEqual(result.changedNodeIds, ['expression_unit:expr_1', 'content_unit:cu_expression_expr_1'])
  assert.deepEqual(result.nodePositions, {
    'expression_unit:expr_1': { x: 360, y: 120 },
  })
  assert.deepEqual(calls[0].payload, {
    projectId: 7,
    productionId: 'prod',
    segmentId: 'seg',
    sceneMomentId: 'scene_1',
    id: 'expr_1',
    title: 'Line 1',
    kind: 'dialogue',
    text: 'Line 1',
    sceneMomentTitle: 'Scene 1',
  })
  assert.deepEqual(calls[1], {
    kind: 'ensureContentUnitForEntity',
    payload: {
    targetKind: 'expression_unit',
    targetRef: 'expr_1',
    id: 'cu_expression_expr_1',
    title: 'Line 1 创作片段',
    contentUnitType: 'expression_unit_ref',
    outputKind: 'audio',
    description: '从编排画布基于表达单元「Line 1」创建。',
    prompt: '将情节「Scene 1」中的表达单元「Line 1」转化为可制作候选。',
    modelIntent: {
      source: 'content_canvas',
      expression_unit_id: 'expr_1',
      scene_moment_id: 'scene_1',
      scene_moment_node_id: 'scene_moment:scene_1',
    },
    },
  })
})

test('content prompt canvas creates scene moments only with explicit production and segment mounts', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    createProduction: async (payload: unknown) => {
      calls.push({ kind: 'createProduction', payload })
    },
    createSegment: async (payload: unknown) => {
      calls.push({ kind: 'createSegment', payload })
    },
    createSceneMoment: async (payload: unknown) => {
      calls.push({ kind: 'createSceneMoment', payload })
    },
    createSetting: async (payload: unknown) => {
      calls.push({ kind: 'createSetting', payload })
      return { path: 'settings/location/setting.json', record: { id: 'location' } }
    },
    createSettingState: async (payload: unknown) => {
      calls.push({ kind: 'createSettingState', payload })
      return { path: 'settings/location/states/night/setting_state.json', record: { id: 'night' } }
    },
    connectSceneMomentSetting: async (payload: unknown) => {
      calls.push({ kind: 'connectSceneMomentSetting', payload })
    },
    ensureContentUnitForEntity: async (payload: unknown) => {
      calls.push({ kind: 'ensureContentUnitForEntity', payload })
      return { path: 'content_units/cu_scene_opening/content_unit.json', record: { id: 'cu_scene_opening' } }
    },
  } as never

  const result = await createSceneMomentCanvasNode(7, {
    input: {
      id: 'opening',
      title: 'Opening',
      createTargetProduction: true,
      createTargetSegment: true,
      targetProductionId: 'pilot',
      targetProductionTitle: 'Pilot',
      targetSegmentId: 'intro',
      targetSegmentTitle: 'Intro',
      createTargetSetting: true,
      createTargetState: true,
      targetSettingId: 'location',
      targetSettingTitle: 'Location',
      targetStateId: 'night',
      targetStateTitle: 'Night',
    },
    position: { x: 100, y: 200 },
  }, gateway)

  assert.deepEqual(calls.map((call) => call.kind), [
    'createProduction',
    'createSegment',
    'createSceneMoment',
    'createSetting',
    'createSettingState',
    'connectSceneMomentSetting',
    'ensureContentUnitForEntity',
  ])
  assert.equal(result.focusNodeId, 'scene_moment:opening')
  assert.deepEqual(result.nodePositions, { 'scene_moment:opening': { x: 100, y: 200 } })
  assert.ok(result.changedNodeIds.includes('production:pilot'))
  assert.ok(result.changedNodeIds.includes('segment:intro'))
  assert.ok(result.changedNodeIds.includes('setting:location'))
  assert.ok(result.changedNodeIds.includes('state:night'))
  assert.ok(result.changedNodeIds.includes('scene_moment:opening'))
  assert.ok(result.changedNodeIds.includes('content_unit:cu_scene_opening'))
})

test('content prompt canvas quick create reads existing segments from production refs and paths', () => {
  const production = nodeFixture({
    id: 'production:pilot',
    entityKey: 'pilot',
    kind: 'production',
    title: 'Pilot',
    sourcePath: 'productions/pilot/production.json',
    position: { x: 0, y: 0 },
  })
  const pathSegment = nodeFixture({
    id: 'segment:opening',
    entityKey: 'opening',
    kind: 'segment',
    title: 'Opening',
    sourcePath: 'productions/pilot/segments/opening/segment.json',
    position: { x: 360, y: 0 },
  })
  const refSegment = nodeFixture({
    id: 'segment:bridge',
    entityKey: 'bridge',
    kind: 'segment',
    title: 'Bridge',
    sourcePath: 'segments/bridge/segment.json',
    record: { production_ref: 'production:pilot' },
    position: { x: 360, y: 160 },
  })
  const otherSegment = nodeFixture({
    id: 'segment:other',
    entityKey: 'other',
    kind: 'segment',
    title: 'Other',
    sourcePath: 'productions/other/segments/other/segment.json',
    position: { x: 360, y: 320 },
  })

  assert.equal(contentCanvasSegmentBelongsToProduction(pathSegment, 'pilot', production), true)
  assert.equal(contentCanvasSegmentBelongsToProduction(refSegment, 'pilot', production), true)
  assert.equal(contentCanvasSegmentBelongsToProduction(otherSegment, 'pilot', production), false)
  assert.deepEqual(
    contentCanvasSegmentsForProduction([pathSegment, refSegment, otherSegment], 'pilot', [production]).map((node) => node.entityKey),
    ['opening', 'bridge'],
  )
  assert.equal(contentCanvasFirstSegmentIdForProduction([pathSegment, refSegment, otherSegment], 'pilot', [production]), 'opening')
})

test('content prompt canvas creates naked media generation tasks without default production structure', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    createContentUnit: async (payload: unknown) => {
      calls.push({ kind: 'createContentUnit', payload })
      return { path: 'content_units/video_task/content_unit.json', record: { id: 'video_task' } }
    },
  } as never

  const result = await createNakedGenerationTaskCanvasNode(7, 'video', {
    input: { id: 'video_task', title: 'Video Task' },
    position: { x: 40, y: 80 },
  }, gateway)

  assert.deepEqual(calls.map((call) => call.kind), ['createContentUnit'])
  assert.deepEqual(calls[0].payload, {
    id: 'video_task',
    title: 'Video Task',
    contentUnitType: 'canvas_video_task',
    outputKind: 'video',
    generationRole: 'naked_task',
    description: '从创作画布创建的视频裸生成任务。',
    prompt: 'Video Task',
    modelIntent: {
      source: 'content_canvas_naked_task',
      canvas_task: true,
      output_kind: 'video',
    },
  })
  assert.equal(result.focusNodeId, 'content_unit:video_task')
  assert.deepEqual(result.nodePositions, { 'content_unit:video_task': { x: 40, y: 80 } })
  assert.deepEqual(result.changedNodeIds, ['content_unit:video_task'])
})

test('content prompt canvas creates asset visual nodes under selected or new setting state mounts', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    createSetting: async (payload: unknown) => {
      calls.push({ kind: 'createSetting', payload })
      return { path: 'settings/prop/setting.json', record: { id: 'prop' } }
    },
    createSettingState: async (payload: unknown) => {
      calls.push({ kind: 'createSettingState', payload })
      return { path: 'settings/prop/states/base/setting_state.json', record: { id: 'base' } }
    },
    createAsset: async (payload: unknown) => {
      calls.push({ kind: 'createAsset', payload })
      return { path: 'settings/prop/states/base/assets/phone/asset.json', record: { id: 'phone' } }
    },
    ensureContentUnitForEntity: async (payload: unknown) => {
      calls.push({ kind: 'ensureContentUnitForEntity', payload })
      return { path: 'content_units/cu_asset_phone/content_unit.json', record: { id: 'cu_asset_phone' } }
    },
  } as never

  const result = await createAssetCanvasNode(7, {
    input: {
      id: 'phone',
      title: 'Phone',
      createTargetSetting: true,
      createTargetState: true,
      targetSettingId: 'prop',
      targetSettingTitle: 'Prop',
      targetStateId: 'base',
      targetStateTitle: 'Base',
    },
    position: { x: 320, y: 160 },
  }, gateway)

  assert.deepEqual(calls.map((call) => call.kind), ['createSetting', 'createSettingState', 'createAsset', 'ensureContentUnitForEntity'])
  assert.equal(result.focusNodeId, 'asset:phone')
  assert.deepEqual(result.nodePositions, { 'asset:phone': { x: 320, y: 160 } })
  assert.deepEqual(calls[2].payload, {
    id: 'phone',
    title: 'Phone',
    settingId: 'prop',
    settingStateId: 'base',
    slot: 'phone',
    assetKind: 'image',
    promptHint: '从创作画布创建。',
  })
  assert.ok(result.changedNodeIds.includes('setting:prop'))
  assert.ok(result.changedNodeIds.includes('state:base'))
  assert.ok(result.changedNodeIds.includes('asset:phone'))
  assert.ok(result.changedNodeIds.includes('content_unit:cu_asset_phone'))
})

test('content canvas shot expression unit creates a video expression content unit', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    service: {
      querySettings: async () => [],
      queryAssets: async () => ({ assets: [] }),
      upsertSetting: async () => ({ record: {}, path: '' }),
      updateContentUnitEditPrompt: async () => ({ record: {}, path: '' }),
    },
    loadContentSourceWorkspaceData: async () => ({
      source: 'workspace',
      hierarchyTree: [],
      previewMoments: [],
      contentUnitCandidates: {},
      expressionUnitsByMoment: {},
      audioCuesByMoment: {},
      expressionUnitWorkspaceDetails: {},
      assetReferenceUnits: {},
    }),
    createProduction: async () => undefined,
    createSegment: async () => undefined,
    createSceneMoment: async () => undefined,
    createExpressionUnit: async (payload: unknown) => {
      calls.push({ kind: 'createExpressionUnit', payload })
    },
    updateExpressionUnit: async () => undefined,
    ensureContentUnitForEntity: async (payload: unknown) => {
      calls.push({ kind: 'ensureContentUnitForEntity', payload })
      return {
        path: 'content_units/cu_expression_shot_1/content_unit.json',
        record: { id: 'cu_expression_shot_1' },
      }
    },
    createContentUnitCandidate: async () => ({}),
    selectContentUnitCandidate: async () => undefined,
    writeHierarchyNode: async () => undefined,
  } as never
  const scene = nodeFixture({
    id: 'scene_moment:scene_1',
    entityKey: 'scene_1',
    kind: 'scene_moment',
    title: 'Scene 1',
    sourcePath: 'productions/prod/segments/seg/scene_moments/scene_1/scene_moment.json',
    record: {
      production_id: 'prod',
      segment_id: 'seg',
    },
    position: { x: 0, y: 0 },
  })

  await createChildContentCanvasNode(7, scene, 'expression_unit', {
    input: { id: 'shot_1', title: 'Opening shot', status: 'shot' },
  }, gateway)

  assert.deepEqual(calls[0].payload, {
    projectId: 7,
    productionId: 'prod',
    segmentId: 'seg',
    sceneMomentId: 'scene_1',
    id: 'shot_1',
    title: 'Opening shot',
    kind: 'shot',
    text: 'Opening shot',
    sceneMomentTitle: 'Scene 1',
  })
  assert.equal((calls[1].payload as Record<string, unknown>).outputKind, 'video')
  assert.equal((calls[1].payload as Record<string, unknown>).contentUnitType, 'expression_unit_ref')
})

test('content canvas scene moment can create keyframe with content unit', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    service: {
      querySettings: async () => [],
      queryAssets: async () => ({ assets: [] }),
      upsertSetting: async () => ({ record: {}, path: '' }),
      updateContentUnitEditPrompt: async () => ({ record: {}, path: '' }),
    },
    loadContentSourceWorkspaceData: async () => ({ source: 'workspace', hierarchyTree: [], previewMoments: [], contentUnitCandidates: {}, expressionUnitsByMoment: {}, audioCuesByMoment: {}, expressionUnitWorkspaceDetails: {}, assetReferenceUnits: {} }),
    createProduction: async () => undefined,
    createSegment: async () => undefined,
    createSceneMoment: async () => undefined,
    createExpressionUnit: async () => undefined,
    createKeyframe: async (payload: unknown) => {
      calls.push({ kind: 'createKeyframe', payload })
    },
    createStoryboard: async () => undefined,
    updateExpressionUnit: async () => undefined,
    ensureContentUnitForEntity: async (payload: unknown) => {
      calls.push({ kind: 'ensureContentUnitForEntity', payload })
      return { path: 'content_units/cu_keyframe_kf_1/content_unit.json', record: { id: 'cu_keyframe_kf_1' } }
    },
    createContentUnitCandidate: async () => ({}),
    selectContentUnitCandidate: async () => undefined,
    writeHierarchyNode: async (payload: unknown) => {
      calls.push({ kind: 'writeHierarchyNode', payload })
    },
  } as never
  const scene = nodeFixture({
    id: 'scene_moment:scene_1',
    entityKey: 'scene_1',
    kind: 'scene_moment',
    title: 'Scene 1',
    sourcePath: 'productions/prod/segments/seg/scene_moments/scene_1/scene_moment.json',
    record: { production_id: 'prod', segment_id: 'seg' },
    position: { x: 0, y: 0 },
  })

  const result = await createChildContentCanvasNode(7, scene, 'keyframe', {
    input: { id: 'kf_1', title: 'Hero closeup' },
  }, gateway)

  assert.equal(result.message, '已创建关键帧并确保创作片段')
  assert.deepEqual(result.changedNodeIds, ['keyframe:kf_1', 'content_unit:cu_keyframe_kf_1'])
  assert.deepEqual(calls[0], {
    kind: 'createKeyframe',
    payload: {
      id: 'kf_1',
      productionId: 'prod',
      segmentId: 'seg',
      sceneMomentId: 'scene_1',
      title: 'Hero closeup',
      role: undefined,
      visualIntent: '从情节「Scene 1」创建。',
    },
  })
  assert.deepEqual(calls[1], {
    kind: 'ensureContentUnitForEntity',
    payload: {
      targetKind: 'keyframe',
      targetRef: 'kf_1',
      id: 'cu_keyframe_kf_1',
      title: 'Hero closeup 创作片段',
      contentUnitType: 'keyframe_ref',
      outputKind: 'image',
      description: '从编排画布基于关键帧「Hero closeup」创建。',
      prompt: '为情节「Scene 1」生成关键帧视觉候选。',
      modelIntent: {
        source: 'content_canvas',
        keyframe_id: 'kf_1',
        scene_moment_id: 'scene_1',
        owner_node_id: 'scene_moment:scene_1',
      },
    },
  })
})

test('content canvas expression unit can create storyboard with content unit', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    service: {
      querySettings: async () => [],
      queryAssets: async () => ({ assets: [] }),
      upsertSetting: async () => ({ record: {}, path: '' }),
      updateContentUnitEditPrompt: async () => ({ record: {}, path: '' }),
    },
    loadContentSourceWorkspaceData: async () => ({ source: 'workspace', hierarchyTree: [], previewMoments: [], contentUnitCandidates: {}, expressionUnitsByMoment: {}, audioCuesByMoment: {}, expressionUnitWorkspaceDetails: {}, assetReferenceUnits: {} }),
    createProduction: async () => undefined,
    createSegment: async () => undefined,
    createSceneMoment: async () => undefined,
    createExpressionUnit: async () => undefined,
    createKeyframe: async () => undefined,
    createStoryboard: async (payload: unknown) => {
      calls.push({ kind: 'createStoryboard', payload })
    },
    updateExpressionUnit: async () => undefined,
    ensureContentUnitForEntity: async (payload: unknown) => {
      calls.push({ kind: 'ensureContentUnitForEntity', payload })
      return { path: 'content_units/cu_storyboard_board_1/content_unit.json', record: { id: 'cu_storyboard_board_1' } }
    },
    createContentUnitCandidate: async () => ({}),
    selectContentUnitCandidate: async () => undefined,
    writeHierarchyNode: async (payload: unknown) => {
      calls.push({ kind: 'writeHierarchyNode', payload })
    },
  } as never
  const expression = nodeFixture({
    id: 'expression_unit:expr_1',
    entityKey: 'expr_1',
    kind: 'expression_unit',
    title: 'Shot expression',
    sourcePath: 'productions/prod/segments/seg/scene_moments/scene_1/expression_units/expr_1/expression_unit.json',
    record: { scene_moment_id: 'scene_1' },
    position: { x: 0, y: 0 },
  })

  const result = await createChildContentCanvasNode(7, expression, 'storyboard', {
    input: { id: 'board_1', title: 'Main board' },
  }, gateway)

  assert.equal(result.message, '已创建分镜图并确保创作片段')
  assert.deepEqual(result.changedNodeIds, ['storyboard:board_1', 'content_unit:cu_storyboard_board_1'])
  assert.deepEqual(calls[0], {
    kind: 'createStoryboard',
    payload: {
      id: 'board_1',
      productionId: 'prod',
      segmentId: 'seg',
      sceneMomentId: 'scene_1',
      expressionUnitId: 'expr_1',
      title: 'Main board',
      visualIntent: '从表达单元「Shot expression」创建。',
    },
  })
  assert.deepEqual(calls[1], {
    kind: 'ensureContentUnitForEntity',
    payload: {
      targetKind: 'storyboard',
      targetRef: 'board_1',
      id: 'cu_storyboard_board_1',
      title: 'Main board 创作片段',
      contentUnitType: 'storyboard_ref',
      outputKind: 'image',
      description: '从编排画布基于分镜图「Main board」创建。',
      prompt: '为表达单元「Shot expression」生成分镜图视觉候选。',
      modelIntent: {
        source: 'content_canvas',
        storyboard_id: 'board_1',
        scene_moment_id: 'scene_1',
        owner_node_id: 'expression_unit:expr_1',
        expression_unit_id: 'expr_1',
      },
    },
  })
})

test('content canvas expression unit editor saves source expression fields', async () => {
  const calls: unknown[] = []
  const gateway = {
    updateExpressionUnit: async (payload: unknown) => {
      calls.push(payload)
    },
  } as never
  const expression = nodeFixture({
    id: 'expression_unit:expr_1',
    entityKey: 'expr_1',
    kind: 'expression_unit',
    title: 'Old line',
    sourcePath: 'productions/prod/segments/seg/scene_moments/scene_1/expression_units/expr_1/expression_unit.json',
    summary: 'Existing fallback text',
    record: {
      text: 'Existing text',
      intent: 'Existing intent',
      speaker: 'Narrator',
      note: 'Keep old note',
    },
  })

  const result = await updateExpressionUnitFromCanvas(7, expression, {
    title: 'New line',
    kind: 'caption',
  }, gateway)

  assert.equal(result.message, '已保存表达单元')
  assert.deepEqual(result.changedNodeIds, ['expression_unit:expr_1'])
  assert.deepEqual(calls, [{
    projectId: 7,
    targetPath: 'productions/prod/segments/seg/scene_moments/scene_1/expression_units/expr_1/expression_unit.json',
    title: 'New line',
    kind: 'caption',
    text: 'Existing text',
    summary: 'Existing intent',
    speaker: 'Narrator',
    note: 'Keep old note',
  }])
})

test('content canvas generation candidate creation keeps the current inspector surface', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    generateContentUnitCandidate: async (payload: unknown) => {
      calls.push({ kind: 'generateContentUnitCandidate', payload })
      return {
        id: 'canvas_candidate_test',
        source: 'ai_generate',
        status: 'running',
        outputs: [],
        prompt_snapshot: {
          input_hash: 'job:91',
          job_id: 91,
        },
        producer: {
          kind: 'generation',
          job_id: 91,
        },
      }
    },
  } as never
  const contentUnit = nodeFixture({
    id: 'content_unit:cu_scene',
    entityKey: 'cu_scene',
    kind: 'content_unit',
    title: 'Scene render',
    subtitle: 'video',
    record: {
      output_kind: 'video',
      edit_prompt: { text: 'Generate the scene.' },
    },
    position: { x: 100, y: 200 },
  })

  const result = await createCandidateFromContentUnit(7, contentUnit, undefined, gateway)

  assert.deepEqual(calls.map((call) => call.kind), ['generateContentUnitCandidate'])
  assert.deepEqual(calls[0].payload, {
    projectId: 7,
    contentUnitId: 'cu_scene',
    candidateId: (calls[0].payload as { candidateId: string }).candidateId,
    outputKind: 'video',
    promptText: 'Generate the scene.',
  })
  assert.equal(result.focusNodeId, undefined)
  assert.equal(result.createdCandidates?.[0]?.contentUnitId, 'cu_scene')
  assert.equal(result.createdCandidates?.[0]?.candidate.id, 'canvas_candidate_test')
  assert.equal(result.createdCandidates?.[0]?.candidate.title, '候选 1')
  assert.equal(result.createdCandidates?.[0]?.candidate.status, 'running')
  assert.equal(result.createdCandidates?.[0]?.candidate.inputHash, 'job:91')
})

test('content canvas uploaded resource creates a resource library content candidate', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    uploadResource: async (payload: unknown) => {
      calls.push({ kind: 'uploadResource', payload })
      return {
        id: 42,
        name: 'Rain clip.mp4',
        type: 'video',
        mimeType: 'video/mp4',
      }
    },
    createContentUnitCandidate: async (payload: unknown) => {
      calls.push({ kind: 'createContentUnitCandidate', payload })
      return {
        id: 'resource_candidate_test',
        source: 'resource_library',
        status: 'imported',
        outputs: [{ kind: 'video', resource_id: 42, mime_type: 'video/mp4' }],
        prompt_snapshot: {
          input_hash: 'resource:42',
        },
      }
    },
  } as never
  const contentUnit = nodeFixture({
    id: 'content_unit:cu_scene',
    entityKey: 'cu_scene',
    kind: 'content_unit',
    title: 'Scene render',
    subtitle: 'video',
    record: {
      output_kind: 'video',
      edit_prompt: { text: 'Render the scene.' },
    },
    position: { x: 100, y: 200 },
  })

  const result = await uploadCandidateForContentUnit(7, contentUnit, { name: 'Rain clip.mp4' } as File, undefined, gateway)

  assert.deepEqual(calls.map((call) => call.kind), ['uploadResource', 'createContentUnitCandidate'])
  assert.equal((calls[0].payload as { projectId: number }).projectId, 7)
  assert.deepEqual(calls[1].payload, {
    projectId: 7,
    contentUnitId: 'cu_scene',
    candidateId: (calls[1].payload as { candidateId: string }).candidateId,
    source: 'resource_library',
    status: 'imported',
    producer: {
      kind: 'content_workbench',
      model_id: 'resource_library',
      title: 'Rain clip.mp4',
    },
    outputs: [{ kind: 'video', resource_id: 42, mime_type: 'video/mp4' }],
    promptSnapshot: {
      title: 'Rain clip.mp4',
      note: 'Selected from resource library.',
      input_hash: 'resource:42',
      content_unit_id: 'cu_scene',
      output_kind: 'video',
      prompt_text: 'Render the scene.',
    },
    createdAt: (calls[1].payload as { createdAt: string }).createdAt,
  })
  assert.equal(result.message, '已创建资源候选 Rain clip.mp4')
  assert.equal(result.focusNodeId, undefined)
  assert.deepEqual(result.createdCandidates, [{
    contentUnitId: 'cu_scene',
    candidate: {
      id: 'resource_candidate_test',
      title: '候选 1',
      resourceId: 42,
      resourceKind: 'video',
      inputHash: 'resource:42',
      source: 'resource_library',
      status: 'imported',
      outputs: [{ kind: 'video', resource_id: 42, mime_type: 'video/mp4' }],
      promptSnapshot: {
        input_hash: 'resource:42',
      },
      selected: false,
      notes: 'imported',
    },
  }])
})

test('content canvas existing resource creates a resource library content candidate without uploading', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    createContentUnitCandidate: async (payload: unknown) => {
      calls.push({ kind: 'createContentUnitCandidate', payload })
      return {
        id: 'resource_candidate_existing',
        source: 'resource_library',
        status: 'imported',
        outputs: [{ kind: 'image', resource_id: 77, mime_type: 'image/png' }],
        prompt_snapshot: {
          input_hash: 'resource:77',
        },
      }
    },
  } as never
  const contentUnit = nodeFixture({
    id: 'content_unit:cu_asset',
    entityKey: 'cu_asset',
    kind: 'content_unit',
    title: 'Asset render',
    subtitle: 'image',
    record: {
      output_kind: 'image',
      edit_prompt: 'Use a selected reference.',
    },
    position: { x: 0, y: 0 },
  })

  const result = await createCandidateFromResourceForContentUnit(7, contentUnit, {
    id: 77,
    name: 'Reference.png',
    type: 'image',
    mimeType: 'image/png',
  }, undefined, gateway)

  assert.deepEqual(calls.map((call) => call.kind), ['createContentUnitCandidate'])
  assert.deepEqual((calls[0].payload as { outputs: unknown[] }).outputs, [{ kind: 'image', resource_id: 77, mime_type: 'image/png' }])
  assert.equal((calls[0].payload as { promptSnapshot: Record<string, unknown> }).promptSnapshot.input_hash, 'resource:77')
  assert.equal(result.message, '已创建资源候选 Reference.png')
  assert.equal(result.focusNodeId, undefined)
  assert.deepEqual(result.createdCandidates?.[0]?.candidate, {
    id: 'resource_candidate_existing',
    title: '候选 1',
    resourceId: 77,
    resourceKind: 'image',
    inputHash: 'resource:77',
    source: 'resource_library',
    status: 'imported',
    outputs: [{ kind: 'image', resource_id: 77, mime_type: 'image/png' }],
    promptSnapshot: {
      input_hash: 'resource:77',
    },
    selected: false,
    notes: 'imported',
  })
})

test('content canvas selecting an inspector candidate keeps focus on the current content unit surface', async () => {
  const calls: Array<unknown> = []
  const gateway = {
    selectContentUnitCandidate: async (payload: unknown) => {
      calls.push(payload)
    },
  } as never
  const contentUnit = nodeFixture({
    id: 'content_unit:cu_asset',
    entityKey: 'cu_asset',
    kind: 'content_unit',
    title: 'Asset render',
    subtitle: 'image',
    record: {},
  })

  const result = await selectContentUnitCandidateFromCanvas(7, contentUnit, {
    id: 'resource_candidate_existing',
    title: '候选 1',
    resourceId: 77,
    resourceKind: 'image',
    inputHash: 'resource:77',
    source: 'resource_library',
    selected: false,
    notes: 'imported',
  }, gateway)

  assert.equal(result.focusNodeId, undefined)
  assert.deepEqual(calls, [{
    projectId: 7,
    contentUnitId: 'cu_asset',
    candidateId: 'resource_candidate_existing',
    resourceId: 77,
    reason: 'content_source_workspace_selection',
  }])
  assert.deepEqual(result.changedNodeIds, ['content_unit:cu_asset', 'candidate:cu_asset:resource_candidate_existing'])
  assert.equal(result.createdCandidates, undefined)
  assert.deepEqual(result.selectedCandidates, [{ contentUnitId: 'cu_asset', candidateId: 'resource_candidate_existing' }])
})

test('content canvas selecting a candidate node does not refocus the candidate detail', async () => {
  const calls: Array<unknown> = []
  const gateway = {
    selectContentUnitCandidate: async (payload: unknown) => {
      calls.push(payload)
    },
  } as never
  const candidateNode = nodeFixture({
    id: 'candidate:cu_asset:resource_candidate_existing',
    entityKey: 'resource_candidate_existing',
    kind: 'candidate',
    title: '候选 1',
    subtitle: '已选择候选',
    record: {
      ownerContentUnitId: 'cu_asset',
      ownerContentUnitNodeId: 'content_unit:cu_asset',
      resourceId: 77,
      resourceKind: 'image',
      source: 'resource_library',
      notes: 'imported',
    },
  })

  const result = await selectCandidateNodeFromCanvas(7, candidateNode, gateway)

  assert.equal(result.focusNodeId, 'content_unit:cu_asset')
  assert.deepEqual(calls, [{
    projectId: 7,
    contentUnitId: 'cu_asset',
    candidateId: 'resource_candidate_existing',
    resourceId: 77,
    reason: 'content_source_workspace_selection',
  }])
  assert.equal(result.createdCandidates, undefined)
  assert.deepEqual(result.selectedCandidates, [{ contentUnitId: 'cu_asset', candidateId: 'resource_candidate_existing' }])
})

test('content canvas asset creation also ensures an asset_ref content unit', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    service: {
      querySettings: async () => [],
      queryAssets: async () => ({ assets: [] }),
      upsertSetting: async () => ({ record: {}, path: '' }),
      updateContentUnitEditPrompt: async () => ({ record: {}, path: '' }),
    },
    loadContentSourceWorkspaceData: async () => ({
      source: 'workspace',
      hierarchyTree: [],
      previewMoments: [],
      contentUnitCandidates: {},
      expressionUnitsByMoment: {},
      audioCuesByMoment: {},
      expressionUnitWorkspaceDetails: {},
      assetReferenceUnits: {},
    }),
    createProduction: async () => undefined,
    createSegment: async () => undefined,
    createSceneMoment: async () => undefined,
    createExpressionUnit: async () => undefined,
    updateExpressionUnit: async () => undefined,
    createAsset: async (payload: unknown) => {
      calls.push({ kind: 'createAsset', payload })
      return {
        path: 'settings/hero/states/day/assets/phone/asset.json',
        record: { id: 'phone' },
      }
    },
    ensureContentUnitForEntity: async (payload: unknown) => {
      calls.push({ kind: 'ensureContentUnitForEntity', payload })
      return {
        path: 'content_units/cu_asset_phone/content_unit.json',
        record: { id: 'cu_asset_phone' },
      }
    },
    createContentUnitCandidate: async () => ({}),
    selectContentUnitCandidate: async () => undefined,
    writeHierarchyNode: async () => undefined,
  } as never
  const state = nodeFixture({
    id: 'state:day',
    entityKey: 'day',
    kind: 'state',
    title: 'Day state',
    sourcePath: 'settings/hero/states/day/setting_state.json',
    record: {
      setting_id: 'hero',
    },
    position: { x: 0, y: 0 },
  })

  const result = await createChildContentCanvasNode(7, state, 'asset', {
    input: { id: 'phone', title: 'Phone' },
  }, gateway)

  assert.deepEqual(calls.map((call) => call.kind), ['createAsset', 'ensureContentUnitForEntity'])
  assert.equal(result.message, '已创建素材并确保创作片段')
  assert.deepEqual(calls[0].payload, {
    id: 'phone',
    title: 'Phone',
    settingId: 'hero',
    settingStateId: 'day',
    slot: 'phone',
    assetKind: 'image',
    promptHint: '从设定状态「Day state」创建。',
  })
  assert.deepEqual(calls[1], {
    kind: 'ensureContentUnitForEntity',
    payload: {
    targetKind: 'asset',
    targetRef: 'phone',
    id: 'cu_asset_phone',
    title: 'Phone 创作片段',
    contentUnitType: 'asset_ref',
    outputKind: 'image',
    description: '从编排画布基于素材「Phone」创建。',
    prompt: '为设定状态「Day state」下的素材「Phone」生成可复用参考图。',
    modelIntent: {
      source: 'content_canvas',
      asset_id: 'phone',
      state_id: 'day',
      state_node_id: 'state:day',
    },
    },
  })
})

test('content canvas issue view can filter work items by actor and severity', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'content_unit:agent', entityKey: 'agent', kind: 'content_unit', title: 'Agent unit', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'content_unit:human', entityKey: 'human', kind: 'content_unit', title: 'Human unit', position: { x: 0, y: 180 } }),
      nodeFixture({ id: 'actor:agent', entityKey: 'agent', kind: 'actor', title: 'Agent', position: { x: 600, y: 0 } }),
      nodeFixture({ id: 'actor:human', entityKey: 'human', kind: 'actor', title: '人工', position: { x: 600, y: 180 } }),
      nodeFixture({
        id: 'work_item:agent',
        entityKey: 'agent',
        kind: 'work_item',
        title: 'Agent work',
        position: { x: 900, y: 0 },
        status: 'missing',
        record: { recommendedActor: 'agent', severity: 'blocking' },
      }),
      nodeFixture({
        id: 'work_item:human',
        entityKey: 'human',
        kind: 'work_item',
        title: 'Human work',
        position: { x: 900, y: 180 },
        status: 'active',
        record: { recommendedActor: 'human', severity: 'warning' },
      }),
    ],
    edges: [
      { id: 'agent-actor', source: 'actor:agent', target: 'work_item:agent', kind: 'reference', relation: 'actor_work_item' },
      { id: 'human-actor', source: 'actor:human', target: 'work_item:human', kind: 'reference', relation: 'actor_work_item' },
      { id: 'agent-target', source: 'work_item:agent', target: 'content_unit:agent', kind: 'reference', relation: 'work_item_target' },
      { id: 'human-target', source: 'work_item:human', target: 'content_unit:human', kind: 'reference', relation: 'work_item_target' },
    ],
  })

  const plan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'issues',
    selectedNodeId: null,
    impactByNodeId: {},
    issueActorFilter: 'agent',
    issueSeverityFilter: 'blocking',
  })

  assert.deepEqual(plan.graph.nodes.map((node) => node.id), ['content_unit:agent', 'actor:agent', 'work_item:agent'])
  assert.deepEqual(plan.graph.edges.map((edge) => edge.id), ['agent-actor', 'agent-target'])
})

test('content canvas issue view can filter work items by target kind', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Unit 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Asset 1', position: { x: 0, y: 180 } }),
      nodeFixture({ id: 'actor:agent', entityKey: 'agent', kind: 'actor', title: 'Agent', position: { x: 600, y: 0 } }),
      nodeFixture({
        id: 'work_item:unit',
        entityKey: 'unit',
        kind: 'work_item',
        title: 'Unit work',
        position: { x: 900, y: 0 },
        status: 'missing',
        record: { recommendedActor: 'agent', severity: 'blocking', targetKind: 'content_unit' },
      }),
      nodeFixture({
        id: 'work_item:asset',
        entityKey: 'asset',
        kind: 'work_item',
        title: 'Asset work',
        position: { x: 900, y: 180 },
        status: 'active',
        record: { recommendedActor: 'agent', severity: 'blocking', targetKind: 'asset' },
      }),
    ],
    edges: [
      { id: 'unit-actor', source: 'actor:agent', target: 'work_item:unit', kind: 'reference', relation: 'actor_work_item' },
      { id: 'asset-actor', source: 'actor:agent', target: 'work_item:asset', kind: 'reference', relation: 'actor_work_item' },
      { id: 'unit-target', source: 'work_item:unit', target: 'content_unit:1', kind: 'reference', relation: 'work_item_target' },
      { id: 'asset-target', source: 'work_item:asset', target: 'asset:1', kind: 'reference', relation: 'work_item_target' },
    ],
  })

  const plan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'issues',
    selectedNodeId: null,
    impactByNodeId: {},
    issueTargetKindFilter: 'asset',
  })

  assert.deepEqual(plan.graph.nodes.map((node) => node.id), ['asset:1', 'actor:agent', 'work_item:asset'])
  assert.deepEqual(plan.graph.edges.map((edge) => edge.id), ['asset-actor', 'asset-target'])
})

test('content canvas view plan filters semantic node statuses', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({
        id: 'content_unit:empty',
        entityKey: 'empty',
        kind: 'content_unit',
        title: 'Needs candidate unit',
        position: { x: 0, y: 0 },
        candidates: [],
      }),
      nodeFixture({
        id: 'candidate:selected',
        entityKey: 'selected',
        kind: 'candidate',
        title: 'Selected candidate',
        position: { x: 360, y: 0 },
        status: 'ready',
        record: { selected: true },
      }),
      nodeFixture({
        id: 'work_item:stale',
        entityKey: 'stale',
        kind: 'work_item',
        title: 'Review stale selection',
        position: { x: 720, y: 0 },
        record: { kind: 'stale_selection', status: 'open' },
      }),
      nodeFixture({
        id: 'work_item:missing',
        entityKey: 'missing',
        kind: 'work_item',
        title: 'Generate missing candidate',
        position: { x: 720, y: 180 },
        status: 'missing',
        record: { kind: 'missing_candidate', status: 'blocked' },
      }),
    ],
    edges: [
      { id: 'unit-candidate', source: 'content_unit:empty', target: 'candidate:selected', kind: 'reference', relation: 'content_unit_candidate' },
    ],
  })

  const selected = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    statusFilter: 'selected',
    mode: 'dependency',
    selectedNodeId: 'content_unit:empty',
    impactByNodeId: {},
  })
  const stale = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    statusFilter: 'stale',
    mode: 'issues',
    selectedNodeId: null,
    impactByNodeId: {},
  })
  const needsCandidate = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    statusFilter: 'needs_candidate',
    mode: 'dependency',
    selectedNodeId: null,
    impactByNodeId: {},
  })
  const missing = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    statusFilter: 'missing',
    mode: 'issues',
    selectedNodeId: null,
    impactByNodeId: {},
  })

  assert.deepEqual(selected.graph.nodes.map((node) => node.id), [])
  assert.deepEqual(stale.graph.nodes.map((node) => node.id), ['work_item:stale'])
  assert.deepEqual(needsCandidate.graph.nodes.map((node) => node.id), ['content_unit:empty', 'work_item:missing'])
  assert.deepEqual(missing.graph.nodes.map((node) => node.id), ['work_item:missing'])
})

test('content canvas asset trace keeps dependent content unit candidates embedded', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'asset:phone', entityKey: 'phone', kind: 'asset', title: 'Phone asset', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'content_unit:render', entityKey: 'render', kind: 'content_unit', title: 'Render unit', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'candidate:render:cand', entityKey: 'cand', kind: 'candidate', title: 'Candidate render', position: { x: 720, y: 0 } }),
      nodeFixture({ id: 'selection:render:cand', entityKey: 'render:cand', kind: 'selection', title: 'Selection', position: { x: 1080, y: 0 } }),
      nodeFixture({ id: 'resource:9', entityKey: '9', kind: 'resource', title: 'Resource 9', position: { x: 1440, y: 0 } }),
    ],
    edges: [
      { id: 'render-asset', source: 'content_unit:render', target: 'asset:phone', kind: 'reference', relation: 'content_unit_asset' },
      { id: 'render-candidate', source: 'content_unit:render', target: 'candidate:render:cand', kind: 'reference', relation: 'content_unit_candidate' },
      { id: 'selection-candidate', source: 'selection:render:cand', target: 'candidate:render:cand', kind: 'reference', relation: 'selection_candidate' },
      { id: 'candidate-resource', source: 'candidate:render:cand', target: 'resource:9', kind: 'reference', relation: 'candidate_resource' },
    ],
  })

  const plan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: 'asset:phone',
    impactByNodeId: {},
    largeGraphNodeThreshold: 1,
  })

  assert.deepEqual(plan.graph.nodes.map((node) => node.id), [
    'asset:phone',
    'content_unit:render',
  ])
  assert.deepEqual(plan.graph.edges.map((edge) => edge.id), ['render-asset'])
})

test('content canvas prompt references exclude the current owner from scoped candidates', () => {
  const viewModel = buildContentCanvasWorkspaceViewModel({
    projectData: {
      projectId: 7,
      project: null,
      productions: [],
      segments: [],
      sceneMoments: [],
      storyboards: [],
      expressionUnits: [],
      contentUnits: [
        entityFixture('content_unit', 'cu_phone', 'content_units/cu_phone/content_unit.json', {
          id: 'cu_phone',
          title: 'Phone render',
          content_unit_type: 'asset_ref',
          output_kind: 'image',
          asset_ref: 'settings/hero/states/day/assets/phone/asset.json',
          edit_prompt: { text: 'Render {{asset:watch}}' },
        }),
      ],
      keyframes: [],
      settings: [entityFixture('setting', 'hero', 'settings/hero/setting.json', { id: 'hero', title: 'Hero' })],
      settingStates: [entityFixture('setting_state', 'day', 'settings/hero/states/day/setting_state.json', { id: 'day', setting_id: 'hero', title: 'Day' })],
      assets: [
        entityFixture('asset', 'phone', 'settings/hero/states/day/assets/phone/asset.json', { id: 'phone', setting_id: 'hero', setting_state_id: 'day', title: 'Phone' }),
        entityFixture('asset', 'watch', 'settings/hero/states/day/assets/watch/asset.json', { id: 'watch', setting_id: 'hero', setting_state_id: 'day', title: 'Watch' }),
      ],
      audioCues: [],
      contentUnitCandidates: {
        cu_phone: [{
          id: 'cand_a',
          title: 'Candidate A',
          resourceId: 42,
          resourceKind: 'image',
          source: 'backend',
          selected: true,
          notes: 'Selected candidate',
        }],
      },
    },
    activeKind: 'all',
    activeCanvasNodeId: 'asset:phone',
    activeProductionId: null,
    activeSceneId: null,
    activeSettingId: 'setting:hero',
    selection: { kind: 'asset', nodeId: 'asset:phone' },
    settingQuery: '',
  })

  assert.deepEqual(viewModel.scenePromptReferenceNodes.map((node) => node.id), [
    'asset:watch',
    'candidate:cu_phone:cand_a',
    'resource:42',
  ])
  assert.equal(
    appendContentNodeReferenceToPrompt('', viewModel.scenePromptReferenceNodes[1]!),
    '{{candidate:cand_a}}',
  )
  assert.equal(
    appendContentNodeReferenceToPrompt('', viewModel.scenePromptReferenceNodes[2]!),
    '{{resource:42}}',
  )
})

test('content canvas workspace keeps inspector selection separate from entered canvas node', () => {
  const viewModel = buildContentCanvasWorkspaceViewModel({
    projectData: {
      projectId: 7,
      project: null,
      productions: [],
      segments: [],
      sceneMoments: [
        entityFixture('scene_moment', 'scene_1', 'scenes/scene_1/scene_moment.json', {
          id: 'scene_1',
          title: 'Scene One',
        }),
      ],
      expressionUnits: [
        entityFixture('expression_unit', 'expr_1', 'scenes/scene_1/expression_units/expr_1/expression_unit.json', {
          id: 'expr_1',
          scene_moment_id: 'scene_1',
          title: 'Expression One',
        }),
      ],
      storyboards: [],
      keyframes: [],
      settings: [],
      settingStates: [],
      assets: [],
      audioCues: [],
      contentUnits: [],
      contentUnitCandidates: {},
    },
    activeKind: 'all',
    activeCanvasNodeId: 'scene_moment:scene_1',
    activeProductionId: null,
    activeSceneId: 'scene_moment:scene_1',
    activeSettingId: null,
    selection: { kind: 'other', nodeId: 'expression_unit:expr_1' },
    settingQuery: '',
  })

  assert.equal(viewModel.activeCanvasNode?.id, 'scene_moment:scene_1')
  assert.equal(viewModel.inspectorSelection.kind, 'other')
  assert.equal(viewModel.inspectorSelection.node.id, 'expression_unit:expr_1')
})

test('content canvas workspace tracks the entered node without stage timeline state', () => {
  const projectData = {
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [
      entityFixture('scene_moment', 'scene_1', 'scenes/scene_1/scene_moment.json', {
        id: 'scene_1',
        title: 'Scene One',
      }),
    ],
    expressionUnits: [
      entityFixture('expression_unit', 'expr_1', 'scenes/scene_1/expression_units/expr_1/expression_unit.json', {
        id: 'expr_1',
        scene_moment_id: 'scene_1',
        title: 'Expression One',
      }),
    ],
    storyboards: [],
    keyframes: [],
    settings: [],
    settingStates: [],
    assets: [],
    audioCues: [],
    contentUnits: [],
    contentUnitCandidates: {},
  }

  const viewModel = buildContentCanvasWorkspaceViewModel({
    projectData,
    activeKind: 'all',
    activeCanvasNodeId: 'expression_unit:expr_1',
    activeProductionId: null,
    activeSceneId: 'scene_moment:scene_1',
    activeSettingId: null,
    selection: { kind: 'other', nodeId: 'expression_unit:expr_1' },
    settingQuery: '',
  })

  assert.equal(viewModel.activeCanvasNode?.id, 'expression_unit:expr_1')
  assert.equal(viewModel.inspectorSelection.kind, 'other')
  assert.equal(viewModel.inspectorSelection.node.id, 'expression_unit:expr_1')
})

test('content canvas graph includes setting state and audio cue reference constraints', () => {
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: entityFixture('project', '7', 'project.json', { id: 7, title: 'Project' }),
    productions: [entityFixture('production', 'prod', 'productions/prod/production.json', { id: 'prod', title: 'Prod' })],
    segments: [entityFixture('segment', 'seg', 'productions/prod/segments/seg/segment.json', { id: 'seg', production_id: 'prod', title: 'Seg' })],
    sceneMoments: [entityFixture('scene_moment', 'scene', 'productions/prod/segments/seg/scene_moments/scene/scene_moment.json', { id: 'scene', segment_id: 'seg', title: 'Scene' })],
    storyboards: [entityFixture('storyboard', 'main', 'productions/prod/segments/seg/scene_moments/scene/expression_units/shot/storyboards/main/storyboard.json', {
      id: 'main',
      expression_unit_id: 'shot',
      title: 'Main board',
      setting_refs: [{ setting_id: 'hero', setting_state_id: 'rain' }],
    })],
    expressionUnits: [entityFixture('expression_unit', 'shot', 'productions/prod/segments/seg/scene_moments/scene/expression_units/shot/expression_unit.json', { id: 'shot', scene_moment_id: 'scene', kind: 'shot', title: 'Shot expression' })],
    contentUnits: [],
    keyframes: [],
    assets: [entityFixture('asset', 'thunder', 'settings/hero/states/rain/assets/thunder/asset.json', {
      id: 'thunder',
      setting_id: 'hero',
      setting_state_id: 'rain',
      title: 'Thunder ref',
    })],
    settings: [entityFixture('setting', 'hero', 'settings/hero/setting.json', { id: 'hero', title: 'Hero' })],
    settingStates: [entityFixture('setting_state', 'rain', 'settings/hero/states/rain/setting_state.json', { id: 'rain', setting_id: 'hero', title: 'Rain panic' })],
    audioCues: [entityFixture('audio_cue', 'phone_buzz', 'productions/prod/segments/seg/scene_moments/scene/audio_cues/phone_buzz/audio_cue.json', {
      id: 'phone_buzz',
      title: 'Phone buzz',
      scope_ref: 'productions/prod/segments/seg/scene_moments/scene',
      storyboard_ref: 'productions/prod/segments/seg/scene_moments/scene/expression_units/shot/storyboards/main',
      asset_refs: ['thunder'],
    })],
    contentUnitCandidates: {},
  })

  assert.ok(graph.nodes.find((node) => node.id === 'state:rain'))
  assert.ok(graph.nodes.find((node) => node.id === 'audio_cue:phone_buzz'))
  assert.ok(graph.edges.find((edge) => edge.id === 'setting:hero->state:rain'))
  assert.ok(graph.edges.find((edge) => edge.id === 'state:rain->asset:thunder'))
  assert.ok(!graph.edges.find((edge) => edge.id === 'setting:hero->asset:thunder'))
  assert.ok(!graph.edges.find((edge) => edge.relation === 'setting_state_reference' && edge.source === 'asset:thunder' && edge.target === 'state:rain'))
  assert.ok(graph.edges.find((edge) => edge.id === 'scene_moment:scene->audio_cue:phone_buzz'))
  assert.ok(graph.edges.find((edge) => edge.kind === 'hierarchy' && edge.source === 'scene_moment:scene' && edge.target === 'expression_unit:shot'))
  assert.ok(graph.edges.find((edge) => edge.kind === 'hierarchy' && edge.source === 'expression_unit:shot' && edge.target === 'storyboard:main'))
  assert.ok(graph.edges.find((edge) => edge.relation === 'audio_cue_storyboard' && edge.source === 'audio_cue:phone_buzz' && edge.target === 'storyboard:main'))
  assert.ok(!graph.edges.find((edge) => String(edge.relation) === 'audio_cue_shot'))
  assert.ok(graph.edges.find((edge) => edge.relation === 'audio_cue_asset' && edge.source === 'audio_cue:phone_buzz' && edge.target === 'asset:thunder'))
  assert.ok(graph.edges.find((edge) => edge.relation === 'setting_state_reference' && edge.source === 'storyboard:main' && edge.target === 'state:rain'))
})

test('content canvas graph derives sequence edges for siblings without changing hierarchy', () => {
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: entityFixture('project', '7', 'project.json', { id: 7, title: 'Project' }),
    productions: [entityFixture('production', 'prod', 'productions/prod/production.json', { id: 'prod', title: 'Prod' })],
    segments: [entityFixture('segment', 'seg', 'productions/prod/segments/seg/segment.json', { id: 'seg', production_id: 'prod', title: 'Seg' })],
    sceneMoments: [entityFixture('scene_moment', 'scene', 'productions/prod/segments/seg/scene_moments/scene/scene_moment.json', { id: 'scene', segment_id: 'seg', title: 'Scene' })],
    storyboards: [],
    expressionUnits: [
      entityFixture('expression_unit', 'shot_b', 'productions/prod/segments/seg/scene_moments/scene/expression_units/shot_b/expression_unit.json', { id: 'shot_b', scene_moment_id: 'scene', kind: 'shot', order: 2, title: 'Shot B' }),
      entityFixture('expression_unit', 'shot_a', 'productions/prod/segments/seg/scene_moments/scene/expression_units/shot_a/expression_unit.json', { id: 'shot_a', scene_moment_id: 'scene', kind: 'shot', order: 1, title: 'Shot A' }),
    ],
    contentUnits: [],
    keyframes: [],
    assets: [],
    settings: [],
    contentUnitCandidates: {},
  })
  const structurePlan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'structure',
    selectedNodeId: null,
    impactByNodeId: {},
  })
  const shotLedger = buildContentCanvasRelationLedger(graph, graph.nodes.find((node) => node.id === 'expression_unit:shot_b') ?? null)

  assert.ok(graph.edges.find((edge) => edge.kind === 'hierarchy' && edge.source === 'scene_moment:scene' && edge.target === 'expression_unit:shot_a'))
  assert.ok(graph.edges.find((edge) => edge.kind === 'hierarchy' && edge.source === 'scene_moment:scene' && edge.target === 'expression_unit:shot_b'))
  assert.ok(graph.edges.find((edge) => edge.kind === 'sequence' && edge.source === 'expression_unit:shot_a' && edge.target === 'expression_unit:shot_b'))
  assert.equal(graph.edges.find((edge) => edge.kind === 'sequence' && edge.source === 'expression_unit:shot_a' && edge.target === 'expression_unit:shot_b')?.type, 'sequence')
  assert.ok(!structurePlan.graph.edges.find((edge) => edge.kind === 'sequence'))
  assert.deepEqual(structurePlan.collapsedSummariesByNodeId['scene_moment:scene'], [
    { kind: 'expression_unit', count: 2, label: '表达' },
  ])
  assert.deepEqual(shotLedger.upstream.map((item) => [item.nodeId, item.relation]), [
    ['scene_moment:scene', '结构上级'],
    ['expression_unit:shot_a', '上一项'],
  ])
})

test('content canvas setting group renders only structurally mounted state and asset nodes', () => {
  const setting = nodeFixture({ id: 'setting:hero', entityKey: 'hero', kind: 'setting', title: 'Hero', position: { x: 0, y: 0 } })
  const mountedState = nodeFixture({ id: 'state:day', entityKey: 'day', kind: 'state', title: 'Day state', position: { x: 0, y: 0 } })
  const referencedState = nodeFixture({ id: 'state:rain', entityKey: 'rain', kind: 'state', title: 'Rain state', position: { x: 0, y: 0 } })
  const mountedAsset = nodeFixture({ id: 'asset:phone', entityKey: 'phone', kind: 'asset', title: 'Phone', position: { x: 0, y: 0 } })
  const referencedAsset = nodeFixture({ id: 'asset:thunder', entityKey: 'thunder', kind: 'asset', title: 'Thunder', position: { x: 0, y: 0 } })
  const graph = graphFixture({
    nodes: [setting, mountedState, referencedState, mountedAsset, referencedAsset],
    edges: [
      { id: 'setting-state', source: setting.id, target: mountedState.id, kind: 'hierarchy' },
      { id: 'state-asset', source: mountedState.id, target: mountedAsset.id, kind: 'hierarchy' },
      { id: 'story-state-ref', source: 'storyboard:main', target: referencedState.id, kind: 'reference', relation: 'setting_state_reference' },
      { id: 'audio-asset-ref', source: 'audio_cue:buzz', target: referencedAsset.id, kind: 'reference', relation: 'audio_cue_asset' },
    ],
  })
  const group = sceneSettingGroupFromNode(setting, contentCanvasWorkspaceIndex(graph), { x: 24, y: -16 })

  assert.equal(group.x, 24)
  assert.equal(group.y, -16)
  assert.deepEqual(group.states.map((item) => [item.state.id, item.assets.map((asset) => asset.id)]), [
    ['state:day', ['asset:phone']],
  ])
})

test('content canvas graph derives shot expression constraints into storyboard trace', () => {
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: entityFixture('project', '7', 'project.json', { id: 7, title: 'Project' }),
    productions: [entityFixture('production', 'prod', 'productions/prod/production.json', { id: 'prod', title: 'Prod' })],
    segments: [entityFixture('segment', 'seg', 'productions/prod/segments/seg/segment.json', { id: 'seg', production_id: 'prod', title: 'Seg' })],
    sceneMoments: [entityFixture('scene_moment', 'scene', 'productions/prod/segments/seg/scene_moments/scene/scene_moment.json', { id: 'scene', segment_id: 'seg', title: 'Scene' })],
    expressionUnits: [entityFixture('expression_unit', 'expr', 'productions/prod/segments/seg/scene_moments/scene/expression_units/expr/expression_unit.json', {
      id: 'expr',
      scene_moment_id: 'scene',
      title: 'Hesitation',
      kind: 'shot',
      span: { storyboard_refs: ['main'] },
    })],
    storyboards: [entityFixture('storyboard', 'main', 'productions/prod/segments/seg/scene_moments/scene/expression_units/expr/storyboards/main/storyboard.json', { id: 'main', expression_unit_id: 'expr', title: 'Main board' })],
    contentUnits: [entityFixture('content_unit', 'cu', 'productions/prod/segments/seg/scene_moments/scene/content_units/cu/content_unit.json', {
      id: 'cu',
      scene_moment_id: 'scene',
      title: 'Render unit',
      expression_unit_ref: 'expr',
    })],
    keyframes: [],
    assets: [],
    settings: [],
    contentUnitCandidates: {},
  })
  const trace = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: 'expression_unit:expr',
    impactByNodeId: {},
    largeGraphNodeThreshold: 1,
  })
  const expressionLedger = buildContentCanvasRelationLedger(graph, graph.nodes.find((node) => node.id === 'expression_unit:expr') ?? null)
  const contentUnitLedger = buildContentCanvasRelationLedger(graph, graph.nodes.find((node) => node.id === 'content_unit:cu') ?? null)

  assert.ok(graph.edges.find((edge) => edge.relation === 'expression_unit_storyboard' && edge.source === 'expression_unit:expr' && edge.target === 'storyboard:main'))
  assert.ok(graph.edges.find((edge) => edge.relation === 'expression_unit_content_unit' && edge.source === 'expression_unit:expr' && edge.target === 'content_unit:cu'))
  assert.equal(graph.edges.find((edge) => edge.relation === 'expression_unit_content_unit')?.type, 'constrains')
  assert.ok(trace.graph.nodes.find((node) => node.id === 'expression_unit:expr'))
  assert.deepEqual(expressionLedger.upstream.map((item) => [item.nodeId, item.relation]), [
    ['scene_moment:scene', '结构上级'],
  ])
  assert.deepEqual(contentUnitLedger.upstream.map((item) => [item.nodeId, item.relation]), [
    ['expression_unit:expr', '表达输入'],
    ['scene_moment:scene', '结构上级'],
  ])
})

test('content canvas shot expression trace keeps audio cue and setting state constraints visible', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'expression_unit:1', entityKey: '1', kind: 'expression_unit', title: 'Shot 1', position: { x: 0, y: 0 }, record: { kind: 'shot' } }),
      nodeFixture({ id: 'storyboard:1', entityKey: '1', kind: 'storyboard', title: 'Storyboard 1', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'audio_cue:1', entityKey: '1', kind: 'audio_cue', title: 'Phone buzz', position: { x: 360, y: 180 } }),
      nodeFixture({ id: 'state:rain', entityKey: 'rain', kind: 'state', title: 'Rain panic', position: { x: 720, y: 0 } }),
    ],
    edges: [
      { id: 'expression-board', source: 'expression_unit:1', target: 'storyboard:1', kind: 'hierarchy' },
      { id: 'audio-board', source: 'audio_cue:1', target: 'storyboard:1', kind: 'reference', relation: 'audio_cue_storyboard' },
      { id: 'board-state', source: 'storyboard:1', target: 'state:rain', kind: 'reference', relation: 'setting_state_reference' },
    ],
  })

  const plan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: 'expression_unit:1',
    impactByNodeId: {},
    largeGraphNodeThreshold: 1,
  })
  const expressionLedger = buildContentCanvasRelationLedger(graph, graph.nodes[0])
  const storyboardLedger = buildContentCanvasRelationLedger(graph, graph.nodes[1])

  assert.deepEqual(plan.graph.nodes.map((node) => node.id), ['expression_unit:1', 'storyboard:1', 'audio_cue:1', 'state:rain'])
  assert.deepEqual(expressionLedger.upstream.map((item) => [item.nodeId, item.relation]), [
  ])
  assert.deepEqual(storyboardLedger.upstream.map((item) => [item.nodeId, item.relation]), [
    ['audio_cue:1', '声音约束'],
    ['state:rain', '设定状态输入'],
    ['expression_unit:1', '结构上级'],
  ])
})

test('creative canvas model uses visual nodes as cards and keeps content units/candidates out of the graph', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'project:1', entityKey: '1', kind: 'project', title: 'Project', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'production:pilot', entityKey: 'pilot', kind: 'production', title: 'Pilot', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'segment:opening', entityKey: 'opening', kind: 'segment', title: 'Opening', position: { x: 0, y: 0 } }),
      nodeFixture({
        id: 'scene_moment:1',
        entityKey: '1',
        kind: 'scene_moment',
        title: 'Scene',
        position: { x: 0, y: 0 },
        generationTask: generationTaskFixture({ id: 'cu_scene', nodeId: 'content_unit:cu_scene' }),
      }),
      nodeFixture({ id: 'setting:hero', entityKey: 'hero', kind: 'setting', title: 'Hero', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'state:rain', entityKey: 'rain', kind: 'state', title: 'Rain state', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:phone', entityKey: 'phone', kind: 'asset', title: 'Phone', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'content_unit:cu_scene', entityKey: 'cu_scene', kind: 'content_unit', title: 'Scene render', position: { x: 0, y: 0 } }),
      nodeFixture({
        id: 'candidate:cu_scene:cand_a',
        entityKey: 'cand_a',
        kind: 'candidate',
        title: 'Candidate A',
        position: { x: 0, y: 0 },
        record: { id: 'cand_a', selected: true, resourceId: 42 },
      }),
      nodeFixture({ id: 'resource:42', entityKey: '42', kind: 'resource', title: 'Resource 42', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'selection:cu_scene:cand_a', entityKey: 'cu_scene:cand_a', kind: 'selection', title: 'Current', position: { x: 0, y: 0 } }),
    ],
    edges: [
      { id: 'project-production', source: 'project:1', target: 'production:pilot', kind: 'hierarchy' },
      { id: 'production-segment', source: 'production:pilot', target: 'segment:opening', kind: 'hierarchy' },
      { id: 'segment-scene', source: 'segment:opening', target: 'scene_moment:1', kind: 'hierarchy' },
      { id: 'setting-state', source: 'setting:hero', target: 'state:rain', kind: 'hierarchy' },
      { id: 'state-asset', source: 'state:rain', target: 'asset:phone', kind: 'hierarchy' },
      { id: 'scene-unit', source: 'scene_moment:1', target: 'content_unit:cu_scene', kind: 'reference', relation: 'expression_unit_content_unit' },
      { id: 'unit-asset', source: 'content_unit:cu_scene', target: 'asset:phone', kind: 'reference', relation: 'content_unit_asset' },
      { id: 'unit-candidate', source: 'content_unit:cu_scene', target: 'candidate:cu_scene:cand_a', kind: 'reference', relation: 'content_unit_candidate' },
      { id: 'candidate-resource', source: 'candidate:cu_scene:cand_a', target: 'resource:42', kind: 'reference', relation: 'candidate_resource' },
      { id: 'selection-candidate', source: 'selection:cu_scene:cand_a', target: 'candidate:cu_scene:cand_a', kind: 'reference', relation: 'selection_candidate' },
    ],
  })

  const creativeGraph = buildCreativeCanvasGraph(graph)
  const scopedGraph = buildCreativeCanvasGraph(graph, {
    nodeIds: ['production:pilot', 'segment:opening', 'setting:hero', 'state:rain', 'scene_moment:1', 'asset:phone'],
  })

  assert.deepEqual(creativeGraph.nodes.map((node) => [node.id, node.role, node.weight, node.selected]), [
    ['scene_moment:1', 'creative', 'primary', false],
    ['asset:phone', 'creative', 'normal', false],
  ])
  assert.deepEqual(scopedGraph.nodes.map((node) => node.id), ['scene_moment:1', 'asset:phone'])
  assert.deepEqual(creativeGraph.edges.map((edge) => [edge.id, edge.source, edge.target]), [
    ['asset:phone->scene_moment:1:content_unit_asset:creative-dependency', 'asset:phone', 'scene_moment:1'],
  ])
  assert.equal(isCreativeCanvasDependencyEdge(graph.edges.find((edge) => edge.id === 'unit-candidate')!), false)
  assert.equal(isCreativeCanvasDependencyEdge(graph.edges.find((edge) => edge.id === 'candidate-resource')!), false)
  assert.equal(isCreativeCanvasDependencyEdge({ id: 'unit-keyframe', source: 'content_unit:cu', target: 'keyframe:1', kind: 'reference', relation: 'content_unit_keyframe' }), true)
  assert.equal(isCreativeCanvasDependencyEdge({ id: 'unit-storyboard', source: 'content_unit:cu', target: 'storyboard:1', kind: 'reference', relation: 'content_unit_storyboard' }), true)
  assert.deepEqual(graph.nodes.filter((node) => !isCreativeCanvasVisibleNode(node)).map((node) => node.kind), [
    'project',
    'production',
    'segment',
    'setting',
    'state',
    'content_unit',
    'candidate',
    'resource',
    'selection',
  ])
})

test('creative canvas layout orders DAG sources before generated outputs and preserves pinned nodes', () => {
  const creativeGraph = buildCreativeCanvasGraph(graphFixture({
    nodes: [
      nodeFixture({
        id: 'scene_moment:1',
        entityKey: '1',
        kind: 'scene_moment',
        title: 'Scene',
        position: { x: 0, y: 0 },
        generationTask: generationTaskFixture({ id: 'cu_scene', nodeId: 'content_unit:cu_scene' }),
      }),
      nodeFixture({ id: 'content_unit:cu_scene', entityKey: 'cu_scene', kind: 'content_unit', title: 'Scene render', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:phone', entityKey: 'phone', kind: 'asset', title: 'Phone', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:lamp', entityKey: 'lamp', kind: 'asset', title: 'Lamp', position: { x: 0, y: 0 } }),
    ],
    edges: [
      { id: 'unit-asset', source: 'content_unit:cu_scene', target: 'asset:phone', kind: 'reference', relation: 'content_unit_asset' },
      { id: 'unit-asset-lamp', source: 'content_unit:cu_scene', target: 'asset:lamp', kind: 'reference', relation: 'content_unit_asset' },
    ],
  }))

  const arranged = layoutCreativeCanvas({ graph: creativeGraph })
  const result = layoutCreativeCanvas({
    graph: creativeGraph,
    pinnedPositions: { 'scene_moment:1': { x: 111, y: 222 } },
  })

  assert.equal(result.positions['scene_moment:1']?.x, 111)
  assert.equal(result.positions['scene_moment:1']?.y, 222)
  assert.ok((arranged.positions['asset:phone']?.x ?? 0) < (arranged.positions['scene_moment:1']?.x ?? 0))
  assert.ok((arranged.positions['scene_moment:1']?.x ?? 0) >= 420)
  assert.ok(Math.abs((result.positions['asset:lamp']?.y ?? 0) - (result.positions['asset:phone']?.y ?? 0)) >= 360)
  assert.ok(Math.min(arranged.positions['asset:phone']?.y ?? 0, arranged.positions['asset:lamp']?.y ?? 0) < (arranged.positions['scene_moment:1']?.y ?? 0))
  assert.ok(Math.max(arranged.positions['asset:phone']?.y ?? 0, arranged.positions['asset:lamp']?.y ?? 0) > (arranged.positions['scene_moment:1']?.y ?? 0))
})

test('creative canvas layout follows scene moment order within DAG columns', () => {
  const creativeGraph = buildCreativeCanvasGraph(graphFixture({
    nodes: [
      nodeFixture({
        id: 'scene_moment:first',
        entityKey: 'first',
        kind: 'scene_moment',
        title: 'Zeta scene',
        position: { x: 0, y: 760 },
        record: { order: 1 },
        generationTask: generationTaskFixture({ id: 'cu_first', nodeId: 'content_unit:cu_first' }),
      }),
      nodeFixture({
        id: 'scene_moment:second',
        entityKey: 'second',
        kind: 'scene_moment',
        title: 'Alpha scene',
        position: { x: 0, y: 0 },
        record: { order: 2 },
        generationTask: generationTaskFixture({ id: 'cu_second', nodeId: 'content_unit:cu_second' }),
      }),
      nodeFixture({ id: 'content_unit:cu_first', entityKey: 'cu_first', kind: 'content_unit', title: 'First render', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'content_unit:cu_second', entityKey: 'cu_second', kind: 'content_unit', title: 'Second render', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'expression_unit:first-shot', entityKey: 'first-shot', kind: 'expression_unit', title: 'First shot', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'keyframe:first-pose', entityKey: 'first-pose', kind: 'keyframe', title: 'First pose', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:z-first', entityKey: 'z-first', kind: 'asset', title: 'Z first asset', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:a-second', entityKey: 'a-second', kind: 'asset', title: 'A second asset', position: { x: 0, y: 0 } }),
    ],
    edges: [
      { id: 'first-scene-shot', source: 'scene_moment:first', target: 'expression_unit:first-shot', kind: 'hierarchy' },
      { id: 'first-shot-keyframe', source: 'expression_unit:first-shot', target: 'keyframe:first-pose', kind: 'hierarchy' },
      { id: 'first-asset', source: 'content_unit:cu_first', target: 'asset:z-first', kind: 'reference', relation: 'content_unit_asset' },
      { id: 'second-asset', source: 'content_unit:cu_second', target: 'asset:a-second', kind: 'reference', relation: 'content_unit_asset' },
    ],
  }))

  const arranged = layoutCreativeCanvas({ graph: creativeGraph }).positions

  assert.ok((arranged['scene_moment:first']?.y ?? 0) < (arranged['scene_moment:second']?.y ?? 0))
  assert.equal(arranged['scene_moment:first']?.x, arranged['scene_moment:second']?.x)
  assert.ok((arranged['asset:z-first']?.y ?? 0) < (arranged['asset:a-second']?.y ?? 0))
})

test('creative canvas only includes resources when they are prompt dependencies', () => {
  const creativeGraph = buildCreativeCanvasGraph(graphFixture({
    nodes: [
      nodeFixture({
        id: 'scene_moment:1',
        entityKey: '1',
        kind: 'scene_moment',
        title: 'Scene',
        position: { x: 0, y: 0 },
        generationTask: generationTaskFixture({ id: 'cu_scene', nodeId: 'content_unit:cu_scene' }),
      }),
      nodeFixture({ id: 'content_unit:cu_scene', entityKey: 'cu_scene', kind: 'content_unit', title: 'Scene render', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'resource:used', entityKey: 'used', kind: 'resource', title: 'Used Resource', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'resource:unused', entityKey: 'unused', kind: 'resource', title: 'Unused Resource', position: { x: 0, y: 0 } }),
    ],
    edges: [
      { id: 'unit-resource', source: 'resource:used', target: 'content_unit:cu_scene', kind: 'reference', relation: 'content_unit_resource' },
    ],
  }))

  assert.deepEqual(creativeGraph.nodes.map((node) => node.id), [
    'scene_moment:1',
    'resource:used',
  ])
  assert.deepEqual(creativeGraph.edges.map((edge) => [edge.source, edge.target]), [
    ['resource:used', 'scene_moment:1'],
  ])
})

test('content canvas snapshot derives raw resource prompt dependencies', () => {
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [entityFixture('scene_moment', 'scene', 'productions/prod/segments/seg/scene_moments/scene/scene_moment.json', { id: 'scene', title: 'Scene' })],
    expressionUnits: [],
    storyboards: [],
    contentUnits: [
      entityFixture('content_unit', 'cu_scene', 'content_units/cu_scene/content_unit.json', {
        id: 'cu_scene',
        title: 'Scene render',
        content_unit_type: 'scene_moment_ref',
        scene_moment_ref: 'scene',
        edit_prompt: { text: 'Use {{resource::42}} and @[resource:99] as references.' },
      }),
    ],
    keyframes: [],
    settings: [],
    settingStates: [],
    assets: [],
    audioCues: [],
    contentUnitCandidates: {},
  })
  const creativeGraph = buildCreativeCanvasGraph(graph)

  assert.ok(graph.nodes.find((node) => node.id === 'resource:42' && node.record.source === 'prompt_reference'))
  assert.ok(graph.nodes.find((node) => node.id === 'resource:99' && node.record.source === 'prompt_reference'))
  assert.ok(graph.edges.find((edge) => edge.source === 'resource:42' && edge.target === 'content_unit:cu_scene' && edge.relation === 'content_unit_resource'))
  assert.ok(graph.edges.find((edge) => edge.source === 'resource:99' && edge.target === 'content_unit:cu_scene' && edge.relation === 'content_unit_resource'))
  assert.deepEqual(creativeGraph.edges.map((edge) => [edge.source, edge.target]).filter(([, target]) => target === 'scene_moment:scene'), [
    ['resource:42', 'scene_moment:scene'],
    ['resource:99', 'scene_moment:scene'],
  ])
})

test('content canvas snapshot derives asset prompt dependencies into creative scene edges', () => {
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [entityFixture('scene_moment', 'scene', 'productions/prod/segments/seg/scene_moments/scene/scene_moment.json', { id: 'scene', title: 'Scene' })],
    expressionUnits: [],
    storyboards: [],
    contentUnits: [
      entityFixture('content_unit', 'cu_scene', 'content_units/cu_scene/content_unit.json', {
        id: 'cu_scene',
        title: 'Scene render',
        content_unit_type: 'scene_moment_ref',
        scene_moment_ref: 'scene',
        edit_prompt: {
          text: 'Keep continuity with {{asset::phone}}.',
          negative_text: 'Do not change {{asset:watch}}.',
        },
      }),
    ],
    keyframes: [],
    settings: [],
    settingStates: [],
    assets: [
      entityFixture('asset', 'phone', 'settings/hero/states/day/assets/phone/asset.json', { id: 'phone', title: 'Phone' }),
      entityFixture('asset', 'watch', 'settings/hero/states/day/assets/watch/asset.json', { id: 'watch', title: 'Watch' }),
    ],
    audioCues: [],
    contentUnitCandidates: {},
  })
  const creativeGraph = buildCreativeCanvasGraph(graph)

  assert.ok(graph.edges.find((edge) => edge.source === 'content_unit:cu_scene' && edge.target === 'asset:phone' && edge.relation === 'content_unit_asset'))
  assert.ok(graph.edges.find((edge) => edge.source === 'content_unit:cu_scene' && edge.target === 'asset:watch' && edge.relation === 'content_unit_asset'))
  assert.deepEqual(creativeGraph.edges.map((edge) => [edge.source, edge.target]).filter(([, target]) => target === 'scene_moment:scene'), [
    ['asset:phone', 'scene_moment:scene'],
    ['asset:watch', 'scene_moment:scene'],
  ])
})

test('content canvas snapshot keeps resource nodes unique across candidates and prompt references', () => {
  const graph = buildContentCanvasWorkspaceSnapshot({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [entityFixture('scene_moment', 'scene', 'productions/prod/segments/seg/scene_moments/scene/scene_moment.json', { id: 'scene', title: 'Scene' })],
    expressionUnits: [],
    storyboards: [],
    contentUnits: [
      entityFixture('content_unit', 'cu_scene', 'content_units/cu_scene/content_unit.json', {
        id: 'cu_scene',
        title: 'Scene render',
        content_unit_type: 'scene_moment_ref',
        scene_moment_ref: 'scene',
        edit_prompt: { text: 'Use {{resource::42}} twice with @[resource:42].' },
      }),
    ],
    keyframes: [],
    settings: [],
    settingStates: [],
    assets: [],
    audioCues: [],
    contentUnitCandidates: {
      cu_scene: [{
        id: 'cand_42',
        title: 'Candidate 42',
        selected: true,
        resourceId: 42,
        resourceKind: 'image',
        source: 'gpt-image-2',
      }],
    },
  })
  const creativeGraph = buildCreativeCanvasGraph(graph)

  assert.equal(graph.nodes.filter((node) => node.id === 'resource:42').length, 1)
  assert.equal(creativeGraph.nodes.filter((node) => node.id === 'resource:42').length, 1)
  assert.ok(graph.edges.find((edge) => edge.source === 'candidate:cu_scene:cand_42' && edge.target === 'resource:42' && edge.relation === 'candidate_resource'))
  assert.ok(graph.edges.find((edge) => edge.source === 'resource:42' && edge.target === 'content_unit:cu_scene' && edge.relation === 'content_unit_resource'))
})

test('creative canvas dependency adapter normalizes namespace and reference dependencies', () => {
  const nodes = [
    nodeFixture({ id: 'scene_moment:scene', entityKey: 'scene', kind: 'scene_moment', title: 'Scene', position: { x: 0, y: 0 } }),
    nodeFixture({ id: 'expression_unit:shot', entityKey: 'shot', kind: 'expression_unit', title: 'Shot', position: { x: 0, y: 0 } }),
    nodeFixture({ id: 'expression_unit:style', entityKey: 'style', kind: 'expression_unit', title: 'Style', position: { x: 0, y: 0 } }),
    nodeFixture({ id: 'asset:phone', entityKey: 'phone', kind: 'asset', title: 'Phone', position: { x: 0, y: 0 } }),
    nodeFixture({ id: 'keyframe:pose', entityKey: 'pose', kind: 'keyframe', title: 'Pose', position: { x: 0, y: 0 } }),
    nodeFixture({ id: 'storyboard:board', entityKey: 'board', kind: 'storyboard', title: 'Board', position: { x: 0, y: 0 } }),
    nodeFixture({ id: 'resource:42', entityKey: '42', kind: 'resource', title: 'Resource 42', position: { x: 0, y: 0 } }),
    nodeFixture({ id: 'content_unit:cu_scene', entityKey: 'cu_scene', kind: 'content_unit', title: 'Scene render', position: { x: 0, y: 0 } }),
  ]
  const dependencies = buildCreativeCanvasDependencyEdges({
    edges: [
      { id: 'scene-shot', source: 'scene_moment:scene', target: 'expression_unit:shot', kind: 'hierarchy' },
      { id: 'unit-asset', source: 'content_unit:cu_scene', target: 'asset:phone', kind: 'reference', relation: 'content_unit_asset' },
      { id: 'unit-keyframe', source: 'content_unit:cu_scene', target: 'keyframe:pose', kind: 'reference', relation: 'content_unit_keyframe' },
      { id: 'unit-resource', source: 'resource:42', target: 'content_unit:cu_scene', kind: 'reference', relation: 'content_unit_resource' },
      { id: 'unit-storyboard', source: 'content_unit:cu_scene', target: 'storyboard:board', kind: 'reference', relation: 'content_unit_storyboard' },
      { id: 'expression-unit', source: 'expression_unit:style', target: 'content_unit:cu_scene', kind: 'reference', relation: 'expression_unit_content_unit' },
      { id: 'duplicate-expression-unit', source: 'expression_unit:shot', target: 'content_unit:cu_scene', kind: 'reference', relation: 'expression_unit_content_unit' },
    ],
    nodeKindById: new Map(nodes.map((node) => [node.id, node.kind])),
    contentUnitOwnerNodeIdByNodeId: new Map([['content_unit:cu_scene', 'scene_moment:scene']]),
  })

  assert.deepEqual(dependencies.map((edge) => [edge.kind, edge.label, edge.upstream, edge.downstream, edge.sourceEdge.relation ?? edge.sourceEdge.kind]), [
    ['namespace', '命名空间依赖', 'expression_unit:shot', 'scene_moment:scene', 'hierarchy'],
    ['reference', '引用依赖', 'asset:phone', 'scene_moment:scene', 'content_unit_asset'],
    ['reference', '引用依赖', 'keyframe:pose', 'scene_moment:scene', 'content_unit_keyframe'],
    ['reference', '引用依赖', 'resource:42', 'scene_moment:scene', 'content_unit_resource'],
    ['reference', '引用依赖', 'storyboard:board', 'scene_moment:scene', 'content_unit_storyboard'],
    ['reference', '引用依赖', 'expression_unit:style', 'scene_moment:scene', 'expression_unit_content_unit'],
  ])
})

test('creative canvas turns expression scene ownership into a dependency edge without scene-to-expression paths', () => {
  const creativeGraph = buildCreativeCanvasGraph(graphFixture({
    nodes: [
      nodeFixture({
        id: 'scene_moment:1',
        entityKey: '1',
        kind: 'scene_moment',
        title: 'Scene',
        position: { x: 0, y: 0 },
        generationTask: generationTaskFixture({ id: 'cu_scene', nodeId: 'content_unit:cu_scene' }),
      }),
      nodeFixture({ id: 'content_unit:cu_scene', entityKey: 'cu_scene', kind: 'content_unit', title: 'Scene render', position: { x: 0, y: 0 } }),
      nodeFixture({
        id: 'expression_unit:shot',
        entityKey: 'shot',
        kind: 'expression_unit',
        title: 'Shot',
        position: { x: 0, y: 0 },
        generationTask: generationTaskFixture({ id: 'cu_shot', nodeId: 'content_unit:cu_shot' }),
      }),
      nodeFixture({ id: 'content_unit:cu_shot', entityKey: 'cu_shot', kind: 'content_unit', title: 'Shot render', position: { x: 0, y: 0 } }),
    ],
    edges: [
      { id: 'scene-expression-structure', source: 'scene_moment:1', target: 'expression_unit:shot', kind: 'hierarchy' },
      { id: 'scene-expression-unit', source: 'scene_moment:1', target: 'content_unit:cu_shot', kind: 'reference', relation: 'expression_unit_content_unit' },
    ],
  }))

  assert.deepEqual(creativeGraph.edges.map((edge) => [edge.source, edge.target, edge.sourceEdge.kind, edge.sourceEdge.type, edge.sourceEdge.label]), [
    ['expression_unit:shot', 'scene_moment:1', 'reference', 'depends_on', '命名空间依赖'],
  ])
})

test('creative canvas turns keyframe expression ownership into a dependency edge without structure edges', () => {
  const creativeGraph = buildCreativeCanvasGraph(graphFixture({
    nodes: [
      nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene', position: { x: 0, y: 0 } }),
      nodeFixture({
        id: 'expression_unit:shot',
        entityKey: 'shot',
        kind: 'expression_unit',
        title: 'Shot',
        position: { x: 0, y: 0 },
        generationTask: generationTaskFixture({ id: 'cu_shot', nodeId: 'content_unit:cu_shot' }),
      }),
      nodeFixture({ id: 'content_unit:cu_shot', entityKey: 'cu_shot', kind: 'content_unit', title: 'Shot render', position: { x: 0, y: 0 } }),
      nodeFixture({
        id: 'keyframe:glow',
        entityKey: 'glow',
        kind: 'keyframe',
        title: 'Glow',
        position: { x: 0, y: 0 },
        generationTask: generationTaskFixture({ id: 'cu_glow', nodeId: 'content_unit:cu_glow' }),
      }),
      nodeFixture({ id: 'content_unit:cu_glow', entityKey: 'cu_glow', kind: 'content_unit', title: 'Glow render', position: { x: 0, y: 0 } }),
    ],
    edges: [
      { id: 'scene-keyframe-structure', source: 'scene_moment:1', target: 'keyframe:glow', kind: 'hierarchy' },
      { id: 'expression-keyframe-structure', source: 'expression_unit:shot', target: 'keyframe:glow', kind: 'hierarchy' },
      { id: 'unit-keyframe', source: 'content_unit:cu_shot', target: 'keyframe:glow', kind: 'reference', relation: 'content_unit_keyframe' },
      { id: 'expression-keyframe-unit', source: 'expression_unit:shot', target: 'content_unit:cu_glow', kind: 'reference', relation: 'expression_unit_content_unit' },
    ],
  }))

  assert.deepEqual(creativeGraph.edges.map((edge) => [edge.source, edge.target, edge.sourceEdge.kind, edge.sourceEdge.type, edge.sourceEdge.label]), [
    ['keyframe:glow', 'expression_unit:shot', 'reference', 'depends_on', '命名空间依赖'],
  ])
})

test('creative canvas turns storyboard expression ownership into a dependency edge', () => {
  const creativeGraph = buildCreativeCanvasGraph(graphFixture({
    nodes: [
      nodeFixture({
        id: 'expression_unit:shot',
        entityKey: 'shot',
        kind: 'expression_unit',
        title: 'Shot',
        position: { x: 0, y: 0 },
      }),
      nodeFixture({
        id: 'storyboard:main',
        entityKey: 'main',
        kind: 'storyboard',
        title: 'Main board',
        position: { x: 0, y: 0 },
      }),
    ],
    edges: [
      { id: 'expression-storyboard-structure', source: 'expression_unit:shot', target: 'storyboard:main', kind: 'hierarchy' },
    ],
  }))

  assert.deepEqual(creativeGraph.edges.map((edge) => [edge.source, edge.target, edge.sourceEdge.kind, edge.sourceEdge.type, edge.sourceEdge.label]), [
    ['storyboard:main', 'expression_unit:shot', 'reference', 'depends_on', '命名空间依赖'],
  ])
})

test('creative canvas actions expose scene keyframe and storyboard creation commands', () => {
  const scene = nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene', position: { x: 0, y: 0 } })
  const contentUnit = nodeFixture({ id: 'content_unit:cu', entityKey: 'cu', kind: 'content_unit', title: 'Unit', position: { x: 0, y: 0 } })
  const candidate = nodeFixture({ id: 'candidate:cu:cand', entityKey: 'cand', kind: 'candidate', title: 'Candidate', position: { x: 0, y: 0 }, record: { id: 'cand' } })
  const selectedCandidate = nodeFixture({ id: 'candidate:cu:selected', entityKey: 'selected', kind: 'candidate', title: 'Selected', position: { x: 0, y: 0 }, record: { id: 'selected', selected: true } })
  const resource = nodeFixture({ id: 'resource:42', entityKey: '42', kind: 'resource', title: 'Resource', position: { x: 0, y: 0 }, record: { resourceId: 42 } })

  assert.deepEqual(creativeCanvasActionsForNode(scene).map((action) => action.kind === 'create_child' ? `${action.kind}:${action.childKind}` : action.kind), [
    'create_child:expression_unit',
    'create_child:keyframe',
    'create_child:storyboard',
    'generate_candidate',
    'upload_candidate',
    'remove_from_canvas',
    'delete_node',
  ])
  assert.ok(creativeCanvasActionsForNode(scene).some((action) => action.kind === 'remove_from_canvas' && action.label === '从画布移除'))
  assert.ok(creativeCanvasActionsForNode(scene).some((action) => action.kind === 'delete_node' && action.label === '删除源节点'))
  assert.ok(creativeCanvasActionsForNode(contentUnit).some((action) => action.kind === 'generate_candidate'))
  assert.ok(creativeCanvasActionsForNode(candidate).some((action) => action.kind === 'select_candidate' && action.label === '选择候选'))
  assert.ok(creativeCanvasActionsForNode(selectedCandidate).some((action) => action.kind === 'select_candidate' && action.label === '已选择候选'))
  assert.ok(creativeCanvasActionsForNode(resource).some((action) => action.kind === 'open_resource' && action.resourceId === 42))
  assert.ok(creativeCanvasActionsForNode(resource).some((action) => action.kind === 'remove_from_canvas'))
  assert.equal(creativeCanvasActionsForNode(resource).some((action) => action.kind === 'delete_node'), false)
})

function graphFixture(patch: Partial<ContentCanvasWorkspaceSnapshot> = {}): ContentCanvasWorkspaceSnapshot {
  return {
    nodes: [
      nodeFixture({ id: 'expression_unit:1', entityKey: '1', kind: 'expression_unit', title: 'Shot 1', position: { x: 0, y: 0 }, record: { kind: 'shot' } }),
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Asset 1', position: { x: 900, y: 0 } }),
    ],
    edges: [
      { id: 'expression-asset', source: 'expression_unit:1', target: 'asset:1', kind: 'reference', relation: 'content_unit_asset' },
    ],
    ...patch,
  }
}

function edgeFixture(patch: Partial<ContentCanvasEdge> = {}): ContentCanvasEdge {
  return {
    id: 'edge',
    source: 'source:1',
    target: 'target:1',
    kind: 'reference',
    ...patch,
  }
}

function entityFixture(
  entityKind: string,
  id: string,
  path: string,
  record: Record<string, unknown>,
) {
  return {
    entityKind,
    id,
    path,
    record,
  } as never
}

function installLocalStorageFixture(): () => void {
  const previousWindow = (globalThis as typeof globalThis & { window?: unknown }).window
  const items = new Map<string, string>()
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value)
    },
    removeItem: (key: string) => {
      items.delete(key)
    },
  }
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: storage,
      sessionStorage: storage,
    },
    configurable: true,
  })
  return () => {
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window')
      return
    }
    Object.defineProperty(globalThis, 'window', {
      value: previousWindow,
      configurable: true,
    })
  }
}

function nodeFixture(patch: Pick<ContentCanvasNode, 'id' | 'entityKey' | 'kind' | 'title' | 'position'> & Partial<ContentCanvasNode>): ContentCanvasNode {
  return {
    subtitle: patch.kind,
    summary: `${patch.title} summary`,
    status: 'active',
    metrics: [],
    sourcePath: `${patch.kind}/${patch.entityKey}.json`,
    record: {},
    candidates: [],
    ...patch,
  }
}

function generationTaskFixture(patch: Partial<NonNullable<ContentCanvasNode['generationTask']>> = {}): NonNullable<ContentCanvasNode['generationTask']> {
  return {
    id: 'content_unit',
    nodeId: 'content_unit:content_unit',
    contentUnitType: 'scene_moment_ref',
    outputKind: 'image',
    title: 'Content unit',
    prompt: 'Generate content.',
    status: 'selected',
    sourcePath: 'content_units/content_unit/content_unit.json',
    record: {},
    candidates: [],
    ...patch,
  }
}
