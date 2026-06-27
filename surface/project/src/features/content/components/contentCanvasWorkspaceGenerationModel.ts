import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import { contentCanvasNodeCanUseCandidateFlow } from '../domain/contentCanvasDomainPolicy'
import { defaultContentUnitDraftForNode } from '../application/contentCanvasCommands'

export type ContentCanvasGenerationTarget = {
  node: ContentCanvasNode
  contentUnitId: string
  contentUnitNodeId: string
  candidates: ContentCanvasCandidate[]
  label: string
}

export function canUseContentUnitCandidateFlow(node: ContentCanvasNode | undefined): boolean {
  return contentCanvasNodeCanUseCandidateFlow(node)
}

export function contentCanvasGenerationTargetForNode(node: ContentCanvasNode | undefined): ContentCanvasGenerationTarget | null {
  if (!node) return null
  if (!canUseContentUnitCandidateFlow(node)) return null
  const contentUnitNode = node.kind === 'content_unit'
    ? node
    : contentUnitNodeForGenerationTask(node)
  const targetNode = contentUnitNode ?? pendingContentUnitNodeForSource(node)
  if (!targetNode) return null
  return {
    node: targetNode,
    contentUnitId: targetNode.entityKey,
    contentUnitNodeId: targetNode.id,
    candidates: targetNode.candidates,
    label: targetNode.title,
  }
}

export function contentUnitNodeForGenerationTask(node: ContentCanvasNode | undefined): ContentCanvasNode | undefined {
  const task = node?.generationTask
  if (!task) return undefined
  return {
    id: task.nodeId,
    entityKey: task.id,
    kind: 'content_unit',
    title: task.title,
    subtitle: task.outputKind,
    summary: task.prompt,
    status: task.status === 'needs_candidate' || task.status === 'stale' ? 'active' : 'ready',
    metrics: [
      `创作片段 ${task.outputKind}`,
      task.candidates.length ? `候选 ${task.candidates.length}` : undefined,
      task.selectedCandidate ? '已选择候选' : undefined,
    ].filter((item): item is string => Boolean(item)),
    sourcePath: task.sourcePath,
    record: task.record,
    domainCategory: 'content_unit',
    domainKind: 'content_unit',
    candidates: task.candidates,
    position: node?.position ?? { x: 0, y: 0 },
  }
}

function pendingContentUnitNodeForSource(node: ContentCanvasNode): ContentCanvasNode | undefined {
  const draft = defaultContentUnitDraftForNode(node)
  if (!draft) return undefined
  return {
    id: `content_unit:${draft.id}`,
    entityKey: draft.id,
    kind: 'content_unit',
    title: draft.title,
    subtitle: draft.outputKind,
    summary: draft.prompt,
    status: 'active',
    metrics: [`创作片段 ${draft.outputKind}`, '待创建'],
    sourcePath: '',
    record: {
      schema: 'movscript.content_unit.v1',
      kind: 'content_unit',
      id: draft.id,
      title: draft.title,
      content_unit_type: draft.contentUnitType,
      output_kind: draft.outputKind,
      description: draft.description,
      [`${draft.refKind}_ref`]: draft.ref,
      edit_prompt: { text: draft.prompt },
      model_intent: {
        pending_content_unit: true,
        ...(draft.modelIntent ?? {}),
      },
      __contentCanvasDefaultUnit: draft,
    },
    domainCategory: 'content_unit',
    domainKind: 'content_unit',
    candidates: [],
    position: node.position,
  }
}
