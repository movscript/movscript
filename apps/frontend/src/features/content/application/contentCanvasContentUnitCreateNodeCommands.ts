import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import { ensureContentUnitForRef } from './contentCanvasContentUnitCommands'
import type { ContentCanvasCommandResult } from './contentCanvasCommands'
import type { ContentCanvasWorkspaceGateway } from './contentCanvasWorkspaceGateway'
import {
  assertNodeKind,
  createInputOrDefault,
  createdNodeResult,
  idValue,
  pathSegmentAfter,
  requiredSceneMomentRefs,
  type ContentCanvasCreateNodeOptions,
} from './contentCanvasCreateNodeCommandHelpers'
import {
  contentCanvasExpressionUnitOutputKind,
  normalizeContentCanvasExpressionUnitKind,
} from './contentCanvasExpressionUnitKinds'

export async function createStateFromSetting(
  projectId: number,
  settingNode: ContentCanvasNode,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  void projectId
  assertNodeKind(settingNode, 'setting', '设定')
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(options?.input, 'canvas_state', '新状态')
  await gateway.createSettingState({
    id: input.id,
    settingId: settingNode.entityKey,
    title: input.title,
    stateKind: input.status,
    description: `从设定「${settingNode.title}」创建。`,
  })
  return createdNodeResult(`state:${input.id}`, '已创建设定状态', options?.position, settingNode.id)
}

export async function createAssetFromSettingState(
  projectId: number,
  stateNode: ContentCanvasNode,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  void projectId
  assertNodeKind(stateNode, 'state', '设定状态')
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(options?.input, 'canvas_asset', '新素材')
  const settingId = idValue(stateNode.record.setting_id)
    ?? pathSegmentAfter(stateNode.sourcePath, 'settings')
  if (!settingId) throw new Error('当前设定状态缺少 setting 归属，无法创建素材')
  const result = await gateway.createAsset({
    id: input.id,
    title: input.title,
    settingId,
    settingStateId: stateNode.entityKey,
    slot: input.id,
    assetKind: 'image',
    promptHint: `从设定状态「${stateNode.title}」创建。`,
  })
  const contentUnit = await ensureContentUnitForRef(gateway, {
    id: `cu_asset_${input.id}`,
    refKind: 'asset',
    ref: input.id,
    contentUnitType: 'asset_ref',
    outputKind: 'image',
    title: `${input.title} 创作片段`,
    description: `从编排画布基于素材「${input.title}」创建。`,
    prompt: `为设定状态「${stateNode.title}」下的素材「${input.title}」生成可复用参考图。`,
    modelIntent: {
      asset_id: input.id,
      state_id: stateNode.entityKey,
      state_node_id: stateNode.id,
    },
  })
  const contentUnitId = idValue(contentUnit.record.id) ?? `cu_asset_${input.id}`
  return {
    changedNodeIds: [`asset:${String(result.record.id ?? input.id)}`, `content_unit:${contentUnitId}`],
    affectedNodeIds: [stateNode.id, `asset:${String(result.record.id ?? input.id)}`, `content_unit:${contentUnitId}`],
    focusNodeId: `asset:${String(result.record.id ?? input.id)}`,
    nodePositions: options?.position ? { [`asset:${String(result.record.id ?? input.id)}`]: options.position } : undefined,
    message: '已创建素材并确保创作片段',
  }
}

export async function createExpressionUnitFromSceneMoment(
  projectId: number,
  sceneMomentNode: ContentCanvasNode,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(sceneMomentNode, 'scene_moment', '情节')
  const refs = requiredSceneMomentRefs(sceneMomentNode)
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(options?.input, 'canvas_expression', '新表达单元')
  const kind = normalizeContentCanvasExpressionUnitKind(input.status)
  await gateway.createExpressionUnit({
    projectId,
    productionId: refs.productionId,
    segmentId: refs.segmentId,
    sceneMomentId: sceneMomentNode.entityKey,
    id: input.id,
    title: input.title,
    kind,
    text: input.title,
    sceneMomentTitle: sceneMomentNode.title,
  })
  const contentUnit = await ensureContentUnitForRef(gateway, {
    id: `cu_expression_${input.id}`,
    refKind: 'expression_unit',
    ref: input.id,
    contentUnitType: 'expression_unit_ref',
    outputKind: contentCanvasExpressionUnitOutputKind(kind),
    title: `${input.title} 创作片段`,
    description: `从编排画布基于表达单元「${input.title}」创建。`,
    prompt: `将情节「${sceneMomentNode.title}」中的表达单元「${input.title}」转化为可制作候选。`,
    modelIntent: {
      expression_unit_id: input.id,
      scene_moment_id: sceneMomentNode.entityKey,
      scene_moment_node_id: sceneMomentNode.id,
    },
  })
  const contentUnitId = idValue(contentUnit.record.id) ?? `cu_expression_${input.id}`
  return {
    changedNodeIds: [`expression_unit:${input.id}`, `content_unit:${contentUnitId}`],
    affectedNodeIds: [sceneMomentNode.id, `expression_unit:${input.id}`, `content_unit:${contentUnitId}`],
    focusNodeId: `expression_unit:${input.id}`,
    nodePositions: options?.position ? { [`expression_unit:${input.id}`]: options.position } : undefined,
    message: '已创建表达单元并确保创作片段',
  }
}

