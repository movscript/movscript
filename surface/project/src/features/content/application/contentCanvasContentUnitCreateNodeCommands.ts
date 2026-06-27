import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import { ensureContentUnitForRef } from './contentCanvasContentUnitCommands'
import type { ContentCanvasCommandResult } from './contentCanvasCommands'
import type { ContentCanvasGenerationOutputKind } from './contentCanvasCreateNodeCommands'
import type { ContentCanvasWorkspaceGateway } from './contentCanvasWorkspaceGateway'
import {
  assertLegacyTimelineMount,
  assertNodeKind,
  createInputOrDefault,
  createdNodeResult,
  idValue,
  optionalSceneMomentId,
  pathSegmentAfter,
  requiredSceneMomentRefs,
  safeToken,
  type ContentCanvasCreateNodeOptions,
} from './contentCanvasCreateNodeCommandHelpers'
import {
  contentCanvasExpressionUnitOutputKind,
  normalizeContentCanvasExpressionUnitKind,
} from './contentCanvasExpressionUnitKinds'

export async function createNakedGenerationTaskCanvasNode(
  projectId: number,
  outputKind: ContentCanvasGenerationOutputKind,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  void projectId
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(
    options?.input,
    `canvas_${outputKind}_task`,
    `${contentCanvasOutputKindLabel(outputKind)}任务`,
  )
  const result = await gateway.createContentUnit({
    id: input.id,
    title: input.title,
    contentUnitType: `canvas_${outputKind}_task`,
    outputKind,
    generationRole: 'naked_task',
    description: `从创作画布创建的${contentCanvasOutputKindLabel(outputKind)}裸生成任务。`,
    prompt: `${input.title}`,
    modelIntent: {
      source: 'content_canvas_naked_task',
      canvas_task: true,
      output_kind: outputKind,
    },
  })
  const contentUnitId = idValue(result.record.id) ?? input.id
  const nodeId = `content_unit:${contentUnitId}`
  return {
    changedNodeIds: [nodeId],
    affectedNodeIds: [nodeId],
    focusNodeId: nodeId,
    nodePositions: options?.position ? { [nodeId]: options.position } : undefined,
    message: `已创建${contentCanvasOutputKindLabel(outputKind)}任务`,
  }
}

export async function createSceneMomentCanvasNode(
  projectId: number,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(options?.input, 'canvas_scene', '新情节')
  const timelineNamespacePath = input.targetTimelineNamespacePath?.trim()
  if (timelineNamespacePath) {
    return createSceneMomentInTimelineNamespace(projectId, input, timelineNamespacePath, options, gateway)
  }
  const productionId = input.targetProductionId?.trim()
  const productionTitle = input.targetProductionTitle?.trim() || `${input.title} 制作`
  const segmentId = input.targetSegmentId?.trim()
  const segmentTitle = input.targetSegmentTitle?.trim() || `${input.title} 段落`
  const changedNodeIds: string[] = []
  const wantsLegacyTimelineMount = Boolean(
    productionId
    || segmentId
    || input.createTargetProduction
    || input.createTargetSegment,
  )
  if (wantsLegacyTimelineMount && !input.legacyTimelineMount) {
    assertLegacyTimelineMount(input, '创建情节节点')
  }
  if (!productionId || !segmentId) {
    throw new Error('创建情节视频节点需要显式选择或新建制作与段落；如果只是临时生成，请创建裸视频任务。')
  }

  if (input.createTargetProduction) {
    await gateway.createProduction({ projectId, id: productionId, title: productionTitle })
    changedNodeIds.push(`production:${productionId}`)
  }
  if (input.createTargetSegment) {
    await gateway.createSegment({
      projectId,
      productionId,
      id: segmentId,
      title: segmentTitle,
      productionTitle,
    })
    changedNodeIds.push(`segment:${segmentId}`)
  }

  await gateway.createSceneMoment({
    projectId,
    productionId,
    segmentId,
    id: input.id,
    title: input.title,
    segmentTitle,
  })
  changedNodeIds.push(`scene_moment:${input.id}`)

  const mount = await ensureCanvasSettingStateForInput(projectId, input, {
    settingId: `scene_setting_${safeToken(input.id)}`,
    settingTitle: `${input.title} 设定`,
    stateId: `scene_state_${safeToken(input.id)}`,
    stateTitle: `${input.title} 状态`,
    required: false,
  }, gateway)
  if (mount) {
    changedNodeIds.push(...mount.changedNodeIds)
    await gateway.connectSceneMomentSetting({
      productionId,
      segmentId,
      sceneMomentId: input.id,
      sceneMomentRecord: {
        id: input.id,
        title: input.title,
        production_id: productionId,
        segment_id: segmentId,
      },
      settingId: mount.settingId,
      settingStateId: mount.stateId,
      role: 'scene_constraint',
    })
  }

  const contentUnit = await ensureContentUnitForRef(gateway, {
    id: `cu_scene_${safeToken(input.id)}`,
    refKind: 'scene_moment',
    ref: input.id,
    contentUnitType: 'scene_moment_ref',
    outputKind: 'video',
    title: `${input.title} 创作片段`,
    description: `从创作画布基于情节「${input.title}」创建。`,
    prompt: `将情节「${input.title}」转化为可制作镜头。`,
    modelIntent: {
      scene_moment_id: input.id,
      production_id: productionId,
      segment_id: segmentId,
      legacy_timeline_mount: true,
    },
  })
  const contentUnitId = idValue(contentUnit.record.id) ?? `cu_scene_${safeToken(input.id)}`

  return {
    changedNodeIds: [...changedNodeIds, `content_unit:${contentUnitId}`],
    affectedNodeIds: [...changedNodeIds, `content_unit:${contentUnitId}`],
    focusNodeId: `scene_moment:${input.id}`,
    nodePositions: options?.position ? { [`scene_moment:${input.id}`]: options.position } : undefined,
    message: '已创建情节节点并绑定创作片段',
  }
}

