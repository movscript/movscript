import { buildContentSourceWorkspaceCandidateCreatePlan, type ContentCandidateRecord } from '@movscript/core/content'

import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import type { ContentCanvasCommandResult } from './contentCanvasCommands'
import type { ContentCanvasWorkspaceGateway } from './contentCanvasWorkspaceGateway'

export async function createCandidateFromContentUnit(
  projectId: number,
  contentUnitNode: ContentCanvasNode,
  position: { x: number; y: number } | undefined,
  gateway: ContentCanvasWorkspaceGateway,
): Promise<ContentCanvasCommandResult> {
  assertContentUnitNode(contentUnitNode)
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
  const record = await gateway.createContentUnitCandidate({
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
      [candidateNodeId]: position ?? suggestedCandidateNodePosition(contentUnitNode, contentUnitNode.candidates.length + 1),
    },
    createdCandidates: [{ contentUnitId: contentUnitNode.entityKey, candidate }],
    message: '已创建后端制作项候选',
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
    focusNodeId: `candidate:${contentUnitNode.entityKey}:${candidate.id}`,
    createdCandidates: [{ contentUnitId: contentUnitNode.entityKey, candidate: { ...candidate, selected: true } }],
    selectedCandidates: [{ contentUnitId: contentUnitNode.entityKey, candidateId: candidate.id }],
    message: `已选择制作项候选 ${candidate.title}`,
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
    throw new Error('候选节点缺少制作项归属，无法选择')
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
    focusNodeId: candidateNode.id,
    createdCandidates: [{ contentUnitId: ownerContentUnitId, candidate: contentCanvasCandidateFromCandidateNode(candidateNode, true) }],
    selectedCandidates: [{ contentUnitId: ownerContentUnitId, candidateId: candidateNode.entityKey }],
    message: `已选择候选 ${candidateNode.title}`,
  }
}

function assertContentUnitNode(node: ContentCanvasNode): void {
  assertNodeKind(node, 'content_unit', '制作项')
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

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
