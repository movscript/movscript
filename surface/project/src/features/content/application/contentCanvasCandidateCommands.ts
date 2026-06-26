import { buildContentSourceWorkspaceCandidateCreatePlan, type ContentCandidateRecord } from '@movscript/core/content'

import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import type { ContentCanvasCommandResult } from './contentCanvasCommands'
import type { ContentCanvasContentCandidateGenerateInput, ContentCanvasUploadedResource, ContentCanvasWorkspaceGateway } from './contentCanvasWorkspaceGateway'

export async function createCandidateFromContentUnit(
  projectId: number,
  contentUnitNode: ContentCanvasNode,
  position: { x: number; y: number } | undefined,
  gateway: ContentCanvasWorkspaceGateway,
  options: Pick<ContentCanvasContentCandidateGenerateInput, 'modelId' | 'params' | 'supportedParams'> = {},
): Promise<ContentCanvasCommandResult> {
  assertContentUnitNode(contentUnitNode)
  const outputKind = contentUnitOutputKind(contentUnitNode)
  if (outputKind !== 'image' && outputKind !== 'video') {
    throw new Error(`当前真实生成候选只支持图像/视频创作片段，${outputKind} 暂未接入生成接口`)
  }
  const candidateOrdinal = contentUnitNode.candidates.length + 1
  const candidateId = timestampId('canvas_candidate')
  console.log('[content-canvas] create content unit candidate request', {
    projectId,
    contentUnitId: contentUnitNode.entityKey,
    candidateId,
    outputKind,
  })
  const record = await gateway.generateContentUnitCandidate({
    projectId,
    contentUnitId: contentUnitNode.entityKey,
    candidateId,
    outputKind,
    ...(options.modelId ? { modelId: options.modelId } : {}),
    ...(options.params ? { params: options.params } : {}),
    ...(options.supportedParams ? { supportedParams: options.supportedParams } : {}),
    promptText: editPromptTextFromNode(contentUnitNode),
  })
  console.log('[content-canvas] create content unit candidate result', {
    projectId,
    contentUnitId: contentUnitNode.entityKey,
    candidateId: record.id ?? candidateId,
    source: record.source,
    status: record.status,
    outputs: record.outputs,
  })
  const resolvedCandidateId = String(record.id ?? candidateId)
  const candidateNodeId = `candidate:${contentUnitNode.entityKey}:${resolvedCandidateId}`
  const candidate = contentCanvasCandidateFromContentRecord(record, candidateId, candidateOrdinal)
  return {
    changedNodeIds: [contentUnitNode.id, candidateNodeId],
    affectedNodeIds: [contentUnitNode.id, candidateNodeId],
    nodePositions: {
      [candidateNodeId]: position ?? suggestedCandidateNodePosition(contentUnitNode, candidateOrdinal),
    },
    createdCandidates: [{ contentUnitId: contentUnitNode.entityKey, candidate }],
    message: '已创建后端创作片段候选',
  }
}

export async function uploadCandidateForContentUnit(
  projectId: number,
  contentUnitNode: ContentCanvasNode,
  file: File,
  position: { x: number; y: number } | undefined,
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertContentUnitNode(contentUnitNode)
  const resource = await gateway.uploadResource({ projectId, file })
  return createCandidateFromResourceForContentUnit(projectId, contentUnitNode, resource, position, gateway)
}

export async function createCandidateFromResourceForContentUnit(
  projectId: number,
  contentUnitNode: ContentCanvasNode,
  resource: ContentCanvasUploadedResource,
  position: { x: number; y: number } | undefined,
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertContentUnitNode(contentUnitNode)
  const candidateOrdinal = contentUnitNode.candidates.length + 1
  const plan = buildContentSourceWorkspaceCandidateCreatePlan({
    contentUnitId: contentUnitNode.entityKey,
    outputKind: contentUnitOutputKind(contentUnitNode),
    promptText: editPromptTextFromNode(contentUnitNode),
    candidateId: timestampId('resource_candidate'),
    resourceId: resource.id,
    resourceName: resource.name,
    resourceType: resource.type,
    resourceMimeType: resource.mimeType,
  })
  const record = await gateway.createContentUnitCandidate({
    projectId,
    ...plan,
  })
  const candidateId = String(record.id ?? plan.candidateId)
  const candidateNodeId = `candidate:${contentUnitNode.entityKey}:${candidateId}`
  const candidate = contentCanvasCandidateFromContentRecord(record, plan.candidateId, candidateOrdinal)
  return {
    changedNodeIds: [contentUnitNode.id, candidateNodeId],
    affectedNodeIds: [contentUnitNode.id, candidateNodeId],
    nodePositions: {
      [candidateNodeId]: position ?? suggestedCandidateNodePosition(contentUnitNode, candidateOrdinal),
    },
    createdCandidates: [{ contentUnitId: contentUnitNode.entityKey, candidate }],
    message: `已创建资源候选 ${resource.name}`,
  }
}

