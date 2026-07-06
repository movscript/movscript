import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
import {
  DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE,
  contentCanvasTimelineProfileInitialNamespaceKinds,
  contentCanvasTimelineProfileNamespaces,
  contentCanvasTimelineProfileProductionType,
  contentCanvasTimelineProfileRootKind,
  contentCanvasTimelineRootDefaultPreviewKind,
} from '../domain/contentCanvasTimelineProfiles'
import { createCandidateFromContentUnit } from './contentCanvasCandidateCommands'
import type { ContentCanvasCommandResult } from './contentCanvasCommands'
import type { ContentCanvasWorkspaceGateway } from './contentCanvasWorkspaceGateway'
import {
  createAssetFromSettingState,
  createExpressionUnitFromSceneMoment,
  createKeyframeFromVisualOwner,
  createStateFromSetting,
  createStoryboardFromVisualOwner,
} from './contentCanvasContentUnitCreateNodeCommands'
import {
  assertLegacyTimelineMount,
  assertNodeKind,
  createInputOrDefault,
  createdNodeResult,
  pathSegmentAfter,
  requiredProductionId,
  safeToken,
  type ContentCanvasCreateNodeOptions,
} from './contentCanvasCreateNodeCommandHelpers'
export type { ContentCanvasExpressionUnitKind } from './contentCanvasExpressionUnitKinds'
export { CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS } from './contentCanvasExpressionUnitKinds'

export type ContentCanvasCreateAction =
  | 'setting'
  | 'state'
  | 'production'
  | 'segment'
  | 'scene_moment'
  | 'asset'
  | 'expression_unit'
  | 'keyframe'
  | 'storyboard'
  | 'candidate'

export type ContentCanvasCreateNodeInput = {
  id: string
  title: string
  status?: string
  slotKind?: string
  outputKind?: ContentCanvasGenerationOutputKind
  settingKind?: ContentCanvasSettingKind
  settingNamespaceKind?: string
  targetProductionId?: string
  targetProductionTitle?: string
  targetSegmentId?: string
  targetSegmentTitle?: string
  createTargetProduction?: boolean
  createTargetSegment?: boolean
  legacyTimelineMount?: boolean
  timelineProfile?: string
  productionType?: string
  timelineNamespaces?: string[]
  timelineNamespaceKind?: string
  targetTimelineNamespaceNodeId?: string
  targetTimelineNamespaceId?: string
  targetTimelineNamespaceTitle?: string
  targetTimelineNamespaceKind?: string
  targetTimelineNamespacePath?: string
  targetSettingId?: string
  targetSettingTitle?: string
  targetSettingKind?: ContentCanvasSettingKind
  targetSettingNamespaceKind?: string
  targetStateId?: string
  targetStateTitle?: string
  targetStateNamespaceKind?: string
  createTargetSetting?: boolean
  createTargetState?: boolean
  targetOwnerNodeId?: string
}

export type ContentCanvasSettingKind = string

