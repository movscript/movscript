import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import { suggestedContentCanvasChildNodePosition } from './contentCanvasCreateNodeCommands'
import { ensureContentUnitForRef } from './contentCanvasContentUnitCommands'
import type { ContentCanvasWorkspaceGateway } from './contentCanvasWorkspaceGateway'
import { contentCanvasExpressionUnitOutputKind } from './contentCanvasExpressionUnitKinds'

export type { ContentCanvasCreateAction, ContentCanvasCreateNodeInput, ContentCanvasExpressionUnitKind, ContentCanvasSettingKind } from './contentCanvasCreateNodeCommands'
export {
  CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS,
  createChildContentCanvasNode,
  createRootContentCanvasNode,
  suggestedContentCanvasChildNodePosition,
} from './contentCanvasCreateNodeCommands'
export {
  createCandidateFromContentUnit,
  createCandidateFromResourceForContentUnit,
  selectCandidateNodeFromCanvas,
  selectContentUnitCandidateFromCanvas,
  uploadCandidateForContentUnit,
} from './contentCanvasCandidateCommands'

export type ContentCanvasExpressionUnitEditorInput = {
  title: string
  kind: string
}

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
  const assetRef = assetNode.entityKey
  const result = await ensureContentUnitForRef(gateway, {
    id: `cu_asset_${safeToken(assetNode.entityKey)}`,
    refKind: 'asset',
    ref: assetRef,
    contentUnitType: 'asset_ref',
    outputKind: outputKindForAsset(assetNode),
    title: `${assetNode.title} 创作片段`,
    description: `从编排画布基于素材「${assetNode.title}」创建。`,
    prompt: `基于已绑定素材「${assetNode.title}」生成可制作内容，保持与当前项目编排关系一致。`,
    modelIntent: {
      source: 'content_canvas',
      asset_node_id: assetNode.id,
    },
  })
  const createdId = `content_unit:${String(result.record.id ?? `cu_asset_${safeToken(assetNode.entityKey)}`)}`
  return {
    changedNodeIds: [createdId],
    affectedNodeIds: [assetNode.id, createdId],
    focusNodeId: createdId,
    nodePositions: { [createdId]: suggestedContentCanvasChildNodePosition(assetNode, 1) },
    message: '已确保素材创作片段',
  }
}

