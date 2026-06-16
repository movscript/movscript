import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import { createCandidateFromContentUnit } from './contentCanvasCandidateCommands'
import { ensureContentUnitForRef } from './contentCanvasContentUnitCommands'
import type { ContentCanvasCommandResult } from './contentCanvasCommands'
import type { ContentCanvasWorkspaceGateway } from './contentCanvasWorkspaceGateway'

export type ContentCanvasCreateAction =
  | 'setting'
  | 'state'
  | 'production'
  | 'segment'
  | 'scene_moment'
  | 'shot'
  | 'asset'
  | 'expression_unit'
  | 'keyframe'
  | 'storyboard'
  | 'candidate'

export type ContentCanvasCreateNodeInput = {
  id: string
  title: string
  status?: string
  settingKind?: ContentCanvasSettingKind
}

export type ContentCanvasExpressionUnitKind =
  | 'dialogue'
  | 'narration'
  | 'subtitle'
  | 'caption'
  | 'action'
  | 'visual_note'

export const CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS: Array<{ value: ContentCanvasExpressionUnitKind; label: string }> = [
  { value: 'dialogue', label: '对白' },
  { value: 'narration', label: '旁白' },
  { value: 'subtitle', label: '字幕' },
  { value: 'caption', label: '说明字幕' },
  { value: 'action', label: '动作' },
  { value: 'visual_note', label: '视觉提示' },
]

type ContentCanvasCreateNodeOptions = {
  input?: ContentCanvasCreateNodeInput
  position?: { x: number; y: number }
}

export type ContentCanvasSettingKind =
  | 'character'
  | 'location'
  | 'prop'
  | 'world_rule'
  | 'style'
  | 'other'

export async function createRootContentCanvasNode(
  projectId: number,
  action: Extract<ContentCanvasCreateAction, 'setting' | 'production'>,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  if (action === 'setting') return createSettingFromCanvas(projectId, options, gateway)
  return createProductionFromCanvas(projectId, options, gateway)
}

export async function createChildContentCanvasNode(
  projectId: number,
  parentNode: ContentCanvasNode,
  action: Exclude<ContentCanvasCreateAction, 'setting' | 'production'>,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  if (action === 'segment') return createSegmentFromProduction(projectId, parentNode, options, gateway)
  if (action === 'scene_moment') return createSceneMomentFromSegment(projectId, parentNode, options, gateway)
  if (action === 'state') return createStateFromSetting(projectId, parentNode, options, gateway)
  if (action === 'shot') return createShotFromSceneMoment(projectId, parentNode, options, gateway)
  if (action === 'asset') return createAssetFromSettingState(projectId, parentNode, options, gateway)
  if (action === 'expression_unit') return createExpressionUnitFromSceneMoment(projectId, parentNode, options, gateway)
  if (action === 'keyframe') return createKeyframeFromShot(projectId, parentNode, options, gateway)
  if (action === 'candidate') return createCandidateFromContentUnit(projectId, parentNode, options?.position, gateway)
  return createStoryboardFromShot(projectId, parentNode, options, gateway)
}