export type ContentCanvasGenerationOutputKind = 'video' | 'image' | 'audio' | 'text'

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
  if (action === 'asset') return createAssetFromSettingState(projectId, parentNode, options, gateway)
  if (action === 'expression_unit') return createExpressionUnitFromSceneMoment(projectId, parentNode, options, gateway)
  if (action === 'keyframe') return createKeyframeFromVisualOwner(projectId, parentNode, options, gateway)
  if (action === 'storyboard') return createStoryboardFromVisualOwner(projectId, parentNode, options, gateway)
  return createCandidateFromContentUnit(projectId, parentNode, options?.position, gateway)
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
  const input = createInputOrDefault(options?.input, 'canvas_setting', '新设定')
  const result = await gateway.createSetting({
    id: input.id,
    title: input.title,
    kind: input.settingKind ?? input.settingNamespaceKind ?? 'other',
    settingNamespaceKind: input.settingNamespaceKind,
    description: '从创作画布创建。',
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
  if (input.legacyTimelineMount) {
    await gateway.createProduction({ projectId, id: input.id, title: input.title })
    return createdNodeResult(`production:${input.id}`, '已创建制作', options?.position)
  }
  const timelineProfile = input.timelineProfile?.trim() || input.productionType?.trim() || DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE
  const namespaceKind = input.timelineNamespaceKind?.trim() || contentCanvasTimelineProfileRootKind(timelineProfile)
  return createRootTimelineNamespace(
    projectId,
    { ...input, timelineProfile, timelineNamespaceKind: namespaceKind },
    namespaceKind,
    options?.position,
    gateway,
  )
}

async function createRootTimelineNamespace(
  projectId: number,
  input: ContentCanvasCreateNodeInput,
  namespaceKind: string,
  position: { x: number; y: number } | undefined,
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  const timelineProfile = input.timelineProfile?.trim()
  const nodes = rootTimelineNamespaceInitialNodes(projectId, input, namespaceKind)
  const rootNode = nodes[0]
  if (!rootNode) throw new Error('制作类型模板为空')
  const defaultPreviewNode = nodes.find((node) => node.namespaceKind === contentCanvasTimelineRootDefaultPreviewKind(namespaceKind, timelineProfile))
    ?? rootNode
  for (const node of nodes) {
    await gateway.writeHierarchyNode({
      targetPath: node.targetPath,
      record: node.record,
    })
  }
  return {
    changedNodeIds: nodes.map((node) => node.nodeId),
    affectedNodeIds: nodes.map((node) => node.nodeId),
    focusNodeId: defaultPreviewNode.nodeId,
    nodePositions: position ? Object.fromEntries(nodes.map((node, index) => [
      node.nodeId,
      {
        x: position.x + index * 320,
        y: position.y + index * 120,
      },
    ])) : undefined,
    message: '已创建制作',
  }
}

interface RootTimelineNamespaceInitialNode {
  entityKind: 'production' | 'segment'
  id: string
  namespaceKind: string
  nodeId: string
  record: Record<string, unknown>
  targetPath: string
  title: string
}

function rootTimelineNamespaceInitialNodes(
  projectId: number,
  input: ContentCanvasCreateNodeInput,
  rootNamespaceKind: string,
): RootTimelineNamespaceInitialNode[] {
  const timelineProfile = input.timelineProfile?.trim()
  const productionType = input.productionType?.trim() || contentCanvasTimelineProfileProductionType(timelineProfile)
  const recommendedTimelineNamespaces = input.timelineNamespaces?.length
    ? input.timelineNamespaces
    : contentCanvasTimelineProfileNamespaces(timelineProfile || productionType)
  const profileKinds = timelineProfile ? contentCanvasTimelineProfileInitialNamespaceKinds(timelineProfile) : [rootNamespaceKind]
  const namespaceKinds = profileKinds.length ? profileKinds : [rootNamespaceKind]
  const orderBase = Date.now()
  const nodeInputs = namespaceKinds.map((namespaceKind, index) => ({
    entityKind: index === 0 ? 'production' as const : 'segment' as const,
    id: index === 0 ? input.id : defaultChildTimelineNamespaceId(input.id, namespaceKind),
    namespaceKind,
    title: index === 0 ? input.title : defaultChildTimelineNamespaceTitle(input.title, namespaceKind),
  }))
  return nodeInputs.map((node, index) => {
    const targetPath = index === 0
      ? `timeline/${safeToken(input.id)}/production.json`
      : timelineNamespaceInitialChildPath(nodeInputs.slice(0, index + 1))
    return {
      ...node,
      nodeId: `${node.entityKind}:${node.id}`,
      targetPath,
      record: pruneUndefinedRecord({
        schema: `movscript.${node.entityKind}.v1`,
        kind: node.entityKind,
        id: node.id,
        title: node.title,
        project_id: projectId,
        namespace_kind: node.namespaceKind,
        production_type: index === 0 ? productionType : undefined,
        timeline_profile: index === 0 ? productionType : undefined,
        timeline_namespaces: index === 0 && recommendedTimelineNamespaces.length ? recommendedTimelineNamespaces : undefined,
        order: orderBase + index,
        intent: index === 0 ? input.status?.trim() || undefined : undefined,
      }),
    }
  })
}

function timelineNamespaceInitialChildPath(nodes: Array<{ id: string; entityKind: 'production' | 'segment' }>): string {
  const [root, ...children] = nodes
  if (!root) return 'timeline/item/production.json'
  let currentDir = `timeline/${safeToken(root.id)}`
  for (const child of children) {
    currentDir = `${currentDir}/segments/${safeToken(child.id)}`
  }
  return `${currentDir}/segment.json`
}

function defaultChildTimelineNamespaceId(rootId: string, namespaceKind: string): string {
  const safeRootId = safeToken(rootId)
  if (namespaceKind === 'season') return `${safeRootId}_s01`
  if (namespaceKind === 'episode') return `${safeRootId}_e01`
  if (namespaceKind === 'module') return `${safeRootId}_m01`
  if (namespaceKind === 'lesson') return `${safeRootId}_l01`
  return `${safeRootId}_${safeToken(namespaceKind)}_01`
}

function defaultChildTimelineNamespaceTitle(rootTitle: string, namespaceKind: string): string {
  if (namespaceKind === 'season') return `${rootTitle} 第一季`
  if (namespaceKind === 'episode') return `${rootTitle} 第 1 集`
  if (namespaceKind === 'module') return `${rootTitle} 模块 1`
  if (namespaceKind === 'lesson') return `${rootTitle} 第 1 课`
  return `${rootTitle} ${namespaceKind}`
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
  if (productionNode.domainCategory === 'timeline_namespace') {
    return createTimelineNamespaceHierarchyNode(projectId, productionNode, input, 'segment', '已创建时间线层级', options?.position, gateway)
  }
  assertLegacyTimelineMount(input, '创建段落节点')
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
  if (!gateway) throw new Error('Content canvas workspace gateway is required')
  const input = createInputOrDefault(options?.input, 'canvas_scene', '新情节')
  if (segmentNode.domainCategory === 'timeline_namespace') {
    return createTimelineNamespaceHierarchyNode(projectId, segmentNode, input, 'scene_moment', '已创建情节', options?.position, gateway)
  }
  const productionId = requiredProductionId(segmentNode)
  assertLegacyTimelineMount(input, '通过段落创建情节节点')
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

async function createTimelineNamespaceHierarchyNode(
  projectId: number,
  parentNode: ContentCanvasNode,
  input: ContentCanvasCreateNodeInput,
  entityKind: 'segment' | 'scene_moment',
  message: string,
  position: { x: number; y: number } | undefined,
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  const targetPath = timelineNamespaceChildPath(parentNode, input.id, entityKind)
  await gateway.writeHierarchyNode({
    targetPath,
    record: timelineNamespaceChildRecord(projectId, input, entityKind),
  })
  return createdNodeResult(timelineNamespaceNodeIdForPath(entityKind, input.id, targetPath, parentNode), message, position, parentNode.id)
}

function timelineNamespaceChildPath(
  parentNode: ContentCanvasNode,
  childId: string,
  entityKind: 'segment' | 'scene_moment',
): string {
  const parentPath = parentNode.sourcePath?.trim()
  if (!parentPath) throw new Error('当前 namespace 节点缺少 source path，无法创建子节点')
  const parentDir = parentPath.replace(/\/[^/]*\.json$/, '')
  const folder = entityKind === 'segment' ? 'segments' : 'scene_moments'
  const file = entityKind === 'segment' ? 'segment' : 'scene_moment'
  return `${parentDir}/${folder}/${safeToken(childId)}/${file}.json`
}

function timelineNamespaceNodeIdForPath(
  entityKind: 'segment' | 'scene_moment',
  entityId: string,
  targetPath: string,
  parentNode: ContentCanvasNode,
): string {
  if (entityKind === 'segment') {
    const parentKey = pathSegmentAfter(targetPath, 'productions')
      ?? (parentNode.kind === 'production' ? parentNode.entityKey : undefined)
    return `segment:${parentKey ? `${parentKey}/${entityId}` : entityId}`
  }
  return `${entityKind}:${entityId}`
}

function timelineNamespaceChildRecord(
  projectId: number,
  input: ContentCanvasCreateNodeInput,
  entityKind: 'segment' | 'scene_moment',
): Record<string, unknown> {
  const base = pruneUndefinedRecord({
    schema: `movscript.${entityKind}.v1`,
    kind: entityKind,
    id: input.id,
    title: input.title,
    project_id: projectId,
    order: Date.now(),
  })
  if (entityKind === 'segment') {
    return pruneUndefinedRecord({
      ...base,
      namespace_kind: input.timelineNamespaceKind?.trim() || undefined,
      production_type: input.productionType?.trim() || input.timelineProfile?.trim() || undefined,
      timeline_profile: input.productionType?.trim() || input.timelineProfile?.trim() || undefined,
      timeline_namespaces: input.timelineNamespaces?.length ? input.timelineNamespaces : undefined,
      summary: '',
    })
  }
  return {
    ...base,
    description: '',
    time_text: '',
    location_text: '',
    action_text: '',
    mood: '',
  }
}

function pruneUndefinedRecord<T extends Record<string, unknown>>(record: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) output[key] = value
  }
  return output as T
}
