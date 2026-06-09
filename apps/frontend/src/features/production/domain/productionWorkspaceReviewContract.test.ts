import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildCurrentProductionWorkspaceSnapshot,
  buildMergedProductionWorkspace,
  buildWorkspaceReviewSegments,
  collectWorkspaceReviewNodes,
  type WorkspaceNodeDecisions,
  type WorkspaceSegmentNode,
} from './productionWorkspaceReviewModel'
import { buildProductionWorkspaceSeedMetadata } from './productionOrchestrationWorkspaceSeed'

const panelSource = readFileSync(resolve('src/features/production/components/workspaces/ProductionWorkspaceReviewPanel.tsx'), 'utf8')
const controlsSource = readFileSync(resolve('src/features/production/components/workspaces/ProductionWorkspaceReviewControls.tsx'), 'utf8')
const reviewUiSource = readFileSync(resolve('../../packages/ui/src/components/business/review/index.tsx'), 'utf8')
const controllerSource = readFileSync(resolve('src/features/production/presentation/useProductionWorkspaceReviewController.ts'), 'utf8')
const modelSource = readFileSync(resolve('src/features/production/domain/productionWorkspaceReviewModel.ts'), 'utf8')
const workspaceSeedSource = readFileSync(resolve('src/features/production/domain/productionOrchestrationWorkspaceSeed.ts'), 'utf8')
const dataSource = readFileSync(resolve('src/features/production/domain/productionOrchestrationData.ts'), 'utf8')
const sceneExpressionSource = readFileSync(resolve('src/features/production/components/ProductionSceneWriting.tsx'), 'utf8')
const expressionUnitModelSource = readFileSync(resolve('src/features/production/domain/productionExpressionUnits.ts'), 'utf8')
const semanticEntitiesSource = readFileSync(resolve('src/shared/infrastructure/api/semanticEntities.ts'), 'utf8')

