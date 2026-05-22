import type { SemanticEntityRecord } from '@/api/semanticEntities'
import type {
  AssetSlotRecord,
  ContentUnitRecord,
  CreativeReferenceRecord,
  KeyframeRecord,
  SceneMomentRecord,
  SegmentRecord,
  WritingExpressionRecord,
} from '@/lib/productionOrchestrationData'
import {
  productionProposalDraftNodeKey,
} from '@/lib/productionProposalDraftEdit'
import type {
  ProposalAssetSlotNode,
  ProposalCreativeRefNode,
  ProposalDraftContent,
} from '@/lib/productionProposalReviewModel'

export interface ProductionProposalDraftWorkspaceData {
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  writingExpressions: WritingExpressionRecord[]
  contentUnits: ContentUnitRecord[]
  creativeReferenceUsages: SemanticEntityRecord[]
  assetSlots: AssetSlotRecord[]
  keyframes: KeyframeRecord[]
  segmentKeyByWorkspaceId: Map<number, string>
  sceneMomentKeyByWorkspaceId: Map<number, { segmentKey: string; momentKey: string }>
  contentUnitKeyByWorkspaceId: Map<number, { segmentKey: string; momentKey: string; unitKey: string }>
  writingExpressionKeyByWorkspaceId: Map<number, { segmentKey: string; momentKey: string; expressionKey: string }>
  referenceUsageByWorkspaceId: Map<number, { segmentKey: string; momentKey: string; referenceKey: string }>
}

