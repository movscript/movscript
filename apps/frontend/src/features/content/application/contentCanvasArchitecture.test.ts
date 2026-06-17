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
  suggestedContentCanvasChildNodePosition,
} from './contentCanvasCommands'
import {
  ensureContentUnitForRef,
} from './contentCanvasContentUnitCommands'
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
  createContentCanvasGraphState,
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
  clearContentCanvasViewState,
  createContentCanvasPresentationGroupNode,
  readContentCanvasViewState,
  setContentCanvasEdgeFilterPreferences,
  toggleContentCanvasEdgeFilterPreference,
  toggleContentCanvasHiddenKindPreference,
  updateContentCanvasPresentationNode,
  writeContentCanvasViewState,
} from './contentCanvasViewState'
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
  contentCanvasEdgeVisualLayer,
  contentCanvasEdgeVisualState,
  contentCanvasVisualEdgeEndpoints,
  contentCanvasVisualEdgeHandles,
  kindShortCode,
} from '../components/ContentCanvasPresentationModel'
import {
  candidateDecisionForNode,
  contentCanvasGraphIndex,
  candidatesForNode,
  promptFromContentNode,
  radialNodeFromContentNode,
  reconcileContentCanvasInspectorSelection,
  sceneSettingGroupFromNode,
  timelineItemsFromMediaEditingProject,
} from '../components/contentCanvasWorkspaceModel'
import {
  buildContentCanvasGraph,
} from '../domain/contentCanvasGraph'
import type { ContentCanvasEdge, ContentCanvasGraph, ContentCanvasNode } from '../domain/contentCanvasTypes'

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
      expressionUnitsByMoment: {},
      audioCuesByMoment: {},
      shotWorkspaceDetails: {},
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
})

test('content canvas view plan delegates hidden relation summaries', () => {
  const viewPlanSource = readFileSync(resolve('src/features/content/application/contentCanvasViewPlan.ts'), 'utf8')
  const summariesSource = readFileSync(resolve('src/features/content/application/contentCanvasViewSummaries.ts'), 'utf8')
  const issuesSource = readFileSync(resolve('src/features/content/application/contentCanvasViewPlanIssues.ts'), 'utf8')
  const edgesSource = readFileSync(resolve('src/features/content/application/contentCanvasViewPlanEdges.ts'), 'utf8')

  assert.match(viewPlanSource, /from '\.\/contentCanvasViewSummaries'/)
  assert.match(viewPlanSource, /from '\.\/contentCanvasViewPlanIssues'/)
  assert.match(viewPlanSource, /from '\.\/contentCanvasViewPlanEdges'/)
  assert.match(summariesSource, /export function contentCanvasCollapsedSummaries/)
  assert.match(summariesSource, /export function contentCanvasHiddenEdgeSummaries/)
  assert.match(summariesSource, /function hiddenEdgeRelationLabel/)
  assert.match(issuesSource, /export function issueNodeIdsForFilters/)
  assert.match(issuesSource, /export function issueNodeIdsForGraph/)
  assert.match(issuesSource, /function workItemMatchesFilters/)
  assert.match(edgesSource, /export function applyContentCanvasEdgeBudget/)
  assert.match(edgesSource, /export function contentCanvasModeAllowsEdge/)
  assert.match(edgesSource, /function edgeRenderRank/)
  assert.doesNotMatch(viewPlanSource, /function hiddenEdgeRelationLabel/)
  assert.doesNotMatch(viewPlanSource, /function anchorVisibleNodeForHiddenNode/)
  assert.doesNotMatch(viewPlanSource, /function collapsedKindLabel/)
  assert.doesNotMatch(viewPlanSource, /function workItemMatchesFilters/)
  assert.doesNotMatch(viewPlanSource, /function workItemMatchesTargetKind/)
  assert.doesNotMatch(viewPlanSource, /function edgeRenderRank/)
  assert.doesNotMatch(viewPlanSource, /function defaultEdgeRenderLimitForDensity/)
})