test('production workspace review applies accepted changes over the current snapshot', () => {
  assert.match(dataSource, /PRODUCTION_ORCHESTRATION_ENTITY_KINDS[\s\S]*'keyframes'/)
  assert.match(dataSource, /PRODUCTION_ORCHESTRATION_ENTITY_KINDS[\s\S]*'settingUsages'/)
  assert.match(modelSource, /settings: \(referencesBySceneMoment\.get\(moment\.ID\) \?\? \[\]\)\.slice\(\)/)
  assert.match(workspaceSeedSource, /export function buildProductionWorkspaceSeedMetadata/)
  assert.equal(existsSync(resolve('src/features/production/application/productionWorkspaceAgentLaunch.ts')), false)
  assert.equal(existsSync(resolve('src/features/production/application/productionOrchestrationLaunchController.ts')), false)
  assert.match(controlsSource, /<ReviewWorkspaceFooterActions/)
  assert.match(reviewUiSource, /应用工作区到项目/)
  assert.match(panelSource, /useProductionWorkspaceReviewController\(/)
  assert.match(panelSource, /workspaceArtifact: ProductionWorkspaceArtifactContent/)
  assert.match(controllerSource, /return buildMergedProductionWorkspace\(currentSnapshot, segments, nodeDecisions\)/)
  assert.doesNotMatch(controllerSource, /previewProductionWorkspaceApply/)
  assert.doesNotMatch(controllerSource, /applyProductionWorkspace/)
  assert.match(controllerSource, /saveProductionWorkspaceSnapshot\(/)
})

test('production workspace artifact seed metadata records source versions and script brief', () => {
  const seed = buildProductionWorkspaceSeedMetadata({
    projectId: 7,
    production: {
      ID: 301,
      project_id: 7,
      script_version_id: 12,
      name: '制作 A',
      description: '制作说明',
      UpdatedAt: '2026-01-02T00:00:00.000Z',
      ignoredField: 'not included',
    },
    productionSnapshot: {
      segments: [{ id: 1, title: '段落', scene_moments: [{ id: 10, title: '情节' }] }],
    },
    scriptVersion: {
      ID: 12,
      project_id: 7,
      script_id: 3,
      version_number: 1,
      title: '剧本版本',
      source_type: 'manual',
      summary: '剧本摘要',
      content: '正文',
      raw_source: '',
      CreatedAt: '2026-01-01T00:00:00.000Z',
      UpdatedAt: '2026-01-03T00:00:00.000Z',
    },
    projectScripts: [{
      ID: 12,
      project_id: 7,
      script_id: 3,
      version_number: 1,
      title: '剧本版本',
      source_type: 'manual',
      content: '正文',
      raw_source: '',
      summary: '剧本摘要',
      CreatedAt: '2026-01-01T00:00:00.000Z',
      UpdatedAt: '2026-01-03T00:00:00.000Z',
    }],
    modelRef: 'frontend:WorkspaceDomainModel:production_workspace:v1',
  })

  assert.equal(seed.mode, 'snapshot')
  assert.equal(seed.data.production?.name, '制作 A')
  assert.equal(seed.data.production?.ignoredField, undefined)
  assert.equal(seed.data.production_script_brief.productionId, 301)
  assert.equal(seed.data.production_script_brief.scriptVersionId, 12)
  assert.equal(seed.data.production_script_brief.body_length, 2)
  assert.deepEqual(seed.sourceVersions.production_snapshot, { segmentCount: 1, sceneMomentCount: 1 })
  assert.deepEqual(seed.target, { projectId: 7, entityType: 'production', entityId: 301 })
})

test('production workspace snapshot model hydrates current project entities', () => {
  const snapshot = buildCurrentProductionWorkspaceSnapshot({
    segments: [{ ID: 1, title: '段落', order: 1 }],
    sceneMoments: [{ ID: 10, segment_id: 1, title: '情节', order: 1 }],
    settings: [{ ID: 20, name: '人物', kind: 'person' }],
    settingUsages: [{ ID: 200, owner_type: 'scene_moment', owner_id: 10, setting_id: 20, role: '主视角' }],
    contentUnits: [{ ID: 30, scene_moment_id: 10, title: '内容', order: 1 }],
    keyframes: [
      { ID: 40, scene_moment_id: 10, title: '情节画面', order: 1 },
      { ID: 41, content_unit_id: 30, title: '内容画面', order: 1 },
    ],
    assetSlots: [{ ID: 50, owner_type: 'scene_moment', owner_id: 10, name: '素材', order: 1 }],
    expressionUnits: [{ ID: 60, scene_moment_id: 10, kind: 'dialogue', speaker: '人物', text: '对白', intent: '人物表达', order: 1 }],
  })

  const moment = snapshot.segments[0]?.scene_moments?.[0]
  assert.equal(snapshot.segments[0]?.title, '段落')
  assert.equal(moment?.title, '情节')
  assert.equal(moment?.settings?.[0]?.name, '人物')
  assert.equal(moment?.settings?.[0]?.role, '主视角')
  assert.equal(moment?.expression_units?.[0]?.text, '对白')
  assert.equal(moment?.content_units?.length ?? 0, 0)
  assert.equal(moment?.keyframes?.length ?? 0, 0)
  assert.equal(moment?.asset_slots?.length ?? 0, 0)
})

test('production workspace review keeps internal delete markers out of apply payloads', () => {
  assert.match(modelSource, /__delete\?: boolean/)
  assert.match(modelSource, /if \(key === '__delete'\) continue/)
  assert.match(modelSource, /workspaceSnapshotAction\(node: \{ id\?: number \| null; __delete\?: boolean \}\)/)
})

test('production workspace review segments append deleted current snapshot children', () => {
  const currentSnapshot = {
    segments: [{
      id: 1,
      title: '当前段落',
      scene_moments: [{
        id: 10,
        title: '将被删除的情节',
        content_units: [{ id: 100, title: '旧内容', keyframes: [{ id: 1000, title: '旧画面' }] }],
        settings: [{ id: 200, name: '旧设定' }],
        asset_slots: [{ id: 300, name: '旧素材' }],
        keyframes: [{ id: 400, title: '情节画面' }],
      }],
    }],
  } satisfies { segments: WorkspaceSegmentNode[] }

  const reviewSegments = buildWorkspaceReviewSegments([{ id: 1, title: '当前段落', scene_moments: [] }], currentSnapshot)
  const deletedMoment = reviewSegments[0]?.scene_moments?.[0]

  assert.equal(deletedMoment?.id, 10)
  assert.equal(deletedMoment?.__delete, true)
  assert.equal(deletedMoment?.content_units?.[0]?.__delete, true)
  assert.equal(deletedMoment?.content_units?.[0]?.keyframes?.[0]?.__delete, true)
  assert.equal(deletedMoment?.asset_slots?.[0]?.__delete, true)
  assert.equal(deletedMoment?.keyframes?.[0]?.__delete, true)
  assert.deepEqual(deletedMoment?.settings, [])
})

test('production workspace review segments omit unchanged seeded snapshot nodes', () => {
  const currentSnapshot = {
    segments: [{
      id: 1,
      title: '当前段落',
      kind: 'act',
      summary: '摘要',
      order: 1,
      scene_moments: [{
        id: 10,
        title: '当前情节',
        description: '说明',
        content_units: [{ id: 100, title: '当前内容', description: '内容说明' }],
        keyframes: [{ id: 200, title: '当前画面', prompt: '画面提示' }],
        settings: [{ id: 300, name: '人物', role: '主角' }],
        asset_slots: [{ id: 400, name: '服装', priority: 'high' }],
      }],
    }],
  } satisfies { segments: WorkspaceSegmentNode[] }

  const reviewSegments = buildWorkspaceReviewSegments(currentSnapshot.segments, currentSnapshot)

  assert.deepEqual(reviewSegments, [])
})

test('production workspace review keeps only changed branches from a seeded snapshot', () => {
  const currentSnapshot = {
    segments: [{
      id: 1,
      title: '当前段落',
      scene_moments: [
        { id: 10, title: '旧情节', content_units: [{ id: 100, title: '旧内容' }] },
        { id: 11, title: '未改情节', content_units: [{ id: 101, title: '未改内容' }] },
      ],
    }],
  } satisfies { segments: WorkspaceSegmentNode[] }
  const workspaceSegments = [{
    id: 1,
    title: '当前段落',
    scene_moments: [
      { id: 10, title: '新情节', content_units: [{ id: 100, title: '旧内容' }] },
      { id: 11, title: '未改情节', content_units: [{ id: 101, title: '未改内容' }] },
    ],
  }] satisfies WorkspaceSegmentNode[]

  const reviewSegments = buildWorkspaceReviewSegments(workspaceSegments, currentSnapshot)

  assert.equal(reviewSegments.length, 1)
  assert.equal(reviewSegments[0]?.id, 1)
  assert.deepEqual(reviewSegments[0]?.scene_moments?.map((moment) => moment.id), [10])
  assert.deepEqual(reviewSegments[0]?.scene_moments?.[0]?.content_units, [])
  assert.deepEqual(collectWorkspaceReviewNodes(reviewSegments).map((node) => node.key), ['segment:1', 'scene_moment:10'])
})

test('production workspace review treats removed scene settings as deletions', () => {
  const currentSnapshot = {
    segments: [{
      id: 1,
      title: '当前段落',
      scene_moments: [{
        id: 10,
        title: '当前情节',
        settings: [
          { id: 20, name: '保留人物', role: '主角' },
          { id: 21, name: '移除人物', role: '配角' },
        ],
      }],
    }],
  } satisfies { segments: WorkspaceSegmentNode[] }
  const workspaceSegments = [{
    id: 1,
    title: '当前段落',
    scene_moments: [{
      id: 10,
      title: '当前情节',
      settings: [{ id: 20, name: '保留人物', role: '主角' }],
    }],
  }] satisfies WorkspaceSegmentNode[]

  const reviewSegments = buildWorkspaceReviewSegments(workspaceSegments, currentSnapshot)
  const deletedReference = reviewSegments[0]?.scene_moments?.[0]?.settings?.[0]
  const decisions: WorkspaceNodeDecisions = Object.fromEntries(
    collectWorkspaceReviewNodes(reviewSegments).map((node) => [node.key, 'accepted']),
  )
  const merged = buildMergedProductionWorkspace(currentSnapshot, reviewSegments, decisions)

  assert.equal(deletedReference?.id, 21)
  assert.equal(deletedReference?.__delete, true)
  assert.deepEqual(merged.segments[0]?.scene_moments?.[0]?.settings?.map((reference) => reference.id), [20])
})

test('production workspace review merge applies accepted updates and strips internal markers', () => {
  const currentSnapshot = {
    segments: [{
      id: 1,
      title: '旧段落',
      scene_moments: [
        { id: 10, title: '旧情节', content_units: [{ id: 100, title: '旧内容' }] },
        { id: 11, title: '删除情节', content_units: [{ id: 101, title: '删除内容' }] },
      ],
    }],
  } satisfies { segments: WorkspaceSegmentNode[] }
  const workspaceSegments = [{
    id: 1,
    title: '新段落',
    scene_moments: [{
      id: 10,
      title: '新情节',
      content_units: [
        { id: 100, title: '保留内容' },
        { client_id: 'new-unit', title: '新增内容' },
      ],
    }],
  }] satisfies WorkspaceSegmentNode[]
  const reviewSegments = buildWorkspaceReviewSegments(workspaceSegments, currentSnapshot)
  const decisions: WorkspaceNodeDecisions = Object.fromEntries(
    collectWorkspaceReviewNodes(reviewSegments).map((node) => [node.key, 'accepted']),
  )

  const merged = buildMergedProductionWorkspace(currentSnapshot, reviewSegments, decisions)
  const mergedSegment = merged.segments[0]
  const mergedMoments = mergedSegment?.scene_moments ?? []

  assert.equal(mergedSegment?.title, '新段落')
  assert.deepEqual(mergedMoments.map((moment) => moment.id ?? moment.client_id), [10])
  assert.equal(mergedMoments[0]?.title, '新情节')
  assert.deepEqual(mergedMoments[0]?.content_units?.map((unit) => unit.id ?? unit.client_id), [100, 'new-unit'])
  assert.doesNotMatch(JSON.stringify(merged), /__delete/)
})

test('production workspace entry point is not exposed as a header action', () => {
})

test('production orchestration expression unit surface removes redundant controls', () => {
  assert.match(sceneExpressionSource, /对白、动作、旁白、屏幕文字和镜头描述/)
  assert.match(expressionUnitModelSource, /\{ value: 'subtitle', label: '屏幕文字' \}/)
  assert.match(expressionUnitModelSource, /\{ value: 'visual', label: '镜头描述' \}/)
  assert.match(semanticEntitiesSource, /情节下逐条编辑的对白、动作、旁白、屏幕文字和镜头描述/)
  assert.match(semanticEntitiesSource, /\{ value: 'subtitle', label: '屏幕文字' \}/)
  assert.match(semanticEntitiesSource, /\{ value: 'visual', label: '镜头描述' \}/)
  assert.doesNotMatch(sceneExpressionSource, /可见动作|情绪落点|沉默/)
  assert.doesNotMatch(expressionUnitModelSource, /\{ value: 'silence'/)
  assert.doesNotMatch(semanticEntitiesSource, /\{ value: 'silence'|label: '沉默'/)
})