export async function updateCanvasNodeBasics(
  projectId: number,
  node: ContentCanvasNode,
  input: { title: string; summary: string },
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  void projectId
  if (!node.sourcePath) {
    throw new Error('当前节点缺少 workspace 路径，无法写入')
  }
  await gateway.updateEntityBasics({
    entityKind: engineEntityKindForNode(node),
    targetPath: node.sourcePath,
    record: node.record,
    title: input.title,
    summary: input.summary,
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
  await gateway.connectSceneMomentSetting({
    productionId: pathSegmentAfter(sceneMomentNode.sourcePath, 'productions'),
    segmentId: pathSegmentAfter(sceneMomentNode.sourcePath, 'segments'),
    sceneMomentId: sceneMomentNode.entityKey,
    sceneMomentRecord: {
      ...sceneMomentNode.record,
      __workspace_path: sceneMomentNode.sourcePath,
    },
    settingId: settingNode.entityKey,
    settingStateId: state.entityKey,
    role: 'scene_constraint',
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
    id: `cu_scene_${safeToken(sceneMomentNode.entityKey)}`,
    refKind: 'scene_moment',
    ref: sceneMomentNode.entityKey,
    contentUnitType: 'scene_moment_ref',
    outputKind: 'video',
    title: `${sceneMomentNode.title} 创作片段`,
    description: `从编排画布基于情节「${sceneMomentNode.title}」创建。`,
    prompt: `将情节「${sceneMomentNode.title}」转化为可制作镜头，保留上游叙事目标和已有素材约束。`,
    modelIntent: {
      scene_moment_node_id: sceneMomentNode.id,
    },
  })
  const createdId = `content_unit:${String(result.record.id ?? `cu_scene_${safeToken(sceneMomentNode.entityKey)}`)}`
  return {
    changedNodeIds: [createdId],
    affectedNodeIds: [sceneMomentNode.id, createdId],
    focusNodeId: createdId,
    nodePositions: { [createdId]: suggestedContentCanvasChildNodePosition(sceneMomentNode, 1) },
    message: '已确保情节创作片段',
  }
}

export type DefaultContentCanvasContentUnitDraft = {
  id: string
  refKind: 'asset' | 'scene_moment' | 'expression_unit' | 'keyframe' | 'storyboard'
  ref: string
  contentUnitType: string
  outputKind: string
  title: string
  description: string
  prompt: string
  modelIntent?: Record<string, unknown>
}

export function defaultContentUnitDraftForNode(node: ContentCanvasNode | undefined): DefaultContentCanvasContentUnitDraft | null {
  if (!node) return null
  if (node.kind === 'content_unit') return pendingContentUnitDraftFromNode(node)
  if (!isDefaultContentUnitSourceKind(node.kind)) return null
  const safeKey = safeToken(node.entityKey || node.id)
  const ref = node.entityKey
  const baseModelIntent = {
    source_node_id: node.id,
    source_node_kind: node.kind,
  }
  if (node.kind === 'asset') {
    return {
      id: `cu_asset_${safeKey}`,
      refKind: 'asset',
      ref,
      contentUnitType: 'asset_ref',
      outputKind: outputKindForAsset(node),
      title: `${node.title} 创作片段`,
      description: `从编排画布基于素材「${node.title}」创建。`,
      prompt: `基于已绑定素材「${node.title}」生成可制作内容，保持与当前项目编排关系一致。`,
      modelIntent: baseModelIntent,
    }
  }
  if (node.kind === 'scene_moment') {
    return {
      id: `cu_scene_${safeKey}`,
      refKind: 'scene_moment',
      ref,
      contentUnitType: 'scene_moment_ref',
      outputKind: 'video',
      title: `${node.title} 创作片段`,
      description: `从编排画布基于情节「${node.title}」创建。`,
      prompt: `将情节「${node.title}」转化为可制作镜头，保留上游叙事目标和已有素材约束。`,
      modelIntent: baseModelIntent,
    }
  }
  if (node.kind === 'expression_unit') {
    const expressionKind = stringValue(node.record.kind ?? node.record.expression_kind ?? node.record.type)
    return {
      id: `cu_expression_${safeKey}`,
      refKind: 'expression_unit',
      ref,
      contentUnitType: 'expression_unit_ref',
      outputKind: contentCanvasExpressionUnitOutputKind(expressionKind),
      title: `${node.title} 创作片段`,
      description: `从编排画布基于表达单元「${node.title}」创建。`,
      prompt: `将表达单元「${node.title}」转化为可制作候选。`,
      modelIntent: baseModelIntent,
    }
  }
  if (node.kind === 'keyframe') {
    return {
      id: `cu_keyframe_${safeKey}`,
      refKind: 'keyframe',
      ref,
      contentUnitType: 'keyframe_ref',
      outputKind: 'image',
      title: `${node.title} 创作片段`,
      description: `从编排画布基于关键帧「${node.title}」创建。`,
      prompt: `为关键帧「${node.title}」生成视觉候选。`,
      modelIntent: baseModelIntent,
    }
  }
  return {
    id: `cu_storyboard_${safeKey}`,
    refKind: 'storyboard',
    ref,
    contentUnitType: 'storyboard_ref',
    outputKind: 'image',
    title: `${node.title} 创作片段`,
    description: `从编排画布基于分镜图「${node.title}」创建。`,
    prompt: `为分镜图「${node.title}」生成视觉候选。`,
    modelIntent: baseModelIntent,
  }
}

export async function ensureDefaultContentUnitFromCanvasNode(
  projectId: number,
  node: ContentCanvasNode,
  gateway: ContentCanvasWorkspaceGateway,
  promptOverride?: string,
): Promise<ContentCanvasNode> {
  void projectId
  if (node.kind === 'content_unit' && node.sourcePath) return node
  const draft = defaultContentUnitDraftForNode(node)
  if (!draft) throw new Error('当前节点不支持默认创作片段')
  const result = await ensureContentUnitForRef(gateway, {
    ...draft,
    prompt: promptOverride ?? draft.prompt,
  })
  const id = String(result.record.id ?? draft.id)
  const outputKind = String(result.record.output_kind ?? draft.outputKind)
  return {
    id: `content_unit:${id}`,
    entityKey: id,
    kind: 'content_unit',
    title: String(result.record.title ?? draft.title),
    subtitle: outputKind,
    summary: promptTextFromContentUnitRecord(result.record) ?? promptOverride ?? draft.prompt,
    status: 'ready',
    metrics: [`创作片段 ${outputKind}`],
    sourcePath: contentUnitResultPath(result),
    record: result.record,
    candidates: [],
    position: node.position,
  }
}

export async function updateContentUnitPromptFromCanvas(
  projectId: number,
  contentUnitNode: ContentCanvasNode,
  promptText: string,
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(contentUnitNode, 'content_unit', '创作片段')
  if (!contentUnitNode.sourcePath) {
    throw new Error('创作片段节点缺少 workspace 路径，无法写入')
  }
  await gateway.service.updateContentUnitEditPrompt({
    targetPath: contentUnitNode.sourcePath,
    editPrompt: { text: promptText },
  })
  return {
    changedNodeIds: [contentUnitNode.id],
    affectedNodeIds: [contentUnitNode.id],
    focusNodeId: contentUnitNode.id,
    message: '已保存创作片段提示词',
  }
}

export async function updateExpressionUnitFromCanvas(
  projectId: number,
  expressionUnitNode: ContentCanvasNode,
  input: ContentCanvasExpressionUnitEditorInput,
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(expressionUnitNode, 'expression_unit', '表达单元')
  if (!expressionUnitNode.sourcePath) {
    throw new Error('表达单元节点缺少 workspace 路径，无法写入')
  }
  await gateway.updateExpressionUnit({
    projectId,
    targetPath: expressionUnitNode.sourcePath,
    title: input.title,
    kind: input.kind,
    text: stringValue(expressionUnitNode.record.text) ?? expressionUnitNode.summary ?? '',
    summary: stringValue(expressionUnitNode.record.intent ?? expressionUnitNode.record.summary ?? expressionUnitNode.record.description) ?? '',
    ...(stringValue(expressionUnitNode.record.speaker) ? { speaker: stringValue(expressionUnitNode.record.speaker) } : {}),
    ...(stringValue(expressionUnitNode.record.note) ? { note: stringValue(expressionUnitNode.record.note) } : {}),
  })
  return {
    changedNodeIds: [expressionUnitNode.id],
    affectedNodeIds: [expressionUnitNode.id],
    focusNodeId: expressionUnitNode.id,
    message: '已保存表达单元',
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

function isDefaultContentUnitSourceKind(kind: ContentCanvasNode['kind']): kind is DefaultContentCanvasContentUnitDraft['refKind'] {
  return kind === 'asset'
    || kind === 'scene_moment'
    || kind === 'expression_unit'
    || kind === 'keyframe'
    || kind === 'storyboard'
}

function pendingContentUnitDraftFromNode(node: ContentCanvasNode): DefaultContentCanvasContentUnitDraft | null {
  const draft = node.record.__contentCanvasDefaultUnit
  if (!isDefaultContentUnitDraft(draft)) return null
  return draft
}

function isDefaultContentUnitDraft(value: unknown): value is DefaultContentCanvasContentUnitDraft {
  if (!isRecord(value)) return false
  const refKind = value.refKind
  return (refKind === 'asset'
    || refKind === 'scene_moment'
    || refKind === 'expression_unit'
    || refKind === 'keyframe'
    || refKind === 'storyboard')
    && typeof value.id === 'string'
    && typeof value.ref === 'string'
    && typeof value.contentUnitType === 'string'
    && typeof value.outputKind === 'string'
    && typeof value.title === 'string'
    && typeof value.description === 'string'
    && typeof value.prompt === 'string'
}

function promptTextFromContentUnitRecord(record: Record<string, unknown>): string | undefined {
  const prompt = record.edit_prompt ?? record.editPrompt
  if (typeof prompt === 'string') return prompt
  if (isRecord(prompt)) return stringValue(prompt.text)
  return stringValue(record.prompt)
}

function contentUnitResultPath(result: { path?: string; contentUnitPath?: string; targetPath?: string; record: Record<string, unknown> }): string {
  return result.path ?? result.contentUnitPath ?? result.targetPath ?? ''
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

async function createDefaultSettingState(
  projectId: number,
  settingNode: ContentCanvasNode,
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasNode> {
  void projectId
  const id = timestampId('canvas_state')
  const result = await gateway.createSettingState({
    id,
    settingId: settingNode.entityKey,
    title: `${settingNode.title} Scene Moment 状态`,
    stateKind: 'scene_moment',
    description: '从 Scene Moment 画布添加设定时自动创建。',
  })
  const record = result.record
  const targetPath = result.path
  return {
    id: `state:${id}`,
    entityKey: id,
    kind: 'state',
    title: stringValue(record.title) ?? `${settingNode.title} Scene Moment 状态`,
    subtitle: stringValue(record.state_kind) ?? 'scene_moment',
    summary: stringValue(record.description) ?? '从 Scene Moment 画布添加设定时自动创建。',
    status: 'neutral',
    metrics: [],
    sourcePath: targetPath,
    record,
    candidates: [],
    position: suggestedContentCanvasChildNodePosition(settingNode, 1),
  }
}

function engineEntityKindForNode(node: ContentCanvasNode): string {
  if (node.kind === 'state') return 'setting_state'
  return String(node.record.kind ?? node.kind)
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