export function buildProductionProposalDraftWorkspaceData(
  draft: ProposalDraftContent,
  input: {
    productionId: number
    creativeReferences: CreativeReferenceRecord[]
  },
): ProductionProposalDraftWorkspaceData {
  const segments: SegmentRecord[] = []
  const sceneMoments: SceneMomentRecord[] = []
  const writingExpressions: WritingExpressionRecord[] = []
  const contentUnits: ContentUnitRecord[] = []
  const creativeReferenceUsages: SemanticEntityRecord[] = []
  const assetSlots: AssetSlotRecord[] = []
  const keyframes: KeyframeRecord[] = []
  const segmentKeyByWorkspaceId = new Map<number, string>()
  const sceneMomentKeyByWorkspaceId = new Map<number, { segmentKey: string; momentKey: string }>()
  const contentUnitKeyByWorkspaceId = new Map<number, { segmentKey: string; momentKey: string; unitKey: string }>()
  const writingExpressionKeyByWorkspaceId = new Map<number, { segmentKey: string; momentKey: string; expressionKey: string }>()
  const referenceUsageByWorkspaceId = new Map<number, { segmentKey: string; momentKey: string; referenceKey: string }>()
  const referenceById = new Map(input.creativeReferences.map((reference) => [reference.ID, reference]))

  draft.proposal.segments.forEach((segment, segmentIndex) => {
    const segmentKey = productionProposalDraftNodeKey(segment, `segment:${segmentIndex}`)
    const segmentId = workspaceIdForProposalNode(segmentKey, segment.id)
    segmentKeyByWorkspaceId.set(segmentId, segmentKey)
    segments.push({
      ID: segmentId,
      production_id: input.productionId,
      title: segment.title,
      kind: segment.kind,
      summary: segment.summary ?? segment.rationale,
      order: segment.order ?? segmentIndex + 1,
      status: segment.status ?? (segment.id ? 'draft' : 'candidate'),
      script_block_id: segment.script_block_id ?? undefined,
    })

    ;(segment.scene_moments ?? []).forEach((moment, momentIndex) => {
      const momentKey = productionProposalDraftNodeKey(moment, `moment:${momentIndex}`)
      const momentId = workspaceIdForProposalNode(`${segmentKey}/${momentKey}`, moment.id)
      sceneMomentKeyByWorkspaceId.set(momentId, { segmentKey, momentKey })
      sceneMoments.push({
        ID: momentId,
        production_id: input.productionId,
        segment_id: segmentId,
        title: moment.title,
        scene_code: moment.scene_code,
        time_text: moment.time_text,
        location_text: moment.location_text,
        action_text: moment.action_text,
        mood: moment.mood,
        description: moment.description ?? moment.rationale,
        order: moment.order ?? momentIndex + 1,
        status: moment.status ?? (moment.id ? 'draft' : 'candidate'),
        script_block_id: moment.script_block_id ?? undefined,
      })

      ;(moment.content_units ?? []).forEach((unit, unitIndex) => {
        const unitKey = productionProposalDraftNodeKey(unit, `unit:${unitIndex}`)
        const unitId = workspaceIdForProposalNode(`${segmentKey}/${momentKey}/${unitKey}`, unit.id)
        contentUnitKeyByWorkspaceId.set(unitId, { segmentKey, momentKey, unitKey })
        contentUnits.push({
          ID: unitId,
          production_id: input.productionId,
          segment_id: segmentId,
          scene_moment_id: momentId,
          title: unit.title,
          kind: unit.kind,
          unit_code: unit.unit_code,
          order: unit.order ?? unitIndex + 1,
          duration_sec: unit.duration_sec,
          description: unit.description,
          shot_size: unit.shot_size,
          camera_angle: unit.camera_angle,
          status: unit.status ?? (unit.id ? 'draft' : 'candidate'),
          script_block_id: unit.script_block_id ?? moment.script_block_id ?? undefined,
        })
      })

      ;(moment.writing_expressions ?? []).forEach((expression, expressionIndex) => {
        const expressionKey = productionProposalDraftNodeKey(expression, `expression:${expressionIndex}`)
        const expressionId = workspaceIdForProposalNode(`${segmentKey}/${momentKey}/${expressionKey}`, expression.id)
        writingExpressionKeyByWorkspaceId.set(expressionId, { segmentKey, momentKey, expressionKey })
        writingExpressions.push({
          ID: expressionId,
          scene_moment_id: momentId,
          script_block_id: expression.script_block_id ?? moment.script_block_id ?? undefined,
          kind: expression.kind as WritingExpressionRecord['kind'],
          speaker: expression.speaker,
          text: expression.text,
          note: expression.note,
          intent: expression.intent,
          order: expression.order ?? expressionIndex + 1,
        })
      })

      ;(moment.creative_references ?? []).forEach((reference, referenceIndex) => {
        const referenceKey = productionProposalDraftNodeKey(reference, `reference:${referenceIndex}`)
        const referenceId = workspaceReferenceId(reference, referenceKey, referenceById)
        const usageId = workspaceIdForProposalNode(`${segmentKey}/${momentKey}/${referenceKey}/usage`)
        referenceUsageByWorkspaceId.set(usageId, { segmentKey, momentKey, referenceKey })
        creativeReferenceUsages.push({
          ID: usageId,
          owner_type: 'scene_moment',
          owner_id: momentId,
          creative_reference_id: referenceId,
          role: reference.role ?? 'supporting',
          status: 'draft',
        })
      })

      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        const slotKey = productionProposalDraftNodeKey(slot, `slot:${slotIndex}`)
        const slotId = workspaceIdForProposalNode(`${segmentKey}/${momentKey}/${slotKey}`, slot.id)
        assetSlots.push({
          ID: slotId,
          production_id: input.productionId,
          name: slot.name,
          kind: slot.kind,
          priority: slot.priority,
          status: slot.id ? 'draft' : 'missing',
          description: slot.description,
          owner_type: 'scene_moment',
          owner_id: momentId,
        })
      })
    })
  })

  return {
    segments,
    sceneMoments,
    writingExpressions,
    contentUnits,
    creativeReferenceUsages,
    assetSlots,
    keyframes,
    segmentKeyByWorkspaceId,
    sceneMomentKeyByWorkspaceId,
    contentUnitKeyByWorkspaceId,
    writingExpressionKeyByWorkspaceId,
    referenceUsageByWorkspaceId,
  }
}

export function workspaceIdForProposalNode(key: string, persistedId?: number) {
  if (typeof persistedId === 'number' && Number.isFinite(persistedId) && persistedId > 0) return persistedId
  return -stableHash(key)
}

function workspaceReferenceId(
  reference: ProposalCreativeRefNode,
  referenceKey: string,
  referenceById: Map<number, CreativeReferenceRecord>,
) {
  if (reference.id && referenceById.has(reference.id)) return reference.id
  return workspaceIdForProposalNode(referenceKey, reference.id)
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) || 1
}

export function proposalCreativeReferenceFromRecord(reference: CreativeReferenceRecord): ProposalCreativeRefNode {
  return {
    id: reference.ID,
    name: String(reference.name ?? reference.title ?? reference.label ?? `设定 #${reference.ID}`),
    kind: typeof reference.kind === 'string' ? reference.kind : undefined,
    source_label: '当前项目',
  }
}

export function proposalAssetSlotFromRecord(slot: AssetSlotRecord): ProposalAssetSlotNode {
  return {
    id: slot.ID,
    name: String(slot.name ?? slot.title ?? slot.label ?? `素材 #${slot.ID}`),
    kind: typeof slot.kind === 'string' ? slot.kind : undefined,
    description: typeof slot.description === 'string' ? slot.description : undefined,
    priority: typeof slot.priority === 'string' ? slot.priority : undefined,
    source_label: '当前项目',
  }
}