export async function createKeyframeFromVisualOwner(
  projectId: number,
  ownerNode: ContentCanvasNode,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  return createVisualAnchorFromOwner(projectId, ownerNode, 'keyframe', options, gateway)
}

export async function createStoryboardFromVisualOwner(
  projectId: number,
  ownerNode: ContentCanvasNode,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  return createVisualAnchorFromOwner(projectId, ownerNode, 'storyboard', options, gateway)
}

async function createVisualAnchorFromOwner(
  projectId: number,
  ownerNode: ContentCanvasNode,
  kind: 'keyframe' | 'storyboard',
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  void projectId
  if (ownerNode.kind !== 'scene_moment' && ownerNode.kind !== 'expression_unit') {
    throw new Error('当前操作只支持情节或表达单元节点')
  }
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(
    options?.input,
    kind === 'keyframe' ? 'canvas_keyframe' : 'canvas_storyboard',
    kind === 'keyframe' ? '新关键帧' : '新分镜图',
  )
  const refs = requiredSceneMomentRefs(ownerNode)
  const sceneMomentId = ownerNode.kind === 'scene_moment'
    ? ownerNode.entityKey
    : idValue(ownerNode.record.scene_moment_id) ?? pathSegmentAfter(ownerNode.sourcePath, 'scene_moments')
  if (!sceneMomentId) throw new Error('当前表达单元缺少 scene moment 归属，无法创建视觉锚点')
  if (kind === 'keyframe') {
    await gateway.createKeyframe({
      id: input.id,
      productionId: refs.productionId,
      segmentId: refs.segmentId,
      sceneMomentId,
      ...(ownerNode.kind === 'expression_unit' ? { expressionUnitId: ownerNode.entityKey } : {}),
      title: input.title,
      role: input.status,
      visualIntent: `从${ownerNode.kind === 'expression_unit' ? '表达单元' : '情节'}「${ownerNode.title}」创建。`,
    })
  } else {
    await gateway.createStoryboard({
      id: input.id,
      productionId: refs.productionId,
      segmentId: refs.segmentId,
      sceneMomentId,
      ...(ownerNode.kind === 'expression_unit' ? { expressionUnitId: ownerNode.entityKey } : {}),
      title: input.title,
      visualIntent: `从${ownerNode.kind === 'expression_unit' ? '表达单元' : '情节'}「${ownerNode.title}」创建。`,
    })
  }
  const contentUnit = await ensureContentUnitForRef(gateway, {
    id: `cu_${kind}_${input.id}`,
    refKind: kind,
    ref: input.id,
    contentUnitType: `${kind}_ref`,
    outputKind: 'image',
    title: `${input.title} 创作片段`,
    description: `从编排画布基于${kind === 'keyframe' ? '关键帧' : '分镜图'}「${input.title}」创建。`,
    prompt: `为${ownerNode.kind === 'expression_unit' ? '表达单元' : '情节'}「${ownerNode.title}」生成${kind === 'keyframe' ? '关键帧' : '分镜图'}视觉候选。`,
    modelIntent: {
      [`${kind}_id`]: input.id,
      scene_moment_id: sceneMomentId,
      owner_node_id: ownerNode.id,
      ...(ownerNode.kind === 'expression_unit' ? { expression_unit_id: ownerNode.entityKey } : {}),
    },
  })
  const contentUnitId = idValue(contentUnit.record.id) ?? `cu_${kind}_${input.id}`
  return {
    changedNodeIds: [`${kind}:${input.id}`, `content_unit:${contentUnitId}`],
    affectedNodeIds: [ownerNode.id, `${kind}:${input.id}`, `content_unit:${contentUnitId}`],
    focusNodeId: `${kind}:${input.id}`,
    nodePositions: options?.position ? { [`${kind}:${input.id}`]: options.position } : undefined,
    message: kind === 'keyframe' ? '已创建关键帧并确保创作片段' : '已创建分镜图并确保创作片段',
  }
}