async function createSceneMomentInTimelineNamespace(
  projectId: number,
  input: NonNullable<ContentCanvasCreateNodeOptions['input']>,
  timelineNamespacePath: string,
  options: ContentCanvasCreateNodeOptions | undefined,
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  const changedNodeIds: string[] = []
  const mount = await ensureCanvasSettingStateForInput(projectId, input, {
    settingId: `scene_setting_${safeToken(input.id)}`,
    settingTitle: `${input.title} 设定`,
    stateId: `scene_state_${safeToken(input.id)}`,
    stateTitle: `${input.title} 状态`,
    required: false,
  }, gateway)
  if (mount) changedNodeIds.push(...mount.changedNodeIds)

  await gateway.writeHierarchyNode({
    targetPath: timelineNamespaceSceneMomentPath(timelineNamespacePath, input.id),
    record: timelineNamespaceSceneMomentRecord(projectId, input, mount),
  })
  changedNodeIds.push(`scene_moment:${input.id}`)

  const contentUnit = await ensureContentUnitForRef(gateway, {
    id: `cu_scene_${safeToken(input.id)}`,
    refKind: 'scene_moment',
    ref: input.id,
    contentUnitType: 'scene_moment_ref',
    outputKind: 'video',
    title: `${input.title} 创作片段`,
    description: `从创作画布基于情节「${input.title}」创建。`,
    prompt: `将情节「${input.title}」转化为可制作镜头。`,
    modelIntent: pruneUndefinedRecord({
      scene_moment_id: input.id,
      timeline_namespace_node_id: input.targetTimelineNamespaceNodeId?.trim(),
      timeline_namespace_id: input.targetTimelineNamespaceId?.trim(),
      timeline_namespace_kind: input.targetTimelineNamespaceKind?.trim(),
      timeline_namespace_path: timelineNamespacePath,
      setting_id: mount?.settingId,
      state_id: mount?.stateId,
    }),
  })
  const contentUnitId = idValue(contentUnit.record.id) ?? `cu_scene_${safeToken(input.id)}`

  return {
    changedNodeIds: [...changedNodeIds, `content_unit:${contentUnitId}`],
    affectedNodeIds: [...changedNodeIds, `content_unit:${contentUnitId}`],
    focusNodeId: `scene_moment:${input.id}`,
    nodePositions: options?.position ? { [`scene_moment:${input.id}`]: options.position } : undefined,
    message: '已在时间线命名空间下创建情节节点并绑定创作片段',
  }
}

function timelineNamespaceSceneMomentPath(timelineNamespacePath: string, sceneMomentId: string): string {
  const parentDir = timelineNamespacePath.replace(/\/[^/]*\.json$/, '')
  return `${parentDir}/scene_moments/${safeToken(sceneMomentId)}/scene_moment.json`
}

function timelineNamespaceSceneMomentRecord(
  projectId: number,
  input: NonNullable<ContentCanvasCreateNodeOptions['input']>,
  mount: { settingId: string; stateId: string } | null,
): Record<string, unknown> {
  return pruneUndefinedRecord({
    schema: 'movscript.scene_moment.v1',
    kind: 'scene_moment',
    id: input.id,
    title: input.title,
    project_id: projectId,
    order: Date.now(),
    description: '',
    time_text: '',
    location_text: '',
    action_text: '',
    mood: '',
    setting_refs: mount
      ? [{
          setting_id: mount.settingId,
          setting_state_id: mount.stateId,
          role: 'scene_constraint',
        }]
      : undefined,
  })
}

