import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildCurrentProductionProposalSnapshot,
  buildMergedProductionProposal,
  buildProposalReviewSegments,
  collectProposalReviewNodes,
  type ProposalNodeDecisions,
  type ProposalSegmentNode,
} from './productionProposalReviewModel'
import { buildProductionDraftSeedMetadata } from './productionOrchestrationDraftSeed'

const source = readFileSync(resolve('src/features/production/components/ProductionOrchestrationPage.tsx'), 'utf8')
const panelSource = readFileSync(resolve('src/features/production/components/proposals/ProductionProposalReviewPanel.tsx'), 'utf8')
const controlsSource = readFileSync(resolve('src/features/production/components/proposals/ProductionProposalReviewControls.tsx'), 'utf8')
const reviewUiSource = readFileSync(resolve('../../packages/ui/src/components/business/review/index.tsx'), 'utf8')
const controllerSource = readFileSync(resolve('src/features/production/presentation/useProductionProposalReviewController.ts'), 'utf8')
const orchestrationReviewControllerSource = readFileSync(resolve('src/features/production/application/productionOrchestrationReviewController.ts'), 'utf8')
const orchestrationLaunchControllerSource = readFileSync(resolve('src/features/production/application/productionOrchestrationLaunchController.ts'), 'utf8')
const modelSource = readFileSync(resolve('src/features/production/domain/productionProposalReviewModel.ts'), 'utf8')
const draftSeedSource = readFileSync(resolve('src/features/production/domain/productionOrchestrationDraftSeed.ts'), 'utf8')
const agentLaunchSource = readFileSync(resolve('src/features/production/application/productionProposalAgentLaunch.ts'), 'utf8')
const dataSource = readFileSync(resolve('src/features/production/domain/productionOrchestrationData.ts'), 'utf8')
const sceneWritingSource = readFileSync(resolve('src/features/production/components/ProductionSceneWriting.tsx'), 'utf8')
const writingModelSource = readFileSync(resolve('src/features/production/domain/productionWritingExpressions.ts'), 'utf8')
const semanticEntitiesSource = readFileSync(resolve('src/shared/infrastructure/api/semanticEntities.ts'), 'utf8')

