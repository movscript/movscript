import type {
  ContentCanvasCandidate,
  ContentCanvasNode,
} from './contentCanvasTypes'

export function createCandidateNodes(ownerNode: ContentCanvasNode): ContentCanvasNode[] {
  return ownerNode.candidates.map((candidate) => ({
    id: candidateNodeIdFor(ownerNode, candidate),
    entityKey: candidate.id,
    kind: 'candidate',
    title: candidate.title,
    subtitle: candidate.selected ? '已选择候选' : '候选',
    summary: candidate.notes || candidate.artifactRef || candidate.source || '暂无候选说明',
    status: candidate.selected ? 'ready' : 'active',
    metrics: [
      candidate.resourceId ? `资源 ${candidate.resourceId}` : undefined,
      candidate.resourceKind ? `类型 ${candidate.resourceKind}` : undefined,
      candidate.inputHash ? `Input ${candidate.inputHash}` : undefined,
      candidate.source ? `模型 ${candidate.source}` : undefined,
      candidate.selected ? '已选' : undefined,
    ].filter((item): item is string => Boolean(item)),
    sourcePath: '',
    record: {
      ...candidate,
      ownerKind: ownerNode.kind,
      ownerContentUnitId: ownerNode.entityKey,
      ownerContentUnitNodeId: ownerNode.id,
    },
    candidates: [],
    position: { x: 0, y: 0 },
  }))
}

export function createSelectionNodes(ownerNode: ContentCanvasNode): ContentCanvasNode[] {
  return ownerNode.candidates
    .filter((candidate) => candidate.selected)
    .map((candidate) => ({
      id: selectionNodeIdFor(ownerNode, candidate),
      entityKey: `${ownerNode.entityKey}:${candidate.id}`,
      kind: 'selection',
      title: '当前选择',
      subtitle: ownerNode.title,
      summary: `${candidate.title} 是当前采纳候选。`,
      status: 'ready',
      metrics: [
        candidate.resourceId ? `资源 ${candidate.resourceId}` : undefined,
        candidate.resourceKind ? `类型 ${candidate.resourceKind}` : undefined,
        candidate.inputHash ? `Input ${candidate.inputHash}` : undefined,
        candidate.artifactRef ? 'Artifact' : undefined,
      ].filter((item): item is string => Boolean(item)),
      sourcePath: '',
      record: {
        candidateId: candidate.id,
        candidateTitle: candidate.title,
        ownerKind: ownerNode.kind,
        ownerContentUnitId: ownerNode.entityKey,
        ownerContentUnitNodeId: ownerNode.id,
      },
      candidates: [],
      position: { x: 0, y: 0 },
    }))
}

export function createResourceNodes(candidateNode: ContentCanvasNode): ContentCanvasNode[] {
  const resourceKey = resourceKeyForCandidateRecord(candidateNode.record)
  if (!resourceKey) return []
  const title = typeof candidateNode.record.resourceId === 'number'
    ? `Resource ${candidateNode.record.resourceId}`
    : resourceKey
  return [{
    id: `resource:${resourceKey}`,
    entityKey: resourceKey,
    kind: 'resource',
    title,
    subtitle: '候选输出资源',
    summary: String(candidateNode.record.artifactRef ?? candidateNode.record.notes ?? '候选产出的可复用资源'),
    status: 'ready',
    metrics: [
      typeof candidateNode.record.source === 'string' ? `来源 ${candidateNode.record.source}` : undefined,
      typeof candidateNode.record.resourceId === 'number' ? `Resource ${candidateNode.record.resourceId}` : undefined,
      typeof candidateNode.record.inputHash === 'string' ? `Input ${candidateNode.record.inputHash}` : undefined,
      typeof candidateNode.record.artifactRef === 'string' ? 'Artifact Ref' : undefined,
    ].filter((item): item is string => Boolean(item)),
    sourcePath: '',
    record: {
      resourceId: candidateNode.record.resourceId,
      resourceKind: candidateNode.record.resourceKind,
      artifactRef: candidateNode.record.artifactRef,
      inputHash: candidateNode.record.inputHash,
      candidateNodeId: candidateNode.id,
      ownerContentUnitNodeId: candidateNode.record.ownerContentUnitNodeId,
    },
    candidates: [],
    position: { x: 0, y: 0 },
  }]
}

export function createRawResourceReferenceNodes(resourceRefs: string[]): ContentCanvasNode[] {
  return [...new Set(resourceRefs)]
    .filter((resourceRef) => resourceRef.trim())
    .map((resourceRef) => ({
      id: `resource:${resourceRef}`,
      entityKey: resourceRef,
      kind: 'resource' as const,
      title: `Resource ${resourceRef}`,
      subtitle: '引用资源',
      summary: '提示词直接引用的资源',
      status: 'ready' as const,
      metrics: [`Resource ${resourceRef}`],
      sourcePath: '',
      record: {
        resourceId: numericResourceId(resourceRef),
        resourceRef,
        source: 'prompt_reference',
      },
      candidates: [],
      position: { x: 0, y: 0 },
    }))
}

export function candidateNodeIdFor(ownerNode: ContentCanvasNode, candidate: ContentCanvasCandidate) {
  return `candidate:${ownerNode.entityKey}:${candidate.id}`
}

export function selectionNodeIdFor(ownerNode: ContentCanvasNode, candidate: ContentCanvasCandidate) {
  return `selection:${ownerNode.entityKey}:${candidate.id}`
}

export function resourceNodeIdFor(candidate: ContentCanvasCandidate): string | undefined {
  const key = resourceKeyForCandidate(candidate)
  return key ? `resource:${key}` : undefined
}

function resourceKeyForCandidate(candidate: ContentCanvasCandidate): string | undefined {
  if (candidate.resourceId !== undefined) return String(candidate.resourceId)
  return candidate.artifactRef
}

function resourceKeyForCandidateRecord(record: Record<string, unknown>): string | undefined {
  if (typeof record.resourceId === 'number') return String(record.resourceId)
  if (typeof record.artifactRef === 'string' && record.artifactRef.trim()) return record.artifactRef.trim()
  return undefined
}

function numericResourceId(resourceRef: string): number | undefined {
  return /^\d+$/.test(resourceRef) ? Number(resourceRef) : undefined
}
