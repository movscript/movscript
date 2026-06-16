import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import { suggestedContentCanvasChildNodePosition } from './contentCanvasCreateNodeCommands'
import { ensureContentUnitForRef } from './contentCanvasContentUnitCommands'
import type { ContentCanvasWorkspaceGateway } from './contentCanvasWorkspaceGateway'

export type { ContentCanvasCreateAction, ContentCanvasCreateNodeInput, ContentCanvasExpressionUnitKind, ContentCanvasSettingKind } from './contentCanvasCreateNodeCommands'
export {
  CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS,
  createChildContentCanvasNode,
  createRootContentCanvasNode,
  suggestedContentCanvasChildNodePosition,
} from './contentCanvasCreateNodeCommands'
export {
  selectCandidateNodeFromCanvas,
  selectContentUnitCandidateFromCanvas,
} from './contentCanvasCandidateCommands'

export interface ContentCanvasCommandResult {
  changedNodeIds: string[]
  affectedNodeIds: string[]
  focusNodeId?: string
  nodePositions?: Record<string, { x: number; y: number }>
  createdCandidates?: Array<{ contentUnitId: string; candidate: ContentCanvasCandidate }>
  selectedCandidates?: Array<{ contentUnitId: string; candidateId: string }>
  message: string
}

export async function createContentUnitFromAsset(
  projectId: number,
  assetNode: ContentCanvasNode,
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertAssetNode(assetNode)
  const assetRef = assetNode.sourcePath || assetNode.entityKey
  const result = await ensureContentUnitForRef(gateway, {
    id: `canvas_asset_${safeToken(assetNode.entityKey)}`,
    refKind: 'asset',
    ref: assetRef,
    contentUnitType: 'asset_ref',
    outputKind: outputKindForAsset(assetNode),
    title: `${assetNode.title} 制作项`,
    description: `从编排画布基于素材「${assetNode.title}」创建。`,
    prompt: `基于已绑定素材「${assetNode.title}」生成可制作内容，保持与当前项目编排关系一致。`,
    modelIntent: {
      source: 'content_canvas',
      asset_node_id: assetNode.id,
    },
  })
  const createdId = `content_unit:${String(result.record.id ?? `canvas_asset_${safeToken(assetNode.entityKey)}`)}`
  return {
    changedNodeIds: [createdId],
    affectedNodeIds: [assetNode.id, createdId],
    focusNodeId: createdId,
    nodePositions: { [createdId]: suggestedContentCanvasChildNodePosition(assetNode, 1) },
    message: '已确保素材制作项',
  }
}

export async function updateCanvasNodeBasics(
  projectId: number,
  node: ContentCanvasNode,
  input: { title: string; summary: string },
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  if (!node.sourcePath) {
    throw new Error('当前节点缺少 workspace 路径，无法写入')
  }
  await gateway.writeHierarchyNode({
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
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(sceneMomentNode, 'scene_moment', '情节')
  assertNodeKind(settingNode, 'setting', '设定')
  if (!sceneMomentNode.sourcePath) {
    throw new Error('当前情节缺少 workspace 路径，无法写入设定关系')
  }
  if (!gateway) throw new Error('Content canvas workspace gateway is required')

  const state = stateNode ?? await createDefaultSettingState(projectId, settingNode, gateway)
  const record = patchSettingReference(sceneMomentNode.record, settingNode, state)
  await gateway.writeHierarchyNode({
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
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(sceneMomentNode, 'scene_moment', '情节')
  const result = await ensureContentUnitForRef(gateway, {
    id: `canvas_scene_${safeToken(sceneMomentNode.entityKey)}`,
    refKind: 'scene_moment',
    ref: sceneMomentNode.sourcePath || sceneMomentNode.entityKey,
    contentUnitType: 'scene_moment_ref',
    outputKind: 'video',
    title: `${sceneMomentNode.title} 制作项`,
    description: `从编排画布基于情节「${sceneMomentNode.title}」创建。`,
    prompt: `将情节「${sceneMomentNode.title}」转化为可制作镜头，保留上游叙事目标和已有素材约束。`,
    modelIntent: {
      scene_moment_node_id: sceneMomentNode.id,
    },
  })
  const createdId = `content_unit:${String(result.record.id ?? `canvas_scene_${safeToken(sceneMomentNode.entityKey)}`)}`
  return {
    changedNodeIds: [createdId],
    affectedNodeIds: [sceneMomentNode.id, createdId],
    focusNodeId: createdId,
    nodePositions: { [createdId]: suggestedContentCanvasChildNodePosition(sceneMomentNode, 1) },
    message: '已确保情节制作项',
  }
}

export async function updateContentUnitPromptFromCanvas(
  projectId: number,
  contentUnitNode: ContentCanvasNode,
  promptText: string,
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(contentUnitNode, 'content_unit', '制作项')
  if (!contentUnitNode.sourcePath) {
    throw new Error('制作项节点缺少 workspace 路径，无法写入')
  }
  await gateway.service.updateContentUnitEditPrompt({
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
  gateway: ContentCanvasWorkspaceGateway,
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
  await gateway.writeHierarchyNode({
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
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasNode> {
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
  await gateway.writeHierarchyNode({
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