async function createStateFromSetting(
  projectId: number,
  settingNode: ContentCanvasNode,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(settingNode, 'setting', '设定')
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(options?.input, 'canvas_state', '新状态')
  const settingSlug = pathSegmentAfter(settingNode.sourcePath, 'settings') ?? safeToken(settingNode.entityKey)
  const targetPath = `settings/${settingSlug}/states/${input.id}/setting_state.json`
  const record = {
    schema: 'movscript.setting_state.v1',
    kind: 'setting_state',
    id: input.id,
    setting_id: settingNode.entityKey,
    title: input.title,
    status: input.status,
    state_kind: input.status,
    description: `从设定「${settingNode.title}」创建。`,
  }
  await gateway.writeHierarchyNode({
    projectId,
    targetPath,
    record,
  })
  return createdNodeResult(`state:${input.id}`, '已创建设定状态', options?.position, settingNode.id)
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

async function createSettingFromCanvas(
  projectId: number,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const { service } = gateway
  const input = createInputOrDefault(options?.input, 'canvas_setting', '新设定')
  const result = await service.upsertSetting({
    payload: {
      id: input.id,
      title: input.title,
      setting_kind: input.settingKind ?? 'other',
      description: '从内容编排画布创建。',
    },
  })
  const createdId = `setting:${String(result.record.id ?? input.id)}`
  return createdNodeResult(createdId, '已创建设定', options?.position)
}

async function createProductionFromCanvas(
  projectId: number,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(options?.input, 'canvas_production', '新制作')
  await gateway.createProduction({ projectId, id: input.id, title: input.title })
  return createdNodeResult(`production:${input.id}`, '已创建制作', options?.position)
}

async function createSegmentFromProduction(
  projectId: number,
  productionNode: ContentCanvasNode,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(productionNode, 'production', '制作')
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(options?.input, 'canvas_segment', '新情绪段')
  await gateway.createSegment({
    projectId,
    productionId: productionNode.entityKey,
    id: input.id,
    title: input.title,
    productionTitle: productionNode.title,
  })
  return createdNodeResult(`segment:${input.id}`, '已创建情绪段', options?.position, productionNode.id)
}

async function createSceneMomentFromSegment(
  projectId: number,
  segmentNode: ContentCanvasNode,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(segmentNode, 'segment', '情绪段')
  const productionId = requiredProductionId(segmentNode)
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(options?.input, 'canvas_scene', '新情节')
  await gateway.createSceneMoment({
    projectId,
    productionId,
    segmentId: segmentNode.entityKey,
    id: input.id,
    title: input.title,
    segmentTitle: segmentNode.title,
  })
  return createdNodeResult(`scene_moment:${input.id}`, '已创建情节', options?.position, segmentNode.id)
}

async function createShotFromSceneMoment(
  projectId: number,
  sceneMomentNode: ContentCanvasNode,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(sceneMomentNode, 'scene_moment', '情节')
  const refs = requiredSceneMomentRefs(sceneMomentNode)
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const id = timestampId('canvas_shot')
  await gateway.createShot({
    projectId,
    productionId: refs.productionId,
    segmentId: refs.segmentId,
    sceneMomentId: sceneMomentNode.entityKey,
    id,
    title: '新镜头',
  })
  return createdNodeResult(`shot:${id}`, '已创建镜头', options?.position, sceneMomentNode.id)
}

async function createExpressionUnitFromSceneMoment(
  projectId: number,
  sceneMomentNode: ContentCanvasNode,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(sceneMomentNode, 'scene_moment', '情节')
  const refs = requiredSceneMomentRefs(sceneMomentNode)
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(options?.input, 'canvas_expression', '新表达单元')
  await gateway.createExpressionUnit({
    projectId,
    productionId: refs.productionId,
    segmentId: refs.segmentId,
    sceneMomentId: sceneMomentNode.entityKey,
    id: input.id,
    title: input.title,
    kind: normalizeExpressionUnitKind(input.status),
    text: input.title,
    sceneMomentTitle: sceneMomentNode.title,
  })
  return createdNodeResult(`expression_unit:${input.id}`, '已创建表达单元', options?.position, sceneMomentNode.id)
}

async function createAssetFromSettingState(
  projectId: number,
  stateNode: ContentCanvasNode,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(stateNode, 'state', '设定状态')
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(options?.input, 'canvas_asset', '新素材')
  const settingId = idValue(stateNode.record.setting_id)
    ?? pathSegmentAfter(stateNode.sourcePath, 'settings')
  if (!settingId) throw new Error('当前设定状态缺少 setting 归属，无法创建素材')
  const result = await gateway.service.upsertAsset({
    payload: {
      id: input.id,
      title: input.title,
      setting_id: settingId,
      setting_state_id: stateNode.entityKey,
      slot: input.id,
      asset_kind: 'image',
      prompt_hint: `从设定状态「${stateNode.title}」创建。`,
    },
  })
  const assetRef = result.path
  const contentUnit = await ensureContentUnitForRef(gateway, {
    id: `canvas_asset_${input.id}`,
    refKind: 'asset',
    ref: assetRef,
    contentUnitType: 'asset_ref',
    outputKind: 'image',
    title: `${input.title} 制作项`,
    description: `从编排画布基于素材「${input.title}」创建。`,
    prompt: `为设定状态「${stateNode.title}」下的素材「${input.title}」生成可复用参考图。`,
    modelIntent: {
      asset_id: input.id,
      state_id: stateNode.entityKey,
      state_node_id: stateNode.id,
    },
  })
  const contentUnitId = idValue(contentUnit.record.id) ?? `canvas_asset_${input.id}`
  return {
    changedNodeIds: [`asset:${String(result.record.id ?? input.id)}`, `content_unit:${contentUnitId}`],
    affectedNodeIds: [stateNode.id, `asset:${String(result.record.id ?? input.id)}`, `content_unit:${contentUnitId}`],
    focusNodeId: `asset:${String(result.record.id ?? input.id)}`,
    nodePositions: options?.position ? { [`asset:${String(result.record.id ?? input.id)}`]: options.position } : undefined,
    message: '已创建素材并确保制作项',
  }
}

async function createKeyframeFromShot(
  projectId: number,
  shotNode: ContentCanvasNode,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(shotNode, 'shot', '镜头')
  const refs = requiredShotRefs(shotNode)
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(options?.input, 'canvas_keyframe', '新关键帧')
  await gateway.createKeyframe({
    projectId,
    productionId: refs.productionId,
    segmentId: refs.segmentId,
    sceneMomentId: refs.sceneMomentId,
    shotId: shotNode.entityKey,
    id: input.id,
    title: input.title,
    shotTitle: shotNode.title,
  })
  const keyframeRef = `productions/${refs.productionId}/segments/${refs.segmentId}/scene_moments/${refs.sceneMomentId}/shots/${shotNode.entityKey}/keyframes/${input.id}/keyframe.json`
  const contentUnit = await ensureContentUnitForRef(gateway, {
    id: `canvas_keyframe_${input.id}`,
    refKind: 'keyframe',
    ref: keyframeRef,
    contentUnitType: 'keyframe_ref',
    outputKind: 'image',
    title: `${input.title} 制作项`,
    description: `从编排画布基于关键帧「${input.id}」创建。`,
    prompt: `为镜头「${shotNode.title}」的关键帧生成视觉锚点候选，保持镜头构图、连续性和上游素材约束。`,
    modelIntent: {
      keyframe_id: input.id,
      shot_id: shotNode.entityKey,
      shot_node_id: shotNode.id,
    },
  })
  const contentUnitId = idValue(contentUnit.record.id) ?? `canvas_keyframe_${input.id}`
  return {
    changedNodeIds: [`keyframe:${input.id}`, `content_unit:${contentUnitId}`],
    affectedNodeIds: [shotNode.id, `keyframe:${input.id}`, `content_unit:${contentUnitId}`],
    focusNodeId: `keyframe:${input.id}`,
    nodePositions: options?.position ? { [`keyframe:${input.id}`]: options.position } : undefined,
    message: '已创建关键帧并确保制作项',
  }
}

async function createStoryboardFromShot(
  projectId: number,
  shotNode: ContentCanvasNode,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(shotNode, 'shot', '镜头')
  const refs = requiredShotRefs(shotNode)
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const id = timestampId('canvas_storyboard')
  await gateway.createStoryboard({
    projectId,
    productionId: refs.productionId,
    segmentId: refs.segmentId,
    sceneMomentId: refs.sceneMomentId,
    shotId: shotNode.entityKey,
    id,
    title: '新分镜图',
  })
  return createdNodeResult(`storyboard:${id}`, '已创建分镜图', options?.position, shotNode.id)
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

function assertNodeKind(node: ContentCanvasNode, kind: ContentCanvasNode['kind'], label: string): void {
  if (node.kind !== kind) {
    throw new Error(`当前操作只支持${label}节点`)
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

function safeToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'item'
}

function createInputOrDefault(
  input: ContentCanvasCreateNodeInput | undefined,
  prefix: string,
  fallbackTitle: string,
): ContentCanvasCreateNodeInput {
  const id = input?.id.trim() || timestampId(prefix)
  const title = input?.title.trim() || fallbackTitle
  return { ...input, id, title }
}

function normalizeExpressionUnitKind(value: string | undefined): ContentCanvasExpressionUnitKind {
  const match = CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS.find((option) => option.value === value)
  return match?.value ?? 'dialogue'
}

function idValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function pathSegmentAfter(path: string | undefined, segment: string): string | undefined {
  if (!path) return undefined
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}