test('production proposal review applies accepted changes over the current snapshot', () => {
  assert.match(source, /loadProductionOrchestrationData\(projectId!\)/)
  assert.match(dataSource, /PRODUCTION_ORCHESTRATION_ENTITY_KINDS[\s\S]*'keyframes'/)
  assert.match(dataSource, /PRODUCTION_ORCHESTRATION_ENTITY_KINDS[\s\S]*'creativeReferenceUsages'/)
  assert.match(source, /creativeReferenceUsages: data\?\.creativeReferenceUsages \?\? \[\]/)
  assert.match(modelSource, /creative_references: \(referencesBySceneMoment\.get\(moment\.ID\) \?\? \[\]\)\.slice\(\)/)
  assert.match(agentLaunchSource, /snapshotBase: input\.productionSnapshot/)
  assert.match(agentLaunchSource, /productionSnapshot: input\.productionSnapshot/)
  assert.match(agentLaunchSource, /seed: buildProductionDraftSeedMetadata\(/)
  assert.match(draftSeedSource, /export function buildProductionDraftSeedMetadata/)
  assert.match(agentLaunchSource, /export async function ensureProductionProposalDraft/)
  assert.match(agentLaunchSource, /seedProposalFromSnapshot/)
  assert.match(agentLaunchSource, /proposal: \{\s+segments: input\.productionSnapshot\.segments/)
  assert.match(orchestrationLaunchControllerSource, /requireLinkedScript: false/)
  assert.match(agentLaunchSource, /export function launchProductionProposalAgent/)
  assert.match(source, /useProductionOrchestrationReviewController\(\{/)
  assert.match(orchestrationReviewControllerSource, /buildProposalReviewSegments\(proposalPreviewDraft\.proposal\.segments, currentProductionSnapshot\)/)
  assert.match(orchestrationReviewControllerSource, /parseProductionProposalDraft\(draft\)/)
  assert.match(orchestrationReviewControllerSource, /localAgentClient\.getDraft/)
  assert.match(source, /openProposalPatchDialog/)
  assert.match(source, /<Dialog open=\{reviewOpen\}/)
  assert.match(source, /提案 Patch/)
  assert.doesNotMatch(source, /buildProductionProposalDraftWorkspaceData/)
  assert.doesNotMatch(source, /updateProductionProposalDraftText/)
  assert.doesNotMatch(source, /proposalModeActive/)
  assert.doesNotMatch(source, /workspaceSegments/)
  assert.doesNotMatch(source, /canDeleteFallbackContentUnits=\{proposalModeActive\}/)
  assert.doesNotMatch(source, /正式项目当前只读/)
  assert.doesNotMatch(source, /localAgentClient\.updateDraft/)
  assert.match(source, /Agent 调整提案/)
  assert.match(source, /proposalRevisionInstruction/)
  assert.match(source, /Agent 会读取并编辑当前 production proposal draft 文件/)
  assert.match(source, /<ProductionProposalReviewPanel/)
  assert.match(controlsSource, /<ReviewProposalFooterActions/)
  assert.match(reviewUiSource, /应用提案到项目/)
  assert.match(panelSource, /useProductionProposalReviewController\(/)
  assert.match(controllerSource, /return buildMergedProductionProposal\(currentSnapshot, segments, nodeDecisions\)/)
  assert.match(controllerSource, /previewProductionProposalApply\(projectId/)
  assert.match(controllerSource, /applyProductionProposal\(projectId/)
})

test('production proposal draft seed metadata records source versions and script brief', () => {
  const seed = buildProductionDraftSeedMetadata({
    projectId: 7,
    production: {
      ID: 301,
      project_id: 7,
      script_version_id: 12,
      name: '制作 A',
      description: '制作说明',
      status: 'draft',
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
      status: 'active',
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
      status: 'active',
      CreatedAt: '2026-01-01T00:00:00.000Z',
      UpdatedAt: '2026-01-03T00:00:00.000Z',
    }],
    modelRef: 'frontend:DraftDomainModel:production_proposal:v1',
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

test('production proposal snapshot model hydrates current project entities', () => {
  const snapshot = buildCurrentProductionProposalSnapshot({
    segments: [{ ID: 1, title: '段落', order: 1 }],
    sceneMoments: [{ ID: 10, segment_id: 1, title: '情节', order: 1 }],
    creativeReferences: [{ ID: 20, name: '人物', kind: 'person' }],
    creativeReferenceUsages: [{ ID: 200, owner_type: 'scene_moment', owner_id: 10, creative_reference_id: 20, role: '主视角' }],
    contentUnits: [{ ID: 30, scene_moment_id: 10, title: '内容', order: 1 }],
    keyframes: [
      { ID: 40, scene_moment_id: 10, title: '情节画面', order: 1 },
      { ID: 41, content_unit_id: 30, title: '内容画面', order: 1 },
    ],
    assetSlots: [{ ID: 50, owner_type: 'scene_moment', owner_id: 10, name: '素材', order: 1 }],
    writingExpressions: [{ ID: 60, scene_moment_id: 10, kind: 'dialogue', speaker: '人物', text: '对白', intent: '人物表达', order: 1 }],
  })

  const moment = snapshot.segments[0]?.scene_moments?.[0]
  assert.equal(snapshot.segments[0]?.title, '段落')
  assert.equal(moment?.title, '情节')
  assert.equal(moment?.creative_references?.[0]?.name, '人物')
  assert.equal(moment?.creative_references?.[0]?.role, '主视角')
  assert.equal(moment?.writing_expressions?.[0]?.text, '对白')
  assert.equal(moment?.content_units?.length ?? 0, 0)
  assert.equal(moment?.keyframes?.length ?? 0, 0)
  assert.equal(moment?.asset_slots?.length ?? 0, 0)
})

test('production proposal review keeps internal delete markers out of apply payloads', () => {
  assert.match(modelSource, /__delete\?: boolean/)
  assert.match(modelSource, /if \(key === '__delete'\) continue/)
  assert.match(modelSource, /proposalSnapshotAction\(node: \{ id\?: number \| null; __delete\?: boolean \}\)/)
})

test('production proposal review segments append deleted current snapshot children', () => {
  const currentSnapshot = {
    segments: [{
      id: 1,
      title: '当前段落',
      scene_moments: [{
        id: 10,
        title: '将被删除的情节',
        content_units: [{ id: 100, title: '旧内容', keyframes: [{ id: 1000, title: '旧画面' }] }],
        creative_references: [{ id: 200, name: '旧设定' }],
        asset_slots: [{ id: 300, name: '旧素材' }],
        keyframes: [{ id: 400, title: '情节画面' }],
      }],
    }],
  } satisfies { segments: ProposalSegmentNode[] }

  const reviewSegments = buildProposalReviewSegments([{ id: 1, title: '当前段落', scene_moments: [] }], currentSnapshot)
  const deletedMoment = reviewSegments[0]?.scene_moments?.[0]

  assert.equal(deletedMoment?.id, 10)
  assert.equal(deletedMoment?.__delete, true)
  assert.equal(deletedMoment?.content_units?.[0]?.__delete, true)
  assert.equal(deletedMoment?.content_units?.[0]?.keyframes?.[0]?.__delete, true)
  assert.equal(deletedMoment?.asset_slots?.[0]?.__delete, true)
  assert.equal(deletedMoment?.keyframes?.[0]?.__delete, true)
  assert.deepEqual(deletedMoment?.creative_references, [])
})

test('production proposal review segments omit unchanged seeded snapshot nodes', () => {
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
        creative_references: [{ id: 300, name: '人物', role: '主角' }],
        asset_slots: [{ id: 400, name: '服装', priority: 'high' }],
      }],
    }],
  } satisfies { segments: ProposalSegmentNode[] }

  const reviewSegments = buildProposalReviewSegments(currentSnapshot.segments, currentSnapshot)

  assert.deepEqual(reviewSegments, [])
})

test('production proposal review keeps only changed branches from a seeded snapshot', () => {
  const currentSnapshot = {
    segments: [{
      id: 1,
      title: '当前段落',
      scene_moments: [
        { id: 10, title: '旧情节', content_units: [{ id: 100, title: '旧内容' }] },
        { id: 11, title: '未改情节', content_units: [{ id: 101, title: '未改内容' }] },
      ],
    }],
  } satisfies { segments: ProposalSegmentNode[] }
  const proposalSegments = [{
    id: 1,
    title: '当前段落',
    scene_moments: [
      { id: 10, title: '新情节', content_units: [{ id: 100, title: '旧内容' }] },
      { id: 11, title: '未改情节', content_units: [{ id: 101, title: '未改内容' }] },
    ],
  }] satisfies ProposalSegmentNode[]

  const reviewSegments = buildProposalReviewSegments(proposalSegments, currentSnapshot)

  assert.equal(reviewSegments.length, 1)
  assert.equal(reviewSegments[0]?.id, 1)
  assert.deepEqual(reviewSegments[0]?.scene_moments?.map((moment) => moment.id), [10])
  assert.deepEqual(reviewSegments[0]?.scene_moments?.[0]?.content_units, [])
  assert.deepEqual(collectProposalReviewNodes(reviewSegments).map((node) => node.key), ['segment:1', 'scene_moment:10'])
})

test('production proposal review treats removed scene creative references as deletions', () => {
  const currentSnapshot = {
    segments: [{
      id: 1,
      title: '当前段落',
      scene_moments: [{
        id: 10,
        title: '当前情节',
        creative_references: [
          { id: 20, name: '保留人物', role: '主角' },
          { id: 21, name: '移除人物', role: '配角' },
        ],
      }],
    }],
  } satisfies { segments: ProposalSegmentNode[] }
  const proposalSegments = [{
    id: 1,
    title: '当前段落',
    scene_moments: [{
      id: 10,
      title: '当前情节',
      creative_references: [{ id: 20, name: '保留人物', role: '主角' }],
    }],
  }] satisfies ProposalSegmentNode[]

  const reviewSegments = buildProposalReviewSegments(proposalSegments, currentSnapshot)
  const deletedReference = reviewSegments[0]?.scene_moments?.[0]?.creative_references?.[0]
  const decisions: ProposalNodeDecisions = Object.fromEntries(
    collectProposalReviewNodes(reviewSegments).map((node) => [node.key, 'accepted']),
  )
  const merged = buildMergedProductionProposal(currentSnapshot, reviewSegments, decisions)

  assert.equal(deletedReference?.id, 21)
  assert.equal(deletedReference?.__delete, true)
  assert.deepEqual(merged.segments[0]?.scene_moments?.[0]?.creative_references?.map((reference) => reference.id), [20])
})

test('production proposal review merge applies accepted updates and strips internal markers', () => {
  const currentSnapshot = {
    segments: [{
      id: 1,
      title: '旧段落',
      scene_moments: [
        { id: 10, title: '旧情节', content_units: [{ id: 100, title: '旧内容' }] },
        { id: 11, title: '删除情节', content_units: [{ id: 101, title: '删除内容' }] },
      ],
    }],
  } satisfies { segments: ProposalSegmentNode[] }
  const proposalSegments = [{
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
  }] satisfies ProposalSegmentNode[]
  const reviewSegments = buildProposalReviewSegments(proposalSegments, currentSnapshot)
  const decisions: ProposalNodeDecisions = Object.fromEntries(
    collectProposalReviewNodes(reviewSegments).map((node) => [node.key, 'accepted']),
  )

  const merged = buildMergedProductionProposal(currentSnapshot, reviewSegments, decisions)
  const mergedSegment = merged.segments[0]
  const mergedMoments = mergedSegment?.scene_moments ?? []

  assert.equal(mergedSegment?.title, '新段落')
  assert.deepEqual(mergedMoments.map((moment) => moment.id ?? moment.client_id), [10])
  assert.equal(mergedMoments[0]?.title, '新情节')
  assert.deepEqual(mergedMoments[0]?.content_units?.map((unit) => unit.id ?? unit.client_id), [100, 'new-unit'])
  assert.doesNotMatch(JSON.stringify(merged), /__delete/)
})

test('production proposal entry point is not exposed as a header action', () => {
  assert.doesNotMatch(source, /生成编排提案/)
  assert.doesNotMatch(source, /生成创作方案/)
  assert.doesNotMatch(source, /审阅提案/)
})

test('production orchestration writing surface removes redundant expression controls', () => {
  assert.match(sceneWritingSource, /对白、动作、旁白、屏幕文字和镜头描述/)
  assert.match(writingModelSource, /\{ value: 'subtitle', label: '屏幕文字' \}/)
  assert.match(writingModelSource, /\{ value: 'visual', label: '镜头描述' \}/)
  assert.match(semanticEntitiesSource, /编剧在情节下逐条编辑的对白、动作、旁白、屏幕文字和镜头描述/)
  assert.match(semanticEntitiesSource, /\{ value: 'subtitle', label: '屏幕文字' \}/)
  assert.match(semanticEntitiesSource, /\{ value: 'visual', label: '镜头描述' \}/)
  assert.doesNotMatch(sceneWritingSource, /可见动作|情绪落点|沉默/)
  assert.doesNotMatch(writingModelSource, /\{ value: 'silence'/)
  assert.doesNotMatch(semanticEntitiesSource, /\{ value: 'silence'|label: '沉默'/)
})
