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
import { buildProductionCurrentOverview } from './productionOrchestrationOverview'

const source = readFileSync(resolve('src/pages/project/production/ProductionOrchestrationPage.tsx'), 'utf8')
const panelSource = readFileSync(resolve('src/components/proposals/ProductionProposalReviewPanel.tsx'), 'utf8')
const controllerSource = readFileSync(resolve('src/components/proposals/useProductionProposalReviewController.ts'), 'utf8')
const orchestrationReviewControllerSource = readFileSync(resolve('src/lib/productionOrchestrationReviewController.ts'), 'utf8')
const modelSource = readFileSync(resolve('src/lib/productionProposalReviewModel.ts'), 'utf8')
const draftSeedSource = readFileSync(resolve('src/lib/productionOrchestrationDraftSeed.ts'), 'utf8')
const agentLaunchSource = readFileSync(resolve('src/lib/productionProposalAgentLaunch.ts'), 'utf8')
const overviewSource = readFileSync(resolve('src/lib/productionOrchestrationOverview.ts'), 'utf8')
const dataSource = readFileSync(resolve('src/lib/productionOrchestrationData.ts'), 'utf8')
const sceneWritingSource = readFileSync(resolve('src/components/workbench/ProductionSceneWriting.tsx'), 'utf8')
const writingModelSource = readFileSync(resolve('src/lib/productionWritingExpressions.ts'), 'utf8')
const semanticEntitiesSource = readFileSync(resolve('src/api/semanticEntities.ts'), 'utf8')

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
  assert.match(overviewSource, /export function buildProductionCurrentOverview/)
  assert.match(agentLaunchSource, /export async function ensureProductionProposalDraft/)
  assert.match(agentLaunchSource, /export function launchProductionProposalAgent/)
  assert.match(source, /useProductionOrchestrationReviewController\(\{/)
  assert.match(orchestrationReviewControllerSource, /buildProposalReviewSegments\(proposalPreviewDraft\.proposal\.segments, currentProductionSnapshot\)/)
  assert.match(orchestrationReviewControllerSource, /parseProductionProposalDraft\(draft\)/)
  assert.match(orchestrationReviewControllerSource, /localAgentClient\.getDraft/)
  assert.match(source, /<ProductionProposalReviewPanel/)
  assert.match(panelSource, /useProductionProposalReviewController\(/)
  assert.match(controllerSource, /return buildMergedProductionProposal\(currentSnapshot, segments, nodeDecisions\)/)
  assert.match(controllerSource, /previewProductionProposalApply\(projectId/)
  assert.match(controllerSource, /applyProductionProposal\(projectId/)
})

test('production current overview summarizes script binding and next step', () => {
  const withoutScript = buildProductionCurrentOverview({
    production: { ID: 301, name: '制作 A', status: 'draft' },
    scriptVersion: null,
    segments: [],
    sceneMoments: [],
    creativeReferences: [],
    assetSlots: [],
    contentUnits: [],
  })
  assert.deepEqual(withoutScript.position, ['制作：制作 A', '状态：draft', '剧本：未绑定'])
  assert.equal(withoutScript.sourceLabel, '当前现状')
  assert.deepEqual(withoutScript.nextStep, ['先选择一份剧本正文，再继续写情节。'])

  const withScript = buildProductionCurrentOverview({
    production: { ID: 301, name: '制作 A', status: 'active' },
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
    segments: [{ ID: 1, title: '段落' }],
    sceneMoments: [{ ID: 10, title: '情节' }],
    creativeReferences: [{ ID: 20, name: '人物' }],
    assetSlots: [{ ID: 50, name: '素材' }],
    contentUnits: [{ ID: 30, title: '内容' }],
  })
  assert.equal(withScript.sourceLabel, '剧本版本')
  assert.deepEqual(withScript.source, ['编排段 1', '情节 1', '设定资料 1', '素材需求 1'])
  assert.deepEqual(withScript.relations, ['最新编排段：段落', '最新情节：情节', '素材需求已覆盖部分当前制作上下文'])
  assert.deepEqual(withScript.nextStep, ['继续确认每个情节里的对白、动作、旁白和镜头描述。'])
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
  })

  const moment = snapshot.segments[0]?.scene_moments?.[0]
  assert.equal(snapshot.segments[0]?.title, '段落')
  assert.equal(moment?.title, '情节')
  assert.equal(moment?.creative_references?.[0]?.name, '人物')
  assert.equal(moment?.creative_references?.[0]?.role, '主视角')
  assert.equal(moment?.content_units?.[0]?.keyframes?.[0]?.title, '内容画面')
  assert.equal(moment?.keyframes?.[0]?.title, '情节画面')
  assert.equal(moment?.asset_slots?.[0]?.name, '素材')
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

test('production proposal entry point uses screenwriter-facing wording', () => {
  assert.match(source, /生成编排提案/)
  assert.doesNotMatch(source, /生成创作方案/)
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
