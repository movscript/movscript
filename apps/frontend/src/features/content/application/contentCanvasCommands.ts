import { createElectronMovScriptWorkspaceService } from '@/shared/infrastructure/workspaceDomainRepository'
import { currentWorkspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'
import { buildContentSourceWorkspaceCandidateCreatePlan, type ContentCandidateRecord } from '@movscript/core/content'
import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

export interface ContentCanvasCommandResult {
  changedNodeIds: string[]
  affectedNodeIds: string[]
  focusNodeId?: string
  nodePositions?: Record<string, { x: number; y: number }>
  createdCandidates?: Array<{ contentUnitId: string; candidate: ContentCanvasCandidate }>
  selectedCandidates?: Array<{ contentUnitId: string; candidateId: string }>
  message: string
}

export type ContentCanvasCreateAction =
  | 'setting'
  | 'production'
  | 'segment'
  | 'scene_moment'
  | 'shot'
  | 'expression_unit'
  | 'keyframe'
  | 'storyboard'
  | 'candidate'

export async function createContentUnitFromAsset(
  projectId: number,
  assetNode: ContentCanvasNode,
): Promise<ContentCanvasCommandResult> {
  assertAssetNode(assetNode)
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const contentUnitId = `canvas_asset_${safeToken(assetNode.entityKey)}_${Date.now()}`
  const assetRef = assetNode.sourcePath || assetNode.entityKey
  const result = await service.upsertContentUnit({
    unit: {
      id: contentUnitId,
      title: `${assetNode.title} 制作项`,
      content_unit_type: 'asset_ref',
      output_kind: outputKindForAsset(assetNode),
      description: `从编排画布基于素材「${assetNode.title}」创建。`,
      asset_ref: assetRef,
      edit_prompt: {
        text: `基于已绑定素材「${assetNode.title}」生成可制作内容，保持与当前项目编排关系一致。`,
      },
      model_intent: {
        source: 'content_canvas',
        asset_node_id: assetNode.id,
      },
    },
  })
  const createdId = `content_unit:${String(result.record.id ?? contentUnitId)}`
  return {
    changedNodeIds: [createdId],
    affectedNodeIds: [assetNode.id, createdId],
    focusNodeId: createdId,
    nodePositions: { [createdId]: suggestedContentCanvasChildNodePosition(assetNode, 1) },
    message: '已从素材创建制作项',
  }
}

export async function createRootContentCanvasNode(
  projectId: number,
  action: Extract<ContentCanvasCreateAction, 'setting' | 'production'>,
  position?: { x: number; y: number },
): Promise<ContentCanvasCommandResult> {
  if (action === 'setting') return createSettingFromCanvas(projectId, position)
  return createProductionFromCanvas(projectId, position)
}

export async function createChildContentCanvasNode(
  projectId: number,
  parentNode: ContentCanvasNode,
  action: Exclude<ContentCanvasCreateAction, 'setting' | 'production'>,
  position?: { x: number; y: number },
): Promise<ContentCanvasCommandResult> {
  if (action === 'segment') return createSegmentFromProduction(projectId, parentNode, position)
  if (action === 'scene_moment') return createSceneMomentFromSegment(projectId, parentNode, position)
  if (action === 'shot') return createShotFromSceneMoment(projectId, parentNode, position)
  if (action === 'expression_unit') return createExpressionUnitFromSceneMoment(projectId, parentNode, position)
  if (action === 'keyframe') return createKeyframeFromShot(projectId, parentNode, position)
  if (action === 'candidate') return createCandidateFromContentUnit(projectId, parentNode, position)
  return createStoryboardFromShot(projectId, parentNode, position)
}

async function createSettingFromCanvas(
  projectId: number,
  position?: { x: number; y: number },
): Promise<ContentCanvasCommandResult> {
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const id = timestampId('canvas_setting')
  const result = await service.upsertSetting({
    payload: {
      id,
      title: '新设定',
      setting_kind: 'other',
      description: '从内容编排画布创建。',
    },
  })
  const createdId = `setting:${String(result.record.id ?? id)}`
  return createdNodeResult(createdId, '已创建设定', position)
}

async function createProductionFromCanvas(
  projectId: number,
  position?: { x: number; y: number },
): Promise<ContentCanvasCommandResult> {
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const id = timestampId('canvas_production')
  await service.saveProductionSnapshot({
    productionId: id,
    snapshot: {
      production: { title: '新制作' },
      segments: [],
    },
  })
  return createdNodeResult(`production:${id}`, '已创建制作', position)
}

async function createSegmentFromProduction(
  projectId: number,
  productionNode: ContentCanvasNode,
  position?: { x: number; y: number },
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(productionNode, 'production', '制作')
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const id = timestampId('canvas_segment')
  await service.saveProductionSnapshot({
    productionId: productionNode.entityKey,
    snapshot: {
      segments: [{
        id,
        title: '新情绪段',
        kind: 'emotional_function',
        summary: `从制作「${productionNode.title}」创建。`,
      }],
    },
  })
  return createdNodeResult(`segment:${id}`, '已创建情绪段', position, productionNode.id)
}

async function createSceneMomentFromSegment(
  projectId: number,
  segmentNode: ContentCanvasNode,
  position?: { x: number; y: number },
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(segmentNode, 'segment', '情绪段')
  const productionId = requiredProductionId(segmentNode)
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const id = timestampId('canvas_scene')
  await service.saveProductionSnapshot({
    productionId,
    snapshot: {
      segments: [{
        id: segmentNode.entityKey,
        scene_moments: [{
          id,
          title: '新情节',
          action_text: `从情绪段「${segmentNode.title}」创建。`,
        }],
      }],
    },
  })
  return createdNodeResult(`scene_moment:${id}`, '已创建情节', position, segmentNode.id)
}

async function createShotFromSceneMoment(
  projectId: number,
  sceneMomentNode: ContentCanvasNode,
  position?: { x: number; y: number },
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(sceneMomentNode, 'scene_moment', '情节')
  const refs = requiredSceneMomentRefs(sceneMomentNode)
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const id = timestampId('canvas_shot')
  await service.saveProductionSnapshot({
    productionId: refs.productionId,
    snapshot: {
      segments: [{
        id: refs.segmentId,
        scene_moments: [{
          id: sceneMomentNode.entityKey,
          shots: [{
            id,
            title: '新镜头',
            kind: 'shot',
          }],
        }],
      }],
    },
  })
  return createdNodeResult(`shot:${id}`, '已创建镜头', position, sceneMomentNode.id)
}

async function createExpressionUnitFromSceneMoment(
  projectId: number,
  sceneMomentNode: ContentCanvasNode,
  position?: { x: number; y: number },
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(sceneMomentNode, 'scene_moment', '情节')
  const refs = requiredSceneMomentRefs(sceneMomentNode)
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const id = timestampId('canvas_expression')
  await service.saveProductionSnapshot({
    productionId: refs.productionId,
    snapshot: {
      segments: [{
        id: refs.segmentId,
        scene_moments: [{
          id: sceneMomentNode.entityKey,
          expression_units: [{
            id,
            kind: 'visual',
            text: '新表达单元',
            intent: `从情节「${sceneMomentNode.title}」创建。`,
          }],
        }],
      }],
    },
  })
  return createdNodeResult(`expression_unit:${id}`, '已创建表达单元', position, sceneMomentNode.id)
}

async function createKeyframeFromShot(
  projectId: number,
  shotNode: ContentCanvasNode,
  position?: { x: number; y: number },
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(shotNode, 'shot', '镜头')
  const refs = requiredShotRefs(shotNode)
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const id = timestampId('canvas_keyframe')
  await service.saveProductionSnapshot({
    productionId: refs.productionId,
    snapshot: {
      segments: [{
        id: refs.segmentId,
        scene_moments: [{
          id: refs.sceneMomentId,
          shots: [{
            id: shotNode.entityKey,
            keyframes: [{
              id,
              title: '新关键帧',
              role: 'visual_anchor',
              visual_intent: `从镜头「${shotNode.title}」创建。`,
            }],
          }],
        }],
      }],
    },
  })
  return createdNodeResult(`keyframe:${id}`, '已创建关键帧', position, shotNode.id)
}

async function createStoryboardFromShot(
  projectId: number,
  shotNode: ContentCanvasNode,
  position?: { x: number; y: number },
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(shotNode, 'shot', '镜头')
  const refs = requiredShotRefs(shotNode)
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const id = timestampId('canvas_storyboard')
  await service.saveProductionSnapshot({
    productionId: refs.productionId,
    snapshot: {
      segments: [{
        id: refs.segmentId,
        scene_moments: [{
          id: refs.sceneMomentId,
          shots: [{
            id: shotNode.entityKey,
            storyboards: [{
              id,
              title: '新分镜图',
              slot: id,
              asset_kind: 'image',
            }],
          }],
        }],
      }],
    },
  })
  return createdNodeResult(`storyboard:${id}`, '已创建分镜图', position, shotNode.id)
}

async function createCandidateFromContentUnit(
  projectId: number,
  contentUnitNode: ContentCanvasNode,
  position?: { x: number; y: number },
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(contentUnitNode, 'content_unit', '制作项')
  const createCandidate = readElectronApi()?.createMovScriptEngineContentCandidate
  if (!createCandidate) {
    throw new Error('当前窗口没有内容单元候选创建能力')
  }
  const plan = buildContentSourceWorkspaceCandidateCreatePlan({
    contentUnitId: contentUnitNode.entityKey,
    outputKind: contentUnitOutputKind(contentUnitNode),
    promptText: editPromptTextFromNode(contentUnitNode),
    candidateId: timestampId('canvas_candidate'),
  })
  console.log('[content-canvas] create content unit candidate request', {
    projectId,
    contentUnitId: contentUnitNode.entityKey,
    candidateId: plan.candidateId,
    source: plan.source,
    status: plan.status,
    outputs: plan.outputs,
  })
  const record = await createCandidate({
    ...currentWorkspaceOwnerContext(),
    projectId,
    ...plan,
  })
  console.log('[content-canvas] create content unit candidate result', {
    projectId,
    contentUnitId: contentUnitNode.entityKey,
    candidateId: record.id ?? plan.candidateId,
    source: record.source,
    status: record.status,
    outputs: record.outputs,
  })
  const candidateId = String(record.id ?? plan.candidateId)
  const candidateNodeId = `candidate:${contentUnitNode.entityKey}:${candidateId}`
  const candidate = contentCanvasCandidateFromContentRecord(record, plan.candidateId)
  return {
    changedNodeIds: [contentUnitNode.id, candidateNodeId],
    affectedNodeIds: [contentUnitNode.id, candidateNodeId],
    focusNodeId: candidateNodeId,
    nodePositions: {
      [candidateNodeId]: position ?? suggestedContentCanvasChildNodePosition(contentUnitNode, contentUnitNode.candidates.length + 1),
    },
    createdCandidates: [{ contentUnitId: contentUnitNode.entityKey, candidate }],
    message: '已创建后端制作项候选',
  }
}

export async function updateCanvasNodeBasics(
  projectId: number,
  node: ContentCanvasNode,
  input: { title: string; summary: string },
): Promise<ContentCanvasCommandResult> {
  if (!node.sourcePath) {
    throw new Error('当前节点缺少 workspace 路径，无法写入')
  }
  const writeNode = readElectronApi()?.writeMovScriptEngineHierarchyNode
  if (!writeNode) {
    throw new Error('当前窗口没有 MovScript hierarchy 写入能力')
  }
  await writeNode({
    ...currentWorkspaceOwnerContext(),
    projectId,
    targetPath: node.sourcePath,
    record: patchNodeBasics(node.record, input),
  })
  return {
    changedNodeIds: [node.id],
    affectedNodeIds: [node.id],
    focusNodeId: node.id,
    message: '已保存节点信息',
  }
}

export async function connectSceneMomentSettingFromCanvas(
  projectId: number,
  sceneMomentNode: ContentCanvasNode,
  settingNode: ContentCanvasNode,
  stateNode?: ContentCanvasNode,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(sceneMomentNode, 'scene_moment', '情节')
  assertNodeKind(settingNode, 'setting', '设定')
  if (!sceneMomentNode.sourcePath) {
    throw new Error('当前情节缺少 workspace 路径，无法写入设定关系')
  }
  const writeNode = readElectronApi()?.writeMovScriptEngineHierarchyNode
  if (!writeNode) {
    throw new Error('当前窗口没有 MovScript hierarchy 写入能力')
  }

  const state = stateNode ?? await createDefaultSettingState(projectId, settingNode)
  const record = patchSettingReference(sceneMomentNode.record, settingNode, state)
  await writeNode({
    ...currentWorkspaceOwnerContext(),
    projectId,
    targetPath: sceneMomentNode.sourcePath,
    record,
  })
  return {
    changedNodeIds: [sceneMomentNode.id, settingNode.id, state.id],
    affectedNodeIds: [sceneMomentNode.id, settingNode.id, state.id],
    focusNodeId: settingNode.id,
    message: `已将设定「${settingNode.title}」添加到当前情节`,
  }
}

export async function createContentUnitFromSceneMoment(
  projectId: number,
  sceneMomentNode: ContentCanvasNode,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(sceneMomentNode, 'scene_moment', '情节')
  const service = createElectronMovScriptWorkspaceService({ projectId })
  const contentUnitId = `canvas_scene_${safeToken(sceneMomentNode.entityKey)}_${Date.now()}`
  const result = await service.upsertContentUnit({
    unit: {
      id: contentUnitId,
      title: `${sceneMomentNode.title} 制作项`,
      content_unit_type: 'scene_moment_ref',
      output_kind: 'video',
      description: `从编排画布基于情节「${sceneMomentNode.title}」创建。`,
      scene_moment_ref: sceneMomentNode.sourcePath || sceneMomentNode.entityKey,
      edit_prompt: {
        text: `将情节「${sceneMomentNode.title}」转化为可制作镜头，保留上游叙事目标和已有素材约束。`,
      },
      model_intent: {
        source: 'content_canvas',
        scene_moment_node_id: sceneMomentNode.id,
      },
    },
  })
  const createdId = `content_unit:${String(result.record.id ?? contentUnitId)}`
  return {
    changedNodeIds: [createdId],
    affectedNodeIds: [sceneMomentNode.id, createdId],
    focusNodeId: createdId,
    nodePositions: { [createdId]: suggestedContentCanvasChildNodePosition(sceneMomentNode, 1) },
    message: '已从情节创建制作项',
  }
}

export async function updateContentUnitPromptFromCanvas(
  projectId: number,
  contentUnitNode: ContentCanvasNode,
  promptText: string,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(contentUnitNode, 'content_unit', '制作项')
  if (!contentUnitNode.sourcePath) {
    throw new Error('制作项节点缺少 workspace 路径，无法写入')
  }
  const service = createElectronMovScriptWorkspaceService({ projectId })
  await service.updateContentUnitEditPrompt({
    targetPath: contentUnitNode.sourcePath,
    editPrompt: { text: promptText },
  })
  return {
    changedNodeIds: [contentUnitNode.id],
    affectedNodeIds: [contentUnitNode.id],
    focusNodeId: contentUnitNode.id,
    message: '已保存制作项提示词',
  }
}

export async function connectContentUnitRelationFromCanvas(
  projectId: number,
  firstNode: ContentCanvasNode,
  secondNode: ContentCanvasNode,
): Promise<ContentCanvasCommandResult> {
  const contentUnitNode = firstNode.kind === 'content_unit' ? firstNode : secondNode.kind === 'content_unit' ? secondNode : undefined
  const upstreamNode = contentUnitNode?.id === firstNode.id ? secondNode : firstNode
  if (!contentUnitNode || !upstreamNode) {
    throw new Error('请将素材、情节、镜头、分镜图或关键帧连接到制作项')
  }
  if (!contentUnitNode.sourcePath) {
    throw new Error('制作项节点缺少 workspace 路径，无法写入关系')
  }
  const record = patchContentUnitRelation(contentUnitNode.record, upstreamNode)
  const writeNode = readElectronApi()?.writeMovScriptEngineHierarchyNode
  if (!writeNode) {
    throw new Error('当前窗口没有 MovScript hierarchy 写入能力')
  }
  await writeNode({
    ...currentWorkspaceOwnerContext(),
    projectId,
    targetPath: contentUnitNode.sourcePath,
    record,
  })
  return {
    changedNodeIds: [contentUnitNode.id],
    affectedNodeIds: [upstreamNode.id, contentUnitNode.id],
    focusNodeId: contentUnitNode.id,
    message: `已连接${relationLabel(upstreamNode.kind)}到制作项`,
  }
}

export async function selectContentUnitCandidateFromCanvas(
  projectId: number,
  contentUnitNode: ContentCanvasNode,
  candidate: ContentCanvasCandidate,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(contentUnitNode, 'content_unit', '制作项')
  const selectCandidate = readElectronApi()?.selectMovScriptEngineContentUnitCandidate
  if (!selectCandidate) {
    throw new Error('当前窗口没有内容单元候选选择能力')
  }
  await selectCandidate({
    ...currentWorkspaceOwnerContext(),
    projectId,
    contentUnitId: contentUnitNode.entityKey,
    candidateId: candidate.id,
    ...(candidate.resourceId ? { resourceId: candidate.resourceId } : {}),
    reason: 'content_source_workspace_selection',
  })
  return {
    changedNodeIds: [contentUnitNode.id, `candidate:${contentUnitNode.entityKey}:${candidate.id}`],
    affectedNodeIds: [contentUnitNode.id],
    focusNodeId: `candidate:${contentUnitNode.entityKey}:${candidate.id}`,
    createdCandidates: [{ contentUnitId: contentUnitNode.entityKey, candidate: { ...candidate, selected: true } }],
    selectedCandidates: [{ contentUnitId: contentUnitNode.entityKey, candidateId: candidate.id }],
    message: `已选择制作项候选 ${candidate.title}`,
  }
}

export async function selectCandidateNodeFromCanvas(
  projectId: number,
  candidateNode: ContentCanvasNode,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(candidateNode, 'candidate', '候选')
  const ownerContentUnitId = typeof candidateNode.record.ownerContentUnitId === 'string' ? candidateNode.record.ownerContentUnitId : ''
  const ownerContentUnitNodeId = typeof candidateNode.record.ownerContentUnitNodeId === 'string' ? candidateNode.record.ownerContentUnitNodeId : ''
  if (!ownerContentUnitId) {
    throw new Error('候选节点缺少制作项归属，无法选择')
  }
  const selectCandidate = readElectronApi()?.selectMovScriptEngineContentUnitCandidate
  if (!selectCandidate) {
    throw new Error('当前窗口没有内容单元候选选择能力')
  }
  const resourceId = typeof candidateNode.record.resourceId === 'number' ? candidateNode.record.resourceId : undefined
  await selectCandidate({
    ...currentWorkspaceOwnerContext(),
    projectId,
    contentUnitId: ownerContentUnitId,
    candidateId: candidateNode.entityKey,
    ...(resourceId ? { resourceId } : {}),
    reason: 'content_source_workspace_selection',
  })
  return {
    changedNodeIds: [ownerContentUnitNodeId || candidateNode.id, candidateNode.id],
    affectedNodeIds: [ownerContentUnitNodeId || candidateNode.id, candidateNode.id],
    focusNodeId: candidateNode.id,
    createdCandidates: [{ contentUnitId: ownerContentUnitId, candidate: contentCanvasCandidateFromCandidateNode(candidateNode, true) }],
    selectedCandidates: [{ contentUnitId: ownerContentUnitId, candidateId: candidateNode.entityKey }],
    message: `已选择候选 ${candidateNode.title}`,
  }
}

function assertAssetNode(node: ContentCanvasNode): void {
  assertNodeKind(node, 'asset', '素材')
  if (!node.sourcePath) {
    throw new Error('素材节点缺少 workspace 路径，无法写入')
  }
}

function assertNodeKind(node: ContentCanvasNode, kind: ContentCanvasNode['kind'], label: string): void {
  if (node.kind !== kind) {
    throw new Error(`当前操作只支持${label}节点`)
  }
}

function outputKindForAsset(node: ContentCanvasNode): string {
  const value = String(node.record.asset_kind ?? node.record.kind ?? node.subtitle ?? '').toLowerCase()
  if (value.includes('video')) return 'video'
  if (value.includes('audio')) return 'audio'
  if (value.includes('text')) return 'text'
  return 'image'
}

function createdNodeResult(
  createdId: string,
  message: string,
  position?: { x: number; y: number },
  parentNodeId?: string,
): ContentCanvasCommandResult {
  return {
    changedNodeIds: [createdId],
    affectedNodeIds: parentNodeId ? [parentNodeId, createdId] : [createdId],
    focusNodeId: createdId,
    nodePositions: position ? { [createdId]: position } : undefined,
    message,
  }
}

export function suggestedContentCanvasChildNodePosition(
  anchorNode: Pick<ContentCanvasNode, 'position'>,
  slot = 1,
): { x: number; y: number } {
  return {
    x: anchorNode.position.x + 360,
    y: anchorNode.position.y + Math.max(0, slot - 1) * 168,
  }
}

function requiredProductionId(node: ContentCanvasNode): string {
  const id = idValue(node.record.production_id)
    ?? pathSegmentAfter(node.sourcePath, 'productions')
  if (!id) throw new Error('当前节点缺少 production 归属，无法创建子节点')
  return id
}

function requiredSceneMomentRefs(node: ContentCanvasNode): { productionId: string; segmentId: string } {
  const productionId = requiredProductionId(node)
  const segmentId = idValue(node.record.segment_id)
    ?? pathSegmentAfter(node.sourcePath, 'segments')
  if (!segmentId) throw new Error('当前情节缺少 segment 归属，无法创建子节点')
  return { productionId, segmentId }
}

function requiredShotRefs(node: ContentCanvasNode): { productionId: string; segmentId: string; sceneMomentId: string } {
  const productionId = requiredProductionId(node)
  const segmentId = idValue(node.record.segment_id)
    ?? pathSegmentAfter(node.sourcePath, 'segments')
  const sceneMomentId = idValue(node.record.scene_moment_id)
    ?? pathSegmentAfter(stringValue(node.record.scene_moment_ref) ?? '', 'scene_moments')
    ?? pathSegmentAfter(node.sourcePath, 'scene_moments')
  if (!segmentId || !sceneMomentId) throw new Error('当前镜头缺少情节归属，无法创建子节点')
  return { productionId, segmentId, sceneMomentId }
}

function timestampId(prefix: string): string {
  return `${prefix}_${Date.now()}`
}

function pathSegmentAfter(path: string, segment: string): string | undefined {
  if (!path) return undefined
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function patchNodeBasics(
  record: Record<string, unknown>,
  input: { title: string; summary: string },
): Record<string, unknown> {
  const next = { ...record }
  if ('title' in next || !('name' in next) && !('label' in next)) {
    next.title = input.title
  } else if ('name' in next) {
    next.name = input.title
  } else {
    next.label = input.title
  }

  if ('summary' in next) {
    next.summary = input.summary
  } else if ('description' in next || !('action_text' in next) && !('action' in next) && !('prompt' in next)) {
    next.description = input.summary
  } else if ('action_text' in next) {
    next.action_text = input.summary
  } else if ('action' in next) {
    next.action = input.summary
  } else if (typeof next.prompt === 'string') {
    next.prompt = input.summary
  }
  return next
}

function patchContentUnitRelation(
  record: Record<string, unknown>,
  upstreamNode: ContentCanvasNode,
): Record<string, unknown> {
  const ref = upstreamNode.sourcePath || upstreamNode.entityKey
  if (upstreamNode.kind === 'asset') {
    return {
      ...record,
      asset_ref: ref,
      content_unit_type: typeof record.content_unit_type === 'string' ? record.content_unit_type : 'asset_ref',
      output_kind: typeof record.output_kind === 'string' ? record.output_kind : outputKindForAsset(upstreamNode),
    }
  }
  if (upstreamNode.kind === 'scene_moment') {
    return {
      ...record,
      scene_moment_ref: ref,
      content_unit_type: typeof record.content_unit_type === 'string' ? record.content_unit_type : 'scene_moment_ref',
      output_kind: typeof record.output_kind === 'string' ? record.output_kind : 'video',
    }
  }
  if (upstreamNode.kind === 'keyframe') {
    return {
      ...record,
      keyframe_ref: ref,
      content_unit_type: typeof record.content_unit_type === 'string' ? record.content_unit_type : 'keyframe_ref',
      output_kind: typeof record.output_kind === 'string' ? record.output_kind : 'image',
    }
  }
  if (upstreamNode.kind === 'shot') {
    return {
      ...record,
      shot_ref: ref,
      content_unit_type: typeof record.content_unit_type === 'string' ? record.content_unit_type : 'shot_ref',
      output_kind: typeof record.output_kind === 'string' ? record.output_kind : 'video',
    }
  }
  if (upstreamNode.kind === 'storyboard') {
    return {
      ...record,
      storyboard_ref: ref,
      content_unit_type: typeof record.content_unit_type === 'string' ? record.content_unit_type : 'storyboard_ref',
      output_kind: typeof record.output_kind === 'string' ? record.output_kind : 'image',
    }
  }
  throw new Error('当前只支持将素材、情节、镜头、分镜图或关键帧连接到制作项')
}

async function createDefaultSettingState(
  projectId: number,
  settingNode: ContentCanvasNode,
): Promise<ContentCanvasNode> {
  const writeNode = readElectronApi()?.writeMovScriptEngineHierarchyNode
  if (!writeNode) {
    throw new Error('当前窗口没有 MovScript hierarchy 写入能力')
  }
  const id = timestampId('canvas_state')
  const settingSlug = pathSegmentAfter(settingNode.sourcePath, 'settings') ?? safeToken(settingNode.entityKey)
  const targetPath = `settings/${settingSlug}/states/${id}/setting_state.json`
  const record = {
    schema: 'movscript.setting_state.v1',
    kind: 'setting_state',
    id,
    setting_id: settingNode.entityKey,
    title: `${settingNode.title} Scene Moment 状态`,
    state_kind: 'scene_moment',
    description: '从 Scene Moment 画布添加设定时自动创建。',
  }
  await writeNode({
    ...currentWorkspaceOwnerContext(),
    projectId,
    targetPath,
    record,
  })
  return {
    id: `state:${id}`,
    entityKey: id,
    kind: 'state',
    title: record.title,
    subtitle: record.state_kind,
    summary: record.description,
    status: 'neutral',
    metrics: [],
    sourcePath: targetPath,
    record,
    candidates: [],
    position: suggestedContentCanvasChildNodePosition(settingNode, 1),
  }
}

function patchSettingReference(
  record: Record<string, unknown>,
  settingNode: ContentCanvasNode,
  stateNode: ContentCanvasNode,
): Record<string, unknown> {
  const settingId = settingNode.entityKey
  const settingStateId = stateNode.entityKey
  const currentRefs = Array.isArray(record.setting_refs) ? record.setting_refs.filter(isRecord) : []
  const alreadyLinked = currentRefs.some((ref) => (
    stringValue(ref.setting_id ?? ref.settingId ?? ref.setting_ref ?? ref.settingRef) === settingId
    && stringValue(ref.setting_state_id ?? ref.settingStateId ?? ref.setting_state_ref ?? ref.settingStateRef) === settingStateId
  ))
  return {
    ...record,
    setting_refs: alreadyLinked
      ? currentRefs
      : [
        ...currentRefs,
        {
          setting_id: settingId,
          setting_state_id: settingStateId,
          role: 'scene_constraint',
        },
      ],
  }
}

function relationLabel(kind: ContentCanvasNode['kind']): string {
  if (kind === 'asset') return '素材'
  if (kind === 'scene_moment') return '情节'
  if (kind === 'shot') return '镜头'
  if (kind === 'storyboard') return '分镜图'
  if (kind === 'keyframe') return '关键帧'
  return '节点'
}

function safeToken(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'asset'
}

function idValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function contentUnitOutputKind(node: ContentCanvasNode): 'image' | 'video' | 'audio' | 'text' | 'storyboard' {
  const value = String(node.record.output_kind ?? node.record.outputKind ?? node.subtitle ?? '').toLowerCase()
  if (value.includes('video')) return 'video'
  if (value.includes('audio')) return 'audio'
  if (value.includes('text')) return 'text'
  if (value.includes('storyboard')) return 'storyboard'
  return 'image'
}

function editPromptTextFromNode(node: ContentCanvasNode): string | undefined {
  const prompt = node.record.edit_prompt ?? node.record.editPrompt
  if (typeof prompt === 'string') return prompt
  if (prompt && typeof prompt === 'object' && !Array.isArray(prompt)) {
    return stringValue((prompt as Record<string, unknown>).text)
  }
  return stringValue(node.record.prompt ?? node.record.description ?? node.summary)
}

function contentCanvasCandidateFromContentRecord(record: ContentCandidateRecord, fallbackId: string): ContentCanvasCandidate {
  const output = Array.isArray(record.outputs) ? record.outputs.find(isRecord) : undefined
  const resourceId = numberValue(output?.resource_id ?? output?.resourceId)
  const artifactRef = stringValue(output?.artifact_ref ?? output?.artifactRef)
  const resourceKind = stringValue(output?.kind)
  const inputHash = stringValue(record.prompt_snapshot?.input_hash ?? record.prompt_snapshot?.inputHash)
  const id = String(record.id ?? fallbackId)
  return {
    id,
    title: `候选 ${id}`,
    ...(resourceId !== undefined ? { resourceId } : {}),
    ...(resourceKind ? { resourceKind } : {}),
    ...(artifactRef ? { artifactRef } : {}),
    ...(inputHash ? { inputHash } : {}),
    source: stringValue(record.source) ?? 'backend',
    selected: false,
    notes: stringValue(record.status) ?? inputHash ?? '',
  }
}

function contentCanvasCandidateFromCandidateNode(node: ContentCanvasNode, selected: boolean): ContentCanvasCandidate {
  const resourceId = numberValue(node.record.resourceId)
  const resourceKind = stringValue(node.record.resourceKind)
  const artifactRef = stringValue(node.record.artifactRef)
  const inputHash = stringValue(node.record.inputHash)
  return {
    id: node.entityKey,
    title: node.title,
    ...(resourceId !== undefined ? { resourceId } : {}),
    ...(resourceKind ? { resourceKind } : {}),
    ...(artifactRef ? { artifactRef } : {}),
    ...(inputHash ? { inputHash } : {}),
    source: stringValue(node.record.source) ?? 'backend',
    selected,
    notes: stringValue(node.record.notes ?? node.record.status) ?? inputHash ?? '',
  }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
