import type { SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import type {
  AssetSlotRecord,
  ContentUnitRecord,
  SettingRecord,
  KeyframeRecord,
  SceneMomentRecord,
  SegmentRecord,
  ExpressionUnitRecord,
} from '@/features/production/domain/productionOrchestrationData'
import {
  productionWorkspaceArtifactNodeKey,
} from '@/features/production/domain/productionWorkspaceWorkspaceEdit'
import type {
  WorkspaceAssetSlotNode,
  WorkspaceCreativeRefNode,
  ProductionWorkspaceArtifactContent,
} from '@/features/production/domain/productionWorkspaceReviewModel'

export interface ProductionWorkspaceArtifactData {
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  expressionUnits: ExpressionUnitRecord[]
  contentUnits: ContentUnitRecord[]
  settingUsages: SemanticEntityRecord[]
  assetSlots: AssetSlotRecord[]
  keyframes: KeyframeRecord[]
  segmentKeyByWorkspaceId: Map<number, string>
  sceneMomentKeyByWorkspaceId: Map<number, { segmentKey: string; momentKey: string }>
  contentUnitKeyByWorkspaceId: Map<number, { segmentKey: string; momentKey: string; unitKey: string }>
  expressionUnitKeyByWorkspaceId: Map<number, { segmentKey: string; momentKey: string; expressionKey: string }>
  referenceUsageByWorkspaceId: Map<number, { segmentKey: string; momentKey: string; referenceKey: string }>
}

/** @deprecated Use ProductionWorkspaceArtifactData. */
export type ProductionWorkspaceWorkspaceWorkspaceData = ProductionWorkspaceArtifactData

export function buildProductionWorkspaceArtifactData(
  workspace: ProductionWorkspaceArtifactContent,
  input: {
    productionId: number
    settings: SettingRecord[]
  },
): ProductionWorkspaceArtifactData {
  const segments: SegmentRecord[] = []
  const sceneMoments: SceneMomentRecord[] = []
  const expressionUnits: ExpressionUnitRecord[] = []
  const contentUnits: ContentUnitRecord[] = []
  const settingUsages: SemanticEntityRecord[] = []
  const assetSlots: AssetSlotRecord[] = []
  const keyframes: KeyframeRecord[] = []
  const segmentKeyByWorkspaceId = new Map<number, string>()
  const sceneMomentKeyByWorkspaceId = new Map<number, { segmentKey: string; momentKey: string }>()
  const contentUnitKeyByWorkspaceId = new Map<number, { segmentKey: string; momentKey: string; unitKey: string }>()
  const expressionUnitKeyByWorkspaceId = new Map<number, { segmentKey: string; momentKey: string; expressionKey: string }>()
  const referenceUsageByWorkspaceId = new Map<number, { segmentKey: string; momentKey: string; referenceKey: string }>()
  const referenceById = new Map(input.settings.map((reference) => [reference.ID, reference]))

  workspace.workspace.segments.forEach((segment, segmentIndex) => {
    const segmentKey = productionWorkspaceArtifactNodeKey(segment, `segment:${segmentIndex}`)
    const segmentId = workspaceIdForWorkspaceNode(segmentKey, segment.id)
    segmentKeyByWorkspaceId.set(segmentId, segmentKey)
    segments.push({
      ID: segmentId,
      production_id: input.productionId,
      title: segment.title,
      kind: segment.kind,
      summary: segment.summary ?? segment.rationale,
      order: segment.order ?? segmentIndex + 1,
      script_block_id: segment.script_block_id ?? undefined,
    })

    ;(segment.scene_moments ?? []).forEach((moment, momentIndex) => {
      const momentKey = productionWorkspaceArtifactNodeKey(moment, `moment:${momentIndex}`)
      const momentId = workspaceIdForWorkspaceNode(`${segmentKey}/${momentKey}`, moment.id)
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
        script_block_id: moment.script_block_id ?? undefined,
      })

      ;(moment.content_units ?? []).forEach((unit, unitIndex) => {
        const unitKey = productionWorkspaceArtifactNodeKey(unit, `unit:${unitIndex}`)
        const unitId = workspaceIdForWorkspaceNode(`${segmentKey}/${momentKey}/${unitKey}`, unit.id)
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
          script_block_id: unit.script_block_id ?? moment.script_block_id ?? undefined,
        })
      })

      ;(moment.expression_units ?? []).forEach((expression, expressionIndex) => {
        const expressionKey = productionWorkspaceArtifactNodeKey(expression, `expression:${expressionIndex}`)
        const expressionId = workspaceIdForWorkspaceNode(`${segmentKey}/${momentKey}/${expressionKey}`, expression.id)
        expressionUnitKeyByWorkspaceId.set(expressionId, { segmentKey, momentKey, expressionKey })
        expressionUnits.push({
          ID: expressionId,
          scene_moment_id: momentId,
          script_block_id: expression.script_block_id ?? moment.script_block_id ?? undefined,
          kind: expression.kind as ExpressionUnitRecord['kind'],
          speaker: expression.speaker,
          text: expression.text,
          note: expression.note,
          intent: expression.intent,
          order: expression.order ?? expressionIndex + 1,
        })
      })

      ;(moment.settings ?? []).forEach((reference, referenceIndex) => {
        const referenceKey = productionWorkspaceArtifactNodeKey(reference, `reference:${referenceIndex}`)
        const referenceId = workspaceReferenceId(reference, referenceKey, referenceById)
        const usageId = workspaceIdForWorkspaceNode(`${segmentKey}/${momentKey}/${referenceKey}/usage`)
        referenceUsageByWorkspaceId.set(usageId, { segmentKey, momentKey, referenceKey })
        settingUsages.push({
          ID: usageId,
          owner_type: 'scene_moment',
          owner_id: momentId,
          setting_id: referenceId,
          role: reference.role ?? 'supporting',
        })
      })

      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        const slotKey = productionWorkspaceArtifactNodeKey(slot, `slot:${slotIndex}`)
        const slotId = workspaceIdForWorkspaceNode(`${segmentKey}/${momentKey}/${slotKey}`, slot.id)
        assetSlots.push({
          ID: slotId,
          production_id: input.productionId,
          name: slot.name,
          kind: slot.kind,
          priority: slot.priority,
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
    expressionUnits,
    contentUnits,
    settingUsages,
    assetSlots,
    keyframes,
    segmentKeyByWorkspaceId,
    sceneMomentKeyByWorkspaceId,
    contentUnitKeyByWorkspaceId,
    expressionUnitKeyByWorkspaceId,
    referenceUsageByWorkspaceId,
  }
}

/** @deprecated Use buildProductionWorkspaceArtifactData. */
export const buildProductionWorkspaceWorkspaceWorkspaceData = buildProductionWorkspaceArtifactData

export function workspaceIdForWorkspaceNode(key: string, persistedId?: number) {
  if (typeof persistedId === 'number' && Number.isFinite(persistedId) && persistedId > 0) return persistedId
  return -stableHash(key)
}

function workspaceReferenceId(
  reference: WorkspaceCreativeRefNode,
  referenceKey: string,
  referenceById: Map<number, SettingRecord>,
) {
  if (reference.id && referenceById.has(reference.id)) return reference.id
  return workspaceIdForWorkspaceNode(referenceKey, reference.id)
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) || 1
}

export function workspaceSettingFromRecord(reference: SettingRecord): WorkspaceCreativeRefNode {
  return {
    id: reference.ID,
    name: String(reference.name ?? reference.title ?? reference.label ?? `设定 #${reference.ID}`),
    kind: typeof reference.kind === 'string' ? reference.kind : undefined,
    source_label: '当前项目',
  }
}

export function workspaceAssetSlotFromRecord(slot: AssetSlotRecord): WorkspaceAssetSlotNode {
  return {
    id: slot.ID,
    name: String(slot.name ?? slot.title ?? slot.label ?? `素材 #${slot.ID}`),
    kind: typeof slot.kind === 'string' ? slot.kind : undefined,
    description: typeof slot.description === 'string' ? slot.description : undefined,
    priority: typeof slot.priority === 'string' ? slot.priority : undefined,
    source_label: '当前项目',
  }
}