test('content canvas workspace page delegates pane layout to route layout controllers', () => {
  const pageSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspacePage.tsx'), 'utf8')
  const controllerSource = readFileSync(resolve('src/features/content/components/useContentCanvasWorkspaceController.ts'), 'utf8')
  const detailsSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspaceDetails.tsx'), 'utf8')
  const panelsSource = readFileSync(resolve('src/features/content/components/ContentCanvasWorkspacePanels.tsx'), 'utf8')
  const viewModelSource = readFileSync(resolve('src/features/content/components/contentCanvasWorkspaceViewModel.ts'), 'utf8')
  const workspaceModelSource = readFileSync(resolve('src/features/content/components/contentCanvasWorkspaceModel.ts'), 'utf8')
  const workspaceGraphModelSource = readFileSync(resolve('src/features/content/components/contentCanvasWorkspaceGraphModel.ts'), 'utf8')
  const commandsSource = readFileSync(resolve('src/features/content/application/contentCanvasCommands.ts'), 'utf8')
  const createNodeCommandsSource = readFileSync(resolve('src/features/content/application/contentCanvasCreateNodeCommands.ts'), 'utf8')
  const candidateCommandsSource = readFileSync(resolve('src/features/content/application/contentCanvasCandidateCommands.ts'), 'utf8')
  const graphSource = readFileSync(resolve('src/features/content/domain/contentCanvasGraph.ts'), 'utf8')
  const graphCandidatesSource = readFileSync(resolve('src/features/content/domain/contentCanvasGraphCandidates.ts'), 'utf8')
  const graphLayoutSource = readFileSync(resolve('src/features/content/domain/contentCanvasGraphLayout.ts'), 'utf8')
  const graphSummarySource = readFileSync(resolve('src/features/content/domain/contentCanvasGraphSummary.ts'), 'utf8')
  const workItemsGraphSource = readFileSync(resolve('src/features/content/domain/contentCanvasGraphWorkItems.ts'), 'utf8')
  const graphAssetsSource = readFileSync(resolve('src/features/content/domain/contentCanvasGraphAssets.ts'), 'utf8')
  const graphReferencesSource = readFileSync(resolve('src/features/content/domain/contentCanvasGraphReferences.ts'), 'utf8')
  const loadProjectSource = readFileSync(resolve('src/features/content/application/loadContentCanvasProject.ts'), 'utf8')
  const gatewaySource = readFileSync(resolve('src/features/content/application/contentCanvasWorkspaceGateway.ts'), 'utf8')
  const electronGatewaySource = readFileSync(resolve('src/features/content/integrations/contentCanvasWorkspaceElectronGateway.ts'), 'utf8')
  const layoutSource = readFileSync(resolve('src/features/content/components/contentCanvasWorkspaceLayout.tsx'), 'utf8')
  const starCanvasSource = readFileSync(resolve('src/features/content/components/ContentCanvasStarCanvas.tsx'), 'utf8')
  const cssSource = [
    'ContentCanvasWorkspacePage.base.css',
    'ContentCanvasWorkspacePage.layout.css',
  ].map((filename) => readFileSync(resolve('src/features/content/components', filename), 'utf8')).join('\n')

  assert.match(pageSource, /useContentCanvasPaneLayout/)
  assert.match(pageSource, /useContentCanvasRadialLayout/)
  assert.match(pageSource, /useContentCanvasWorkspaceController/)
  assert.match(pageSource, /SettingCatalogPanel/)
  assert.match(pageSource, /CanvasStagePanel/)
  assert.doesNotMatch(pageSource, /useQuery/)
  assert.doesNotMatch(pageSource, /useProjectStore/)
  assert.doesNotMatch(pageSource, /useState/)
  assert.doesNotMatch(pageSource, /\blocalStorage\b/)

  assert.match(starCanvasSource, /data-dragging/)
  assert.doesNotMatch(starCanvasSource, /visibleSettingGroups\.map\(\(group\) => \(\{[\s\S]*source: visibleMain/)
  assert.match(starCanvasSource, /function settingGroupLayout/)
  assert.match(starCanvasSource, /SETTING_GROUP_NODE_WIDTH/)

  assert.match(controllerSource, /useQuery/)
  assert.match(controllerSource, /buildContentCanvasWorkspaceViewModel/)
  assert.doesNotMatch(controllerSource, /connectSceneMomentSettingFromCanvas/)
  assert.match(controllerSource, /setManualSceneSettingGroupsBySceneId\(\(currentByScene\) => \{/)
  assert.match(controllerSource, /return \{ \.\.\.currentByScene, \[sceneKey\]: nextGroups \}/)
  assert.match(controllerSource, /childNodesByHierarchy/)
  assert.match(controllerSource, /draftAssetPrompts/)
  assert.match(controllerSource, /selectContentUnitCandidateFromCanvas/)
  assert.match(controllerSource, /updateContentUnitPromptFromCanvas/)
  assert.match(controllerSource, /contentUnitNodeForGenerationTask/)
  assert.match(controllerSource, /label: '添加素材'/)
  assert.match(controllerSource, /label: '放入 Scene Moment'/)
  assert.match(controllerSource, /createKeyframeForShot/)
  assert.match(controllerSource, /kind: 'create_keyframe'/)
  assert.match(detailsSource, /function GenerationTaskPanel/)
  assert.match(detailsSource, /title="制作项"/)
  assert.match(detailsSource, /submitLabel="创建关键帧"/)

  assert.match(viewModelSource, /export function buildContentCanvasWorkspaceViewModel/)
  assert.match(viewModelSource, /reconcileContentCanvasInspectorSelection/)
  assert.doesNotMatch(viewModelSource, /useState/)
  assert.doesNotMatch(viewModelSource, /useQuery/)
  assert.match(workspaceModelSource, /from '\.\/contentCanvasWorkspaceGraphModel'/)
  assert.doesNotMatch(workspaceModelSource, /function fallbackContentCanvasInspectorSelection/)
  assert.doesNotMatch(workspaceModelSource, /function sceneScopedNodeIds/)
  assert.match(workspaceGraphModelSource, /export function contentCanvasGraphIndex/)
  assert.match(workspaceGraphModelSource, /export function radialNodesAround/)
  assert.match(workspaceGraphModelSource, /export function reconcileContentCanvasInspectorSelection/)
  assert.match(workspaceGraphModelSource, /function sceneScopedNodeIds/)
  assert.match(workspaceGraphModelSource, /childNodesByHierarchy/)
  assert.match(workspaceGraphModelSource, /edge\.kind === 'hierarchy'\) appendMapArray\(childNodesByHierarchy/)

  assert.match(gatewaySource, /export interface ContentCanvasWorkspaceGateway/)
  assert.match(commandsSource, /ContentCanvasWorkspaceGateway/)
  assert.match(commandsSource, /from '.\/contentCanvasCreateNodeCommands'/)
  assert.doesNotMatch(commandsSource, /async function createSettingFromCanvas/)
  assert.doesNotMatch(commandsSource, /async function createStoryboardFromShot/)
  assert.doesNotMatch(commandsSource, /function requiredShotRefs/)
  assert.match(createNodeCommandsSource, /export async function createRootContentCanvasNode/)
  assert.match(createNodeCommandsSource, /export async function createChildContentCanvasNode/)
  assert.match(createNodeCommandsSource, /export function suggestedContentCanvasChildNodePosition/)
  assert.match(createNodeCommandsSource, /async function createStoryboardFromShot/)
  assert.match(createNodeCommandsSource, /function requiredShotRefs/)
  assert.match(commandsSource, /from '.\/contentCanvasCandidateCommands'/)
  assert.doesNotMatch(commandsSource, /function contentCanvasCandidateFromContentRecord/)
  assert.doesNotMatch(commandsSource, /function selectCandidateNodeFromCanvas/)
  assert.match(candidateCommandsSource, /export async function createCandidateFromContentUnit/)
  assert.match(candidateCommandsSource, /export async function selectContentUnitCandidateFromCanvas/)
  assert.match(candidateCommandsSource, /export async function selectCandidateNodeFromCanvas/)
  assert.match(candidateCommandsSource, /buildContentSourceWorkspaceCandidateCreatePlan/)
  assert.match(graphSource, /from '.\/contentCanvasGraphWorkItems'/)
  assert.doesNotMatch(graphSource, /owner_type/)
  assert.doesNotMatch(graphSource, /owner_id/)
  assert.doesNotMatch(graphSource, /function createWorkItemNodes/)
  assert.doesNotMatch(graphSource, /function createActorNodes/)
  assert.match(workItemsGraphSource, /export function createWorkItemNodes/)
  assert.match(workItemsGraphSource, /export function createActorNodes/)
  assert.match(workItemsGraphSource, /export function targetNodeForWorkItem/)
  assert.match(graphSource, /from '.\/contentCanvasGraphSummary'/)
  assert.doesNotMatch(graphSource, /function buildContentCanvasGraphIndexes/)
  assert.doesNotMatch(graphSource, /function buildContentCanvasGraphSummary/)
  assert.doesNotMatch(graphSource, /function withStructureSummaryMetrics/)
  assert.match(graphSummarySource, /export function withGraphIndexesAndSummary/)
  assert.match(graphSummarySource, /export function withStructureSummaryMetrics/)
  assert.match(graphSource, /from '.\/contentCanvasGraphCandidates'/)
  assert.doesNotMatch(graphSource, /function createCandidateNodes/)
  assert.doesNotMatch(graphSource, /function createSelectionNodes/)
  assert.doesNotMatch(graphSource, /function createResourceNodes/)
  assert.match(graphCandidatesSource, /export function createCandidateNodes/)
  assert.match(graphCandidatesSource, /export function createSelectionNodes/)
  assert.match(graphCandidatesSource, /export function resourceNodeIdFor/)
  assert.match(graphSource, /from '.\/contentCanvasGraphLayout'/)
  assert.doesNotMatch(graphSource, /function appendSequenceEdges/)
  assert.doesNotMatch(graphSource, /function assignDeterministicPositions/)
  assert.match(graphLayoutSource, /export function appendSequenceEdges/)
  assert.match(graphLayoutSource, /export function assignDeterministicPositions/)
  assert.match(graphSource, /from '.\/contentCanvasGraphAssets'/)
  assert.match(graphSource, /appendAssetDownstreamEdges\(edges, data\.assetReferenceUnits/)
  assert.doesNotMatch(graphSource, /function assetNodeForReferenceUnit/)
  assert.doesNotMatch(graphSource, /function targetNodeForAssetDownstream/)
  assert.doesNotMatch(graphSource, /function assetDownstreamLabel/)
  assert.match(graphAssetsSource, /export function appendAssetDownstreamEdges/)
  assert.match(graphAssetsSource, /relation: 'asset_downstream'/)
  assert.match(graphSource, /from '.\/contentCanvasGraphReferences'/)
  assert.match(graphSource, /appendContentCanvasReferenceEdges\(\{ data, edges, entityNodes, nodeByEntityKindAndKey, nodeByPath \}\)/)
  assert.doesNotMatch(graphSource, /function referencedNodeFor/)
  assert.doesNotMatch(graphSource, /function settingStateRefsForRecord/)
  assert.doesNotMatch(graphSource, /function expressionStoryboardRefs/)
  assert.match(graphReferencesSource, /export function appendContentCanvasReferenceEdges/)
  assert.match(graphReferencesSource, /relation: 'content_unit_scene'/)
  assert.match(graphReferencesSource, /relation: 'expression_unit_shot'/)
  assert.match(graphReferencesSource, /relation: 'audio_cue_shot'/)
  assert.match(graphReferencesSource, /relation: 'setting_state_reference'/)
  assert.match(loadProjectSource, /ContentCanvasWorkspaceGateway/)
  assert.doesNotMatch(commandsSource, /createElectronMovScriptWorkspaceService/)
  assert.doesNotMatch(commandsSource, /readElectronApi/)
  assert.doesNotMatch(commandsSource, /currentWorkspaceOwnerContext/)
  assert.doesNotMatch(loadProjectSource, /createElectronMovScriptWorkspaceService/)
  assert.doesNotMatch(loadProjectSource, /readElectronApi/)
  assert.doesNotMatch(loadProjectSource, /currentWorkspaceOwnerContext/)
  assert.match(electronGatewaySource, /createElectronMovScriptWorkspaceService/)
  assert.match(electronGatewaySource, /readElectronApi/)

  assert.match(panelsSource, /PanelResizeHandle/)
  assert.match(panelsSource, /ContentCanvasResizeHandle/)
  assert.match(panelsSource, /onNodePositionCommit/)
  assert.doesNotMatch(panelsSource, /defaultValue="雨夜"/)

  assert.match(layoutSource, /useRouteLayoutPaneController/)
  assert.match(layoutSource, /useResizablePanel/)
  assert.match(layoutSource, /readContentCanvasViewState/)
  assert.match(layoutSource, /mergeContentCanvasNodePositions/)
  assert.match(layoutSource, /clearContentCanvasNodePositions/)
  assert.match(layoutSource, /CONTENT_CANVAS_SETTING_CATALOG_PANE_ID/)
  assert.match(layoutSource, /CONTENT_CANVAS_STRUCTURE_PANE_ID/)
  assert.match(layoutSource, /CONTENT_CANVAS_INSPECTOR_PANE_ID/)
  assert.match(layoutSource, /CONTENT_CANVAS_TIMELINE_PANE_ID/)

  assert.match(cssSource, /var\(--content-canvas-setting-catalog-height\)/)
  assert.match(cssSource, /var\(--content-canvas-structure-width\)/)
  assert.match(cssSource, /var\(--content-canvas-inspector-width\)/)
  assert.match(cssSource, /var\(--content-canvas-timeline-height\)/)
  assert.match(cssSource, /content-canvas-resize-handle--top/)
  assert.match(cssSource, /content-canvas-resize-handle--left/)
  assert.match(cssSource, /content-canvas-resize-handle--right/)
  assert.match(cssSource, /content-canvas-resize-handle--bottom/)
})

test('content canvas graph state keeps unchanged node references during structural merge', () => {
  const first = createContentCanvasGraphState(graphFixture())
  const second = createContentCanvasGraphState(graphFixture(), first)
  const changed = createContentCanvasGraphState(graphFixture({
    nodes: [
      nodeFixture({ id: 'shot:1', entityKey: '1', kind: 'shot', title: 'Shot 1 updated', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Asset 1', position: { x: 900, y: 0 } }),
    ],
  }), second)

  assert.equal(second.nodesById['shot:1'], first.nodesById['shot:1'])
  assert.equal(second.nodesById['asset:1'], first.nodesById['asset:1'])
  assert.notEqual(changed.nodesById['shot:1'], second.nodesById['shot:1'])
  assert.equal(changed.nodesById['asset:1'], second.nodesById['asset:1'])
  assert.equal(second.nodeIds, first.nodeIds)
  assert.equal(second.outgoingEdgeIdsByNodeId['shot:1'], first.outgoingEdgeIdsByNodeId['shot:1'])
})

test('content canvas inspector selection rehydrates from the latest workspace graph', () => {
  const previousSetting = nodeFixture({ id: 'setting:1', entityKey: '1', kind: 'setting', title: 'Setting old', position: { x: 0, y: 0 } })
  const nextSetting = nodeFixture({ id: 'setting:1', entityKey: '1', kind: 'setting', title: 'Setting updated', position: { x: 0, y: 0 } })
  const scene = nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene 1', position: { x: 720, y: 0 } })
  const graph = graphFixture({ nodes: [scene, nextSetting], edges: [] })
  const nextSelection = reconcileContentCanvasInspectorSelection({
    graphIndex: contentCanvasGraphIndex(graph),
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
  const staleShot = nodeFixture({ id: 'shot:deleted', entityKey: 'deleted', kind: 'shot', title: 'Deleted shot', position: { x: 0, y: 0 } })
  const scene = nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene 1', position: { x: 720, y: 0 } })
  const sceneMainNode = radialNodeFromContentNode(scene, 0, 0, 'primary')
  const nextSelection = reconcileContentCanvasInspectorSelection({
    graphIndex: contentCanvasGraphIndex(graphFixture({ nodes: [scene], edges: [] })),
    sceneMainNode,
    selection: { kind: 'other', nodeId: staleShot.id },
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
    edgeFixture({ relation: 'audio_cue_shot' }),
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
  const first = createContentCanvasGraphState(graphFixture())
  const movedLayouts = patchContentCanvasNodeLayout(
    first.layoutByNodeId,
    'shot:1',
    { x: 320, y: 240 },
    { markManual: true, updatedAt: '2026-06-15T00:00:00.000Z' },
  )
  const second = createContentCanvasGraphState(graphFixture({
    nodes: [
      nodeFixture({ id: 'shot:1', entityKey: '1', kind: 'shot', title: 'Shot 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Asset 1', position: { x: 1200, y: 100 } }),
    ],
  }), {
    ...first,
    layoutByNodeId: movedLayouts,
  })

  assert.deepEqual(second.layoutByNodeId['shot:1'], {
    ...movedLayouts['shot:1'],
    x: 320,
    y: 240,
    manual: true,
    source: 'manual',
  })
  assert.deepEqual(second.layoutByNodeId['asset:1'], first.layoutByNodeId['asset:1'])
})

test('content canvas layout retains disappeared node tombstones for later recovery', () => {
  const first = createContentCanvasGraphState(graphFixture({
    nodes: [
      nodeFixture({ id: 'shot:1', entityKey: '1', kind: 'shot', title: 'Shot 1', position: { x: 0, y: 0 } }),
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
  const disappeared = createContentCanvasGraphState(graphFixture({
    nodes: [
      nodeFixture({ id: 'shot:1', entityKey: '1', kind: 'shot', title: 'Shot 1', position: { x: 0, y: 0 } }),
    ],
    edges: [],
  }), {
    ...first,
    layoutByNodeId: movedLayouts,
  })
  const recovered = createContentCanvasGraphState(graphFixture({
    nodes: [
      nodeFixture({ id: 'shot:1', entityKey: '1', kind: 'shot', title: 'Shot 1', position: { x: 0, y: 0 } }),
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
      'shot:new': { x: 42, y: 84 },
    }),
    { markManual: true, updatedAt: '2026-06-15T00:00:00.000Z' },
  )

  assert.deepEqual(layouts['shot:new'], {
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
    'shot:stable': {
      x: 10,
      y: 20,
      width: 260,
      height: 118,
    },
    'shot:moved': {
      x: 30,
      y: 40,
      width: 260,
      height: 118,
    },
  }

  const patches = contentCanvasChangedPositionPatches(layouts, {
    'shot:stable': { x: 10, y: 20 },
    'shot:moved': { x: 32, y: 44 },
    'shot:new': { x: 100, y: 120 },
  })

  assert.deepEqual(patches, {
    'shot:moved': { x: 32, y: 44 },
    'shot:new': { x: 100, y: 120 },
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
      nodeFixture({ id: 'shot:outside', entityKey: 'outside', kind: 'shot', title: 'Outside shot', position: { x: 30, y: 40 } }),
    ],
  })
  const state = createContentCanvasGraphState(graph)
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
  const patches = contentCanvasLayoutPatchesBetween(layouts, arranged, ['asset:1', 'content_unit:1', 'candidate:1', 'shot:outside'])

  assert.deepEqual(arranged['asset:1'], layouts['asset:1'])
  assert.equal(arranged['content_unit:1'].x, 1810)
  assert.equal(arranged['content_unit:1'].y, 15)
  assert.equal(arranged['candidate:1'].x, 2170)
  assert.equal(arranged['candidate:1'].y, 275)
  assert.equal(arranged['shot:outside'], layouts['shot:outside'])
  assert.deepEqual(Object.keys(patches), ['content_unit:1', 'candidate:1'])
})

test('content canvas viewport culling returns visible nodes and necessary edges only', () => {
  const state = createContentCanvasGraphState(graphFixture({
    nodes: [
      nodeFixture({ id: 'shot:1', entityKey: '1', kind: 'shot', title: 'Shot 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Asset 1', position: { x: 900, y: 0 } }),
      nodeFixture({ id: 'candidate:1', entityKey: '1', kind: 'candidate', title: 'Candidate 1', position: { x: 2600, y: 0 } }),
    ],
    edges: [
      { id: 'shot-asset', source: 'shot:1', target: 'asset:1', kind: 'reference', relation: 'content_unit_asset' },
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

  assert.deepEqual(visible.visibleNodeIds, ['shot:1'])
  assert.deepEqual(visible.visibleEdgeIds, ['shot-asset'])
})

test('content canvas navigator derives hierarchy depth and work item counts', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'production:1', entityKey: '1', kind: 'production', title: 'Production 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'segment:1', entityKey: '1', kind: 'segment', title: 'Segment 1', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene 1', position: { x: 720, y: 0 } }),
      nodeFixture({ id: 'shot:1', entityKey: '1', kind: 'shot', title: 'Shot 1', position: { x: 1080, y: 0 } }),
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Unit 1', position: { x: 1440, y: 0 } }),
      nodeFixture({ id: 'work_item:1', entityKey: '1', kind: 'work_item', title: 'Work 1', position: { x: 1800, y: 0 } }),
    ],
    edges: [
      { id: 'production-segment', source: 'production:1', target: 'segment:1', kind: 'hierarchy' },
      { id: 'segment-scene', source: 'segment:1', target: 'scene_moment:1', kind: 'hierarchy' },
      { id: 'scene-shot', source: 'scene_moment:1', target: 'shot:1', kind: 'hierarchy' },
      { id: 'work-shot', source: 'work_item:1', target: 'shot:1', kind: 'reference', relation: 'work_item_target' },
    ],
  })

  const items = buildContentCanvasNavigatorItems(graph)

  assert.deepEqual(items.map((item) => [item.nodeId, item.depth, item.childCount, item.workItemCount]), [
    ['production:1', 0, 1, 0],
    ['segment:1', 1, 1, 0],
    ['scene_moment:1', 2, 1, 0],
    ['shot:1', 3, 0, 1],
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
        id: 'shot:1',
        entityKey: '1',
        kind: 'shot',
        title: 'Rain shot',
        position: { x: 0, y: 0 },
        summary: 'Hero answers the phone in rain.',
        record: {
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
    ['类型', '镜头'],
    ['状态', '推进中'],
    ['来源', 'shot/1.json'],
    ['镜头描述', 'Hero answers the phone in rain.'],
    ['时长秒', '3.5'],
    ['Camera', 'slow push-in'],
    ['表达', 'exp_1'],
    ['制作状态', 'needs_candidate'],
  ])
  assert.deepEqual(contentUnitLedger.current.map((fact) => [fact.label, fact.value]), [
    ['类型', '制作项'],
    ['状态', '推进中'],
    ['来源', 'content_unit/1.json'],
    ['产物类型', 'video'],
    ['制作项类型', 'shot_render'],
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
      nodeFixture({ id: 'shot:unrelated', entityKey: 'unrelated', kind: 'shot', title: 'Unrelated shot', position: { x: 2600, y: 0 } }),
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
  assert.equal(plan.hiddenNodeIds.has('shot:unrelated'), true)
})

test('content canvas view plan clusters very large unselected dependency maps to semantic backbone', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'scene_moment:1', entityKey: '1', kind: 'scene_moment', title: 'Scene 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'shot:1', entityKey: '1', kind: 'shot', title: 'Shot 1', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'setting:weather', entityKey: 'weather', kind: 'setting', title: 'Weather', position: { x: -360, y: 0 } }),
      nodeFixture({ id: 'asset:phone', entityKey: 'phone', kind: 'asset', title: 'Phone', position: { x: -720, y: 0 } }),
      nodeFixture({ id: 'content_unit:render', entityKey: 'render', kind: 'content_unit', title: 'Render unit', position: { x: 720, y: 0 } }),
      nodeFixture({ id: 'candidate:render', entityKey: 'render', kind: 'candidate', title: 'Candidate', position: { x: 1080, y: 0 } }),
    ],
    edges: [
      { id: 'scene-shot', source: 'scene_moment:1', target: 'shot:1', kind: 'hierarchy' },
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
  assert.deepEqual(plan.graph.nodes.map((node) => node.id), ['scene_moment:1', 'shot:1', 'setting:weather', 'asset:phone'])
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

test('content canvas structure view summarizes folded shot workband outputs', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'shot:1', entityKey: '1', kind: 'shot', title: 'Shot 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'keyframe:1', entityKey: '1', kind: 'keyframe', title: 'Keyframe 1', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'storyboard:1', entityKey: '1', kind: 'storyboard', title: 'Storyboard 1', position: { x: 360, y: 180 } }),
      nodeFixture({ id: 'content_unit:1', entityKey: '1', kind: 'content_unit', title: 'Unit 1', position: { x: 720, y: 0 } }),
    ],
    edges: [
      { id: 'shot-keyframe', source: 'shot:1', target: 'keyframe:1', kind: 'hierarchy' },
      { id: 'shot-storyboard', source: 'shot:1', target: 'storyboard:1', kind: 'hierarchy' },
      { id: 'shot-unit', source: 'shot:1', target: 'content_unit:1', kind: 'reference', relation: 'content_unit_shot' },
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
    selectedNodeId: 'shot:1',
    impactByNodeId: {},
  })

  assert.deepEqual(folded.graph.nodes.map((node) => node.id), ['shot:1'])
  assert.deepEqual(folded.collapsedSummariesByNodeId['shot:1'], [
    { kind: 'content_unit', count: 1, label: '制作项' },
    { kind: 'keyframe', count: 1, label: '关键帧' },
    { kind: 'storyboard', count: 1, label: '分镜' },
  ])
  assert.deepEqual(expanded.graph.nodes.map((node) => node.id), ['shot:1', 'keyframe:1', 'storyboard:1', 'content_unit:1'])
})

test('content canvas structure view keeps constraint nodes folded out of the backbone', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'shot:1', entityKey: '1', kind: 'shot', title: 'Shot 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'expression_unit:1', entityKey: '1', kind: 'expression_unit', title: 'Expression 1', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'audio_cue:1', entityKey: '1', kind: 'audio_cue', title: 'Audio 1', position: { x: 360, y: 180 } }),
    ],
    edges: [
      { id: 'expression-shot', source: 'expression_unit:1', target: 'shot:1', kind: 'reference', relation: 'expression_unit_shot' },
      { id: 'audio-shot', source: 'audio_cue:1', target: 'shot:1', kind: 'reference', relation: 'audio_cue_shot' },
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

  assert.deepEqual(plan.graph.nodes.map((node) => node.id), ['shot:1'])
  assert.deepEqual(plan.collapsedSummariesByNodeId['shot:1'], [
    { kind: 'expression_unit', count: 1, label: '表达' },
    { kind: 'audio_cue', count: 1, label: '声音' },
  ])
})

test('content canvas collapsed layout hides descendants but keeps selected descendant reachable', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'shot:1', entityKey: '1', kind: 'shot', title: 'Shot 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'keyframe:1', entityKey: '1', kind: 'keyframe', title: 'Keyframe 1', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'storyboard:1', entityKey: '1', kind: 'storyboard', title: 'Storyboard 1', position: { x: 360, y: 180 } }),
    ],
    edges: [
      { id: 'shot-keyframe', source: 'shot:1', target: 'keyframe:1', kind: 'hierarchy' },
      { id: 'shot-storyboard', source: 'shot:1', target: 'storyboard:1', kind: 'hierarchy' },
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
      'shot:1': { collapsed: true },
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
      'shot:1': { collapsed: true },
    },
  })

  assert.deepEqual(collapsed.graph.nodes.map((node) => node.id), ['shot:1'])
  assert.deepEqual(collapsed.collapsedSummariesByNodeId['shot:1'], [
    { kind: 'keyframe', count: 1, label: '关键帧' },
    { kind: 'storyboard', count: 1, label: '分镜' },
  ])
  assert.deepEqual(selectedDescendant.graph.nodes.map((node) => node.id), ['shot:1', 'keyframe:1'])
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
      nodeFixture({ id: 'shot:1', entityKey: '1', kind: 'shot', title: 'Shot 1', position: { x: 0, y: 0 } }),
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

  assert.deepEqual(plan.graph.nodes.map((node) => node.id), ['shot:1'])
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
  const graph = buildContentCanvasGraph({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    shots: [],
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
    shotCount: 0,
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
  const graph = buildContentCanvasGraph({
    projectId: 7,
    project: entityFixture('project', '7', 'project.json', { id: 7, title: 'Project' }),
    productions: [entityFixture('production', 'prod', 'productions/prod/production.json', { id: 'prod', title: 'Prod' })],
    segments: [entityFixture('segment', 'seg', 'productions/prod/segments/seg/segment.json', { id: 'seg', production_id: 'prod', title: 'Seg' })],
    sceneMoments: [entityFixture('scene_moment', 'scene', 'productions/prod/segments/seg/scene_moments/scene/scene_moment.json', { id: 'scene', segment_id: 'seg', title: 'Scene' })],
    shots: [entityFixture('shot', 'shot', 'productions/prod/segments/seg/scene_moments/scene/shots/shot/shot.json', { id: 'shot', scene_moment_id: 'scene', title: 'Shot' })],
    storyboards: [entityFixture('storyboard', 'main', 'productions/prod/segments/seg/scene_moments/scene/shots/shot/storyboards/main/storyboard.json', { id: 'main', shot_id: 'shot', title: 'Main board' })],
    expressionUnits: [entityFixture('expression_unit', 'exp', 'productions/prod/segments/seg/scene_moments/scene/expression_units/exp/expression_unit.json', { id: 'exp', scene_moment_id: 'scene', title: 'Expression' })],
    contentUnits: [entityFixture('content_unit', 'cu', 'productions/prod/segments/seg/scene_moments/scene/content_units/cu/content_unit.json', { id: 'cu', scene_moment_id: 'scene', title: 'Render shot' })],
    keyframes: [entityFixture('keyframe', 'kf', 'productions/prod/segments/seg/scene_moments/scene/shots/shot/keyframes/kf/keyframe.json', { id: 'kf', shot_id: 'shot', title: 'Keyframe' })],
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
          targetPath: 'productions/prod/segments/seg/scene_moments/scene/shots/shot/storyboards/main/storyboard.json',
          recommendedActor: 'human',
          actionLabels: ['复核选择'],
        },
      ],
    },
  })
  const scene = graph.nodes.find((node) => node.id === 'scene_moment:scene')
  const shot = graph.nodes.find((node) => node.id === 'shot:shot')

  assert.ok(scene)
  assert.ok(shot)
  assert.equal(graph.edges.find((edge) => edge.kind === 'hierarchy' && edge.source === 'scene_moment:scene' && edge.target === 'shot:shot')?.type, 'contains')
  assert.equal(graph.edges.find((edge) => edge.kind === 'hierarchy' && edge.source === 'shot:shot' && edge.target === 'storyboard:main')?.type, 'contains')
  assert.deepEqual(scene.metrics, [
    '镜头 1',
    '制作项 1',
    '关键帧 1',
    '分镜 1',
    '声音 1',
    '表达 1',
    '工作项 2',
    '需候选 1',
    '需复核 1',
    '缺失 1',
  ])
  assert.deepEqual(shot.metrics, [
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
  const graph = buildContentCanvasGraph({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    shots: [],
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
  const graphState = createContentCanvasGraphState(graph)

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
  const graph = buildContentCanvasGraph({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    shots: [],
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
  const graph = buildContentCanvasGraph({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    shots: [],
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
  const graph = buildContentCanvasGraph({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    shots: [],
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
  const graph = buildContentCanvasGraph({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    shots: [],
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
  const graph = buildContentCanvasGraph({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    shots: [],
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
    '制作项 image',
    '候选 1',
    '已选择候选',
  ])
})

test('content canvas read model hydrates keyframe generation task from path ref by default', () => {
  const keyframePath = 'productions/prod/segments/seg/scene_moments/scene/shots/shot/keyframes/kf_1/keyframe.json'
  const graph = buildContentCanvasGraph({
    projectId: 7,
    project: null,
    productions: [],
    segments: [],
    sceneMoments: [],
    shots: [],
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
    '制作项 image',
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

test('content canvas content unit ensure reuses existing matching ref instead of duplicating', async () => {
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
    service: {
      queryEntities: async () => [{
        entityKind: 'content_unit',
        entityKey: 'existing',
        path: existing.path,
        record: existing.record,
      }],
      upsertContentUnit: async (payload: unknown) => {
        calls.push({ kind: 'upsertContentUnit', payload })
        return { path: '', record: {} }
      },
    },
  } as never

  const result = await ensureContentUnitForRef(gateway, {
    id: 'canvas_asset_phone',
    refKind: 'asset',
    ref: 'phone',
    contentUnitType: 'asset_ref',
    outputKind: 'image',
    title: 'Phone 制作项',
    description: 'Create a phone reference.',
    prompt: 'Generate phone.',
  })

  assert.deepEqual(result, existing)
  assert.deepEqual(calls, [])
})

test('content canvas scene moment generation command ensures a scene_moment_ref content unit', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    service: {
      queryEntities: async () => [],
      querySettings: async () => [],
      queryAssets: async () => ({ assets: [] }),
      upsertSetting: async () => ({ record: {}, path: '' }),
      updateContentUnitEditPrompt: async () => ({ record: {}, path: '' }),
      upsertContentUnit: async (payload: unknown) => {
        calls.push({ kind: 'upsertContentUnit', payload })
        return {
          path: 'content_units/canvas_scene_scene_1/content_unit.json',
          record: { id: 'canvas_scene_scene_1' },
        }
      },
    },
    loadContentSourceWorkspaceData: async () => ({
      source: 'workspace',
      hierarchyTree: [],
      previewMoments: [],
      expressionUnitsByMoment: {},
      audioCuesByMoment: {},
      shotWorkspaceDetails: {},
      assetReferenceUnits: {},
    }),
    createProduction: async () => undefined,
    createSegment: async () => undefined,
    createSceneMoment: async () => undefined,
    createShot: async () => undefined,
    createExpressionUnit: async () => undefined,
    createKeyframe: async () => undefined,
    createStoryboard: async () => undefined,
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

  assert.equal(result.message, '已确保情节制作项')
  assert.deepEqual(result.changedNodeIds, ['content_unit:canvas_scene_scene_1'])
  assert.deepEqual((calls[0].payload as { unit: Record<string, unknown> }).unit, {
    id: 'canvas_scene_scene_1',
    title: 'Scene 1 制作项',
    content_unit_type: 'scene_moment_ref',
    output_kind: 'video',
    description: '从编排画布基于情节「Scene 1」创建。',
    scene_moment_ref: 'productions/prod/segments/seg/scene_moments/scene_1/scene_moment.json',
    edit_prompt: {
      text: '将情节「Scene 1」转化为可制作镜头，保留上游叙事目标和已有素材约束。',
    },
    model_intent: {
      source: 'content_canvas',
      scene_moment_node_id: 'scene_moment:scene_1',
    },
  })
})

test('content canvas keyframe creation also ensures a keyframe_ref content unit', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    service: {
      queryEntities: async () => [],
      querySettings: async () => [],
      queryAssets: async () => ({ assets: [] }),
      upsertSetting: async () => ({ record: {}, path: '' }),
      updateContentUnitEditPrompt: async () => ({ record: {}, path: '' }),
      upsertContentUnit: async (payload: unknown) => {
        calls.push({ kind: 'upsertContentUnit', payload })
        return {
          path: 'content_units/canvas_keyframe_kf_1/content_unit.json',
          record: { id: 'canvas_keyframe_kf_1' },
        }
      },
    },
    loadContentSourceWorkspaceData: async () => ({
      source: 'workspace',
      hierarchyTree: [],
      previewMoments: [],
      expressionUnitsByMoment: {},
      audioCuesByMoment: {},
      shotWorkspaceDetails: {},
      assetReferenceUnits: {},
    }),
    createProduction: async () => undefined,
    createSegment: async () => undefined,
    createSceneMoment: async () => undefined,
    createShot: async () => undefined,
    createExpressionUnit: async () => undefined,
    createKeyframe: async (payload: unknown) => {
      calls.push({ kind: 'createKeyframe', payload })
    },
    createStoryboard: async () => undefined,
    createContentUnitCandidate: async () => ({}),
    selectContentUnitCandidate: async () => undefined,
    writeHierarchyNode: async () => undefined,
  } as never
  const shot = nodeFixture({
    id: 'shot:shot_1',
    entityKey: 'shot_1',
    kind: 'shot',
    title: 'Shot 1',
    sourcePath: 'productions/prod/segments/seg/scene_moments/scene/shots/shot_1/shot.json',
    record: {
      production_id: 'prod',
      segment_id: 'seg',
      scene_moment_id: 'scene',
    },
    position: { x: 0, y: 0 },
  })

  const result = await createChildContentCanvasNode(7, shot, 'keyframe', {
    input: { id: 'kf_1', title: 'Keyframe 1' },
  }, gateway)

  assert.deepEqual(calls.map((call) => call.kind), ['createKeyframe', 'upsertContentUnit'])
  assert.equal(result.message, '已创建关键帧并确保制作项')
  assert.deepEqual(result.changedNodeIds, ['keyframe:kf_1', 'content_unit:canvas_keyframe_kf_1'])
  assert.deepEqual((calls[1].payload as { unit: Record<string, unknown> }).unit, {
    id: 'canvas_keyframe_kf_1',
    title: 'Keyframe 1 制作项',
    content_unit_type: 'keyframe_ref',
    output_kind: 'image',
    description: '从编排画布基于关键帧「kf_1」创建。',
    keyframe_ref: 'productions/prod/segments/seg/scene_moments/scene/shots/shot_1/keyframes/kf_1/keyframe.json',
    edit_prompt: {
      text: '为镜头「Shot 1」的关键帧生成视觉锚点候选，保持镜头构图、连续性和上游素材约束。',
    },
    model_intent: {
      source: 'content_canvas',
      keyframe_id: 'kf_1',
      shot_id: 'shot_1',
      shot_node_id: 'shot:shot_1',
    },
  })
})

test('content canvas asset creation also ensures an asset_ref content unit', async () => {
  const calls: Array<{ kind: string; payload: unknown }> = []
  const gateway = {
    service: {
      queryEntities: async () => [],
      querySettings: async () => [],
      queryAssets: async () => ({ assets: [] }),
      upsertSetting: async () => ({ record: {}, path: '' }),
      updateContentUnitEditPrompt: async () => ({ record: {}, path: '' }),
      upsertAsset: async (payload: unknown) => {
        calls.push({ kind: 'upsertAsset', payload })
        return {
          path: 'settings/hero/states/day/assets/phone/asset.json',
          record: { id: 'phone' },
        }
      },
      upsertContentUnit: async (payload: unknown) => {
        calls.push({ kind: 'upsertContentUnit', payload })
        return {
          path: 'content_units/canvas_asset_phone/content_unit.json',
          record: { id: 'canvas_asset_phone' },
        }
      },
    },
    loadContentSourceWorkspaceData: async () => ({
      source: 'workspace',
      hierarchyTree: [],
      previewMoments: [],
      expressionUnitsByMoment: {},
      audioCuesByMoment: {},
      shotWorkspaceDetails: {},
      assetReferenceUnits: {},
    }),
    createProduction: async () => undefined,
    createSegment: async () => undefined,
    createSceneMoment: async () => undefined,
    createShot: async () => undefined,
    createExpressionUnit: async () => undefined,
    createKeyframe: async () => undefined,
    createStoryboard: async () => undefined,
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

  assert.deepEqual(calls.map((call) => call.kind), ['upsertAsset', 'upsertContentUnit'])
  assert.equal(result.message, '已创建素材并确保制作项')
  assert.deepEqual((calls[0].payload as { payload: Record<string, unknown> }).payload, {
    id: 'phone',
    title: 'Phone',
    setting_id: 'hero',
    setting_state_id: 'day',
    slot: 'phone',
    asset_kind: 'image',
    prompt_hint: '从设定状态「Day state」创建。',
  })
  assert.deepEqual((calls[1].payload as { unit: Record<string, unknown> }).unit, {
    id: 'canvas_asset_phone',
    title: 'Phone 制作项',
    content_unit_type: 'asset_ref',
    output_kind: 'image',
    description: '从编排画布基于素材「Phone」创建。',
    asset_ref: 'settings/hero/states/day/assets/phone/asset.json',
    edit_prompt: {
      text: '为设定状态「Day state」下的素材「Phone」生成可复用参考图。',
    },
    model_intent: {
      source: 'content_canvas',
      asset_id: 'phone',
      state_id: 'day',
      state_node_id: 'state:day',
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

test('content canvas graph includes setting state and audio cue reference constraints', () => {
  const graph = buildContentCanvasGraph({
    projectId: 7,
    project: entityFixture('project', '7', 'project.json', { id: 7, title: 'Project' }),
    productions: [entityFixture('production', 'prod', 'productions/prod/production.json', { id: 'prod', title: 'Prod' })],
    segments: [entityFixture('segment', 'seg', 'productions/prod/segments/seg/segment.json', { id: 'seg', production_id: 'prod', title: 'Seg' })],
    sceneMoments: [entityFixture('scene_moment', 'scene', 'productions/prod/segments/seg/scene_moments/scene/scene_moment.json', { id: 'scene', segment_id: 'seg', title: 'Scene' })],
    shots: [entityFixture('shot', 'shot', 'productions/prod/segments/seg/scene_moments/scene/shots/shot/shot.json', { id: 'shot', scene_moment_id: 'scene', title: 'Shot' })],
    storyboards: [entityFixture('storyboard', 'main', 'productions/prod/segments/seg/scene_moments/scene/shots/shot/storyboards/main/storyboard.json', {
      id: 'main',
      shot_id: 'shot',
      title: 'Main board',
      setting_refs: [{ setting_id: 'hero', setting_state_id: 'rain' }],
    })],
    expressionUnits: [],
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
      storyboard_ref: 'productions/prod/segments/seg/scene_moments/scene/shots/shot/storyboards/main',
      shot_ref: 'shot',
      asset_refs: ['thunder'],
    })],
    contentUnitCandidates: {},
  })

  assert.ok(graph.nodes.find((node) => node.id === 'state:rain'))
  assert.ok(graph.nodes.find((node) => node.id === 'audio_cue:phone_buzz'))
  assert.ok(graph.edges.find((edge) => edge.id === 'setting:hero->state:rain'))
  assert.ok(graph.edges.find((edge) => edge.id === 'state:rain->asset:thunder'))
  assert.ok(!graph.edges.find((edge) => edge.id === 'setting:hero->asset:thunder'))
  assert.ok(graph.edges.find((edge) => edge.id === 'scene_moment:scene->audio_cue:phone_buzz'))
  assert.ok(graph.edges.find((edge) => edge.relation === 'audio_cue_storyboard' && edge.source === 'audio_cue:phone_buzz' && edge.target === 'storyboard:main'))
  assert.ok(graph.edges.find((edge) => edge.relation === 'audio_cue_shot' && edge.source === 'audio_cue:phone_buzz' && edge.target === 'shot:shot'))
  assert.ok(graph.edges.find((edge) => edge.relation === 'audio_cue_asset' && edge.source === 'audio_cue:phone_buzz' && edge.target === 'asset:thunder'))
  assert.ok(graph.edges.find((edge) => edge.relation === 'setting_state_reference' && edge.source === 'storyboard:main' && edge.target === 'state:rain'))
})

test('content canvas graph derives sequence edges for siblings without changing hierarchy', () => {
  const graph = buildContentCanvasGraph({
    projectId: 7,
    project: entityFixture('project', '7', 'project.json', { id: 7, title: 'Project' }),
    productions: [entityFixture('production', 'prod', 'productions/prod/production.json', { id: 'prod', title: 'Prod' })],
    segments: [entityFixture('segment', 'seg', 'productions/prod/segments/seg/segment.json', { id: 'seg', production_id: 'prod', title: 'Seg' })],
    sceneMoments: [entityFixture('scene_moment', 'scene', 'productions/prod/segments/seg/scene_moments/scene/scene_moment.json', { id: 'scene', segment_id: 'seg', title: 'Scene' })],
    shots: [
      entityFixture('shot', 'shot_b', 'productions/prod/segments/seg/scene_moments/scene/shots/shot_b/shot.json', { id: 'shot_b', scene_moment_id: 'scene', order: 2, title: 'Shot B' }),
      entityFixture('shot', 'shot_a', 'productions/prod/segments/seg/scene_moments/scene/shots/shot_a/shot.json', { id: 'shot_a', scene_moment_id: 'scene', order: 1, title: 'Shot A' }),
    ],
    storyboards: [],
    expressionUnits: [],
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
  const shotLedger = buildContentCanvasRelationLedger(graph, graph.nodes.find((node) => node.id === 'shot:shot_b') ?? null)

  assert.ok(graph.edges.find((edge) => edge.kind === 'hierarchy' && edge.source === 'scene_moment:scene' && edge.target === 'shot:shot_a'))
  assert.ok(graph.edges.find((edge) => edge.kind === 'hierarchy' && edge.source === 'scene_moment:scene' && edge.target === 'shot:shot_b'))
  assert.ok(graph.edges.find((edge) => edge.kind === 'sequence' && edge.source === 'shot:shot_a' && edge.target === 'shot:shot_b'))
  assert.equal(graph.edges.find((edge) => edge.kind === 'sequence' && edge.source === 'shot:shot_a' && edge.target === 'shot:shot_b')?.type, 'sequence')
  assert.ok(structurePlan.graph.edges.find((edge) => edge.kind === 'sequence'))
  assert.deepEqual(shotLedger.upstream.map((item) => [item.nodeId, item.relation]), [
    ['scene_moment:scene', '结构上级'],
    ['shot:shot_a', '上一项'],
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
  const group = sceneSettingGroupFromNode(setting, contentCanvasGraphIndex(graph), { x: 24, y: -16 })

  assert.equal(group.x, 24)
  assert.equal(group.y, -16)
  assert.deepEqual(group.states.map((item) => [item.state.id, item.assets.map((asset) => asset.id)]), [
    ['state:day', ['asset:phone']],
  ])
})

test('content canvas graph derives expression unit constraints into shot trace', () => {
  const graph = buildContentCanvasGraph({
    projectId: 7,
    project: entityFixture('project', '7', 'project.json', { id: 7, title: 'Project' }),
    productions: [entityFixture('production', 'prod', 'productions/prod/production.json', { id: 'prod', title: 'Prod' })],
    segments: [entityFixture('segment', 'seg', 'productions/prod/segments/seg/segment.json', { id: 'seg', production_id: 'prod', title: 'Seg' })],
    sceneMoments: [entityFixture('scene_moment', 'scene', 'productions/prod/segments/seg/scene_moments/scene/scene_moment.json', { id: 'scene', segment_id: 'seg', title: 'Scene' })],
    shots: [entityFixture('shot', 'shot', 'productions/prod/segments/seg/scene_moments/scene/shots/shot/shot.json', { id: 'shot', scene_moment_id: 'scene', title: 'Shot' })],
    storyboards: [entityFixture('storyboard', 'main', 'productions/prod/segments/seg/scene_moments/scene/shots/shot/storyboards/main/storyboard.json', { id: 'main', shot_id: 'shot', title: 'Main board' })],
    expressionUnits: [entityFixture('expression_unit', 'expr', 'productions/prod/segments/seg/scene_moments/scene/expression_units/expr/expression_unit.json', {
      id: 'expr',
      scene_moment_id: 'scene',
      title: 'Hesitation',
      shot_ref: 'shot',
      span: { storyboard_refs: ['main'] },
    })],
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
    selectedNodeId: 'shot:shot',
    impactByNodeId: {},
    largeGraphNodeThreshold: 1,
  })
  const shotLedger = buildContentCanvasRelationLedger(graph, graph.nodes.find((node) => node.id === 'shot:shot') ?? null)
  const contentUnitLedger = buildContentCanvasRelationLedger(graph, graph.nodes.find((node) => node.id === 'content_unit:cu') ?? null)

  assert.ok(graph.edges.find((edge) => edge.relation === 'expression_unit_shot' && edge.source === 'expression_unit:expr' && edge.target === 'shot:shot'))
  assert.ok(graph.edges.find((edge) => edge.relation === 'expression_unit_storyboard' && edge.source === 'expression_unit:expr' && edge.target === 'storyboard:main'))
  assert.ok(graph.edges.find((edge) => edge.relation === 'expression_unit_content_unit' && edge.source === 'expression_unit:expr' && edge.target === 'content_unit:cu'))
  assert.equal(graph.edges.find((edge) => edge.relation === 'expression_unit_content_unit')?.type, 'constrains')
  assert.ok(trace.graph.nodes.find((node) => node.id === 'expression_unit:expr'))
  assert.deepEqual(shotLedger.upstream.map((item) => [item.nodeId, item.relation]), [
    ['expression_unit:expr', '表达约束'],
    ['scene_moment:scene', '结构上级'],
  ])
  assert.deepEqual(contentUnitLedger.upstream.map((item) => [item.nodeId, item.relation]), [
    ['expression_unit:expr', '表达输入'],
    ['scene_moment:scene', '结构上级'],
  ])
})

test('content canvas shot trace keeps audio cue and setting state constraints visible', () => {
  const graph = graphFixture({
    nodes: [
      nodeFixture({ id: 'shot:1', entityKey: '1', kind: 'shot', title: 'Shot 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'storyboard:1', entityKey: '1', kind: 'storyboard', title: 'Storyboard 1', position: { x: 360, y: 0 } }),
      nodeFixture({ id: 'audio_cue:1', entityKey: '1', kind: 'audio_cue', title: 'Phone buzz', position: { x: 360, y: 180 } }),
      nodeFixture({ id: 'state:rain', entityKey: 'rain', kind: 'state', title: 'Rain panic', position: { x: 720, y: 0 } }),
    ],
    edges: [
      { id: 'shot-board', source: 'shot:1', target: 'storyboard:1', kind: 'hierarchy' },
      { id: 'audio-shot', source: 'audio_cue:1', target: 'shot:1', kind: 'reference', relation: 'audio_cue_shot' },
      { id: 'board-state', source: 'storyboard:1', target: 'state:rain', kind: 'reference', relation: 'setting_state_reference' },
    ],
  })

  const plan = buildContentCanvasViewPlan({
    graph,
    query: '',
    kindFilter: 'all',
    mode: 'dependency',
    selectedNodeId: 'shot:1',
    impactByNodeId: {},
    largeGraphNodeThreshold: 1,
  })
  const shotLedger = buildContentCanvasRelationLedger(graph, graph.nodes[0])
  const storyboardLedger = buildContentCanvasRelationLedger(graph, graph.nodes[1])

  assert.deepEqual(plan.graph.nodes.map((node) => node.id), ['shot:1', 'storyboard:1', 'audio_cue:1', 'state:rain'])
  assert.deepEqual(shotLedger.upstream.map((item) => [item.nodeId, item.relation]), [
    ['audio_cue:1', '声音约束'],
  ])
  assert.deepEqual(storyboardLedger.upstream.map((item) => [item.nodeId, item.relation]), [
    ['state:rain', '设定状态输入'],
    ['shot:1', '结构上级'],
  ])
})

function graphFixture(patch: Partial<ContentCanvasGraph> = {}): ContentCanvasGraph {
  return {
    nodes: [
      nodeFixture({ id: 'shot:1', entityKey: '1', kind: 'shot', title: 'Shot 1', position: { x: 0, y: 0 } }),
      nodeFixture({ id: 'asset:1', entityKey: '1', kind: 'asset', title: 'Asset 1', position: { x: 900, y: 0 } }),
    ],
    edges: [
      { id: 'shot-asset', source: 'shot:1', target: 'asset:1', kind: 'reference', relation: 'content_unit_asset' },
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