export async function createAssetCanvasNode(
  projectId: number,
  options?: ContentCanvasCreateNodeOptions,
  gateway?: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(options?.input, 'canvas_asset', '新资产')
  const outputKind = contentCanvasAssetOutputKind(input.outputKind)
  const mount = await ensureCanvasSettingStateForInput(projectId, input, {
    settingId: `asset_setting_${safeToken(input.id)}`,
    settingTitle: `${input.title} 设定`,
    stateId: `asset_state_${safeToken(input.id)}`,
    stateTitle: `${input.title} 状态`,
    required: true,
  }, gateway)
  if (!mount) throw new Error('创建资产节点需要设定与状态归属')

  const result = await gateway.createAsset({
    id: input.id,
    title: input.title,
    settingId: mount.settingId,
    settingStateId: mount.stateId,
    slot: input.id,
    assetKind: outputKind,
    promptHint: `从创作画布创建。`,
  })
  const assetId = String(result.record.id ?? input.id)
  const contentUnit = await ensureContentUnitForRef(gateway, {
    id: `cu_asset_${safeToken(assetId)}`,
    refKind: 'asset',
    ref: assetId,
    contentUnitType: 'asset_ref',
    outputKind,
    title: `${input.title} 创作片段`,
    description: `从创作画布基于素材「${input.title}」创建。`,
    prompt: `为素材「${input.title}」生成可复用${contentCanvasOutputKindLabel(outputKind)}。`,
    modelIntent: {
      asset_id: assetId,
      state_id: mount.stateId,
      setting_id: mount.settingId,
    },
  })
  const contentUnitId = idValue(contentUnit.record.id) ?? `cu_asset_${safeToken(assetId)}`
  return {
    changedNodeIds: [...mount.changedNodeIds, `asset:${assetId}`, `content_unit:${contentUnitId}`],
    affectedNodeIds: [...mount.changedNodeIds, `asset:${assetId}`, `content_unit:${contentUnitId}`],
    focusNodeId: `asset:${assetId}`,
    nodePositions: options?.position ? { [`asset:${assetId}`]: options.position } : undefined,
    message: `已创建${contentCanvasOutputKindLabel(outputKind)}资产节点并绑定创作片段`,
  }
}

async function ensureCanvasSettingStateForInput(
  projectId: number,
  input: NonNullable<ContentCanvasCreateNodeOptions['input']>,
  fallback: {
    settingId: string
    settingTitle: string
    stateId: string
    stateTitle: string
    required: boolean
  },
  gateway: ContentCanvasWorkspaceGateway,
): Promise<{ settingId: string; stateId: string; changedNodeIds: string[] } | null> {
  const wantsMount = fallback.required
    || Boolean(input.createTargetSetting)
    || Boolean(input.createTargetState)
    || Boolean(input.targetSettingId?.trim())
    || Boolean(input.targetStateId?.trim())
    || Boolean(input.targetSettingTitle?.trim())
    || Boolean(input.targetStateTitle?.trim())
  if (!wantsMount) return null

  const settingId = input.targetSettingId?.trim() || fallback.settingId
  const stateId = input.targetStateId?.trim() || fallback.stateId
  const changedNodeIds: string[] = []

  if (input.createTargetSetting || !input.targetSettingId?.trim()) {
    await gateway.createSetting({
      id: settingId,
      title: input.targetSettingTitle?.trim() || fallback.settingTitle,
      kind: input.targetSettingKind ?? input.settingKind ?? input.targetSettingNamespaceKind ?? input.settingNamespaceKind ?? 'other',
      settingNamespaceKind: input.targetSettingNamespaceKind ?? input.settingNamespaceKind,
      description: '从创作画布创建，用于承载画面节点。',
    })
    changedNodeIds.push(`setting:${settingId}`)
  }

  if (input.createTargetState || !input.targetStateId?.trim()) {
    await gateway.createSettingState({
      id: stateId,
      settingId,
      title: input.targetStateTitle?.trim() || fallback.stateTitle,
      stateKind: input.targetStateNamespaceKind ?? 'base',
      settingNamespaceKind: input.targetStateNamespaceKind,
      description: `从设定「${input.targetSettingTitle?.trim() || fallback.settingTitle}」创建。`,
    })
    changedNodeIds.push(`state:${stateId}`)
  }

  return { settingId, stateId, changedNodeIds }
}

function contentCanvasAssetOutputKind(value: unknown): Exclude<ContentCanvasGenerationOutputKind, 'text'> {
  if (value === 'video' || value === 'audio' || value === 'image') return value
  return 'image'
}

function pruneUndefinedRecord<T extends Record<string, unknown>>(record: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) output[key] = value
  }
  return output as T
}

function contentCanvasOutputKindLabel(kind: ContentCanvasGenerationOutputKind): string {
  if (kind === 'video') return '视频'
  if (kind === 'audio') return '音频'
  if (kind === 'text') return '文本'
  return '图片'
}

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
    settingNamespaceKind: input.settingNamespaceKind ?? input.status,
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
    : optionalSceneMomentId(ownerNode)
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