export async function selectContentUnitCandidateFromCanvas(
  projectId: number,
  contentUnitNode: ContentCanvasNode,
  candidate: ContentCanvasCandidate,
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertContentUnitNode(contentUnitNode)
  await gateway.selectContentUnitCandidate({
    projectId,
    contentUnitId: contentUnitNode.entityKey,
    candidateId: candidate.id,
    ...(candidate.resourceId ? { resourceId: candidate.resourceId } : {}),
    reason: 'content_source_workspace_selection',
  })
  return {
    changedNodeIds: [contentUnitNode.id, `candidate:${contentUnitNode.entityKey}:${candidate.id}`],
    affectedNodeIds: [contentUnitNode.id],
    selectedCandidates: [{ contentUnitId: contentUnitNode.entityKey, candidateId: candidate.id }],
    message: `已选择创作片段候选 ${candidate.title}`,
  }
}

export async function selectCandidateNodeFromCanvas(
  projectId: number,
  candidateNode: ContentCanvasNode,
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertNodeKind(candidateNode, 'candidate', '候选')
  const ownerContentUnitId = typeof candidateNode.record.ownerContentUnitId === 'string' ? candidateNode.record.ownerContentUnitId : ''
  const ownerContentUnitNodeId = typeof candidateNode.record.ownerContentUnitNodeId === 'string' ? candidateNode.record.ownerContentUnitNodeId : ''
  if (!ownerContentUnitId) {
    throw new Error('候选节点缺少创作片段归属，无法选择')
  }
  const resourceId = typeof candidateNode.record.resourceId === 'number' ? candidateNode.record.resourceId : undefined
  await gateway.selectContentUnitCandidate({
    projectId,
    contentUnitId: ownerContentUnitId,
    candidateId: candidateNode.entityKey,
    ...(resourceId ? { resourceId } : {}),
    reason: 'content_source_workspace_selection',
  })
  return {
    changedNodeIds: [ownerContentUnitNodeId || candidateNode.id, candidateNode.id],
    affectedNodeIds: [ownerContentUnitNodeId || candidateNode.id, candidateNode.id],
    focusNodeId: ownerContentUnitNodeId || undefined,
    selectedCandidates: [{ contentUnitId: ownerContentUnitId, candidateId: candidateNode.entityKey }],
    message: `已选择候选 ${candidateNode.title}`,
  }
}

function assertContentUnitNode(node: ContentCanvasNode): void {
  assertNodeKind(node, 'content_unit', '创作片段')
}

function assertNodeKind(node: ContentCanvasNode, kind: ContentCanvasNode['kind'], label: string): void {
  if (node.kind !== kind) {
    throw new Error(`当前操作只支持${label}节点`)
  }
}

function suggestedCandidateNodePosition(
  anchorNode: Pick<ContentCanvasNode, 'position'>,
  slot = 1,
): { x: number; y: number } {
  return {
    x: anchorNode.position.x + 360,
    y: anchorNode.position.y + Math.max(0, slot - 1) * 168,
  }
}

function timestampId(prefix: string): string {
  return `${prefix}_${Date.now()}`
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

function contentCanvasCandidateFromContentRecord(record: ContentCandidateRecord, fallbackId: string, ordinal?: number): ContentCanvasCandidate {
  const output = Array.isArray(record.outputs) ? record.outputs.find(isRecord) : undefined
  const resourceId = numberValue(output?.resource_id ?? output?.resourceId)
  const artifactRef = stringValue(output?.artifact_ref ?? output?.artifactRef)
  const resourceKind = stringValue(output?.kind)
  const inputHash = stringValue(record.prompt_snapshot?.input_hash ?? record.prompt_snapshot?.inputHash)
  const id = String(record.id ?? fallbackId)
  return {
    id,
    title: contentCanvasCandidateTitle(record, id, ordinal),
    ...(resourceId !== undefined ? { resourceId } : {}),
    ...(resourceKind ? { resourceKind } : {}),
    ...(artifactRef ? { artifactRef } : {}),
    ...(inputHash ? { inputHash } : {}),
    source: stringValue(record.source) ?? 'backend',
    ...(stringValue(record.status) ? { status: stringValue(record.status) } : {}),
    ...(isRecord(record.producer) ? { producer: record.producer } : {}),
    ...(Array.isArray(record.outputs) ? { outputs: record.outputs } : {}),
    ...(isRecord(record.prompt_snapshot) ? { promptSnapshot: record.prompt_snapshot } : {}),
    ...(stringValue(record.created_at) ? { createdAt: stringValue(record.created_at) } : {}),
    selected: false,
    notes: stringValue(record.status) ?? inputHash ?? '',
  }
}

function contentCanvasCandidateTitle(record: ContentCandidateRecord, id: string, ordinal?: number): string {
  const explicitTitle = stringValue(record.prompt_snapshot?.title)
    ?? stringValue(record.producer?.title)
    ?? stringValue(record.producer?.name)
  if (explicitTitle && !candidateTitleIsGeneric(explicitTitle)) return explicitTitle
  if (ordinal !== undefined && ordinal > 0) return `候选 ${ordinal}`
  return readableCandidateIdFallback(id)
}

function candidateTitleIsGeneric(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return normalized === 'queued generation'
    || normalized === 'pending generation'
    || normalized === 'content unit image generation'
    || normalized === 'content unit video generation'
    || technicalCandidateIdPattern().test(normalized)
}

function readableCandidateIdFallback(id: string): string {
  return technicalCandidateIdPattern().test(id.trim().toLowerCase()) ? '候选' : `候选 ${id}`
}

function technicalCandidateIdPattern(): RegExp {
  return /^(canvas|resource|content)_candidate_[\w-]+$|^resource_\d+_[\w-]+$|^gen_(image|video)_\d+_\d+$/
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
