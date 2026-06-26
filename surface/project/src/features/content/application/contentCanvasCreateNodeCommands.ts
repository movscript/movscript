import type { ContentCanvasNode } from '../domain/contentCanvasTypes'
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
  assertNodeKind,
  createInputOrDefault,
  createdNodeResult,
  requiredProductionId,
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
  outputKind?: ContentCanvasGenerationOutputKind
  settingKind?: ContentCanvasSettingKind
  targetProductionId?: string
  targetProductionTitle?: string
  targetSegmentId?: string
  targetSegmentTitle?: string
  createTargetProduction?: boolean
  createTargetSegment?: boolean
  targetSettingId?: string
  targetSettingTitle?: string
  targetSettingKind?: ContentCanvasSettingKind
  targetStateId?: string
  targetStateTitle?: string
  createTargetSetting?: boolean
  createTargetState?: boolean
  targetOwnerNodeId?: string
}

export type ContentCanvasSettingKind =
  | 'character'
  | 'location'
  | 'prop'
  | 'world_rule'
  | 'style'
  | 'other'

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
    kind: input.settingKind ?? 'other',
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
