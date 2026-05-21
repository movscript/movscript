import type { AgentDraft } from '@/lib/localAgentClient'
import { PRODUCTION_PROPOSAL_DRAFT_SCHEMA } from '@/lib/productionProposalDraft'
import type {
  ProductionProposalPreviewSemanticChange,
  ProductionProposalPreviewWarning,
} from '@/api/semanticEntities'
import type {
  ProductionProposalApplyPreview as ProposalApplyPreview,
  ProductionProposalApplyPreviewItem as ProposalApplyPreviewItem,
  ProductionProposalSnapshotAction as ProposalSnapshotAction,
} from '@/components/proposals/ProductionProposalApplyPreviewPanel'
import type { ProductionProposalApplyGate as ProposalApplyGate } from '@/components/proposals/ProductionProposalApplyGatePanel'
import type {
  ProductionProposalContextResources as ProposalContextResources,
  ProductionProposalNodeDecision,
  ProductionProposalNodeDecisions,
  ProductionProposalSemanticDiffGroup as ProposalSemanticDiffGroup,
  ProductionProposalSemanticDiffItem as ProposalSemanticDiffItem,
} from '@/components/proposals/ProductionProposalSemanticDiffPanel'

export type ProposalNodeDecision = ProductionProposalNodeDecision
export type ProposalNodeDecisions = ProductionProposalNodeDecisions

export interface ProposalContentUnitNode {
  id?: number
  client_id?: string
  title?: string
  kind?: string
  unit_code?: string
  description?: string
  shot_size?: string
  camera_angle?: string
  duration_sec?: number
  order?: number
  status?: string
  script_block_id?: number
  before?: Record<string, unknown>
  keyframes?: ProposalKeyframeNode[]
  __delete?: boolean
}

export interface ProposalKeyframeNode {
  id?: number
  client_id?: string
  title?: string
  description?: string
  prompt?: string
  order?: number
  status?: string
  before?: Record<string, unknown>
  __delete?: boolean
}

export interface ProposalCreativeRefNode {
  id?: number
  client_id?: string
  name?: string
  kind?: string
  role?: string
  source_label?: string
  state?: Record<string, unknown>
  __delete?: boolean
}

export interface ProposalAssetSlotNode {
  id?: number
  client_id?: string
  name?: string
  kind?: string
  description?: string
  priority?: string
  source_label?: string
  __delete?: boolean
}

export interface ProposalSceneMomentNode {
  id?: number
  client_id?: string
  title?: string
  time_text?: string
  scene_code?: string
  location_text?: string
  action_text?: string
  mood?: string
  description?: string
  order?: number
  status?: string
  script_block_id?: number
  content_units?: ProposalContentUnitNode[]
  creative_references?: ProposalCreativeRefNode[]
  asset_slots?: ProposalAssetSlotNode[]
  keyframes?: ProposalKeyframeNode[]
  rationale?: string
  before?: Record<string, unknown>
  __delete?: boolean
}

export interface ProposalSegmentNode {
  id?: number
  client_id?: string
  title?: string
  kind?: string
  summary?: string
  order?: number
  status?: string
  script_block_id?: number
  scene_moments?: ProposalSceneMomentNode[]
  rationale?: string
  before?: Record<string, unknown>
  __delete?: boolean
}

export interface ProposalDraftContent {
  mode?: 'snapshot'
  productionId: number
  proposalScope?: string
  summary?: string
  proposal: { segments: ProposalSegmentNode[] }
  proposedAt?: string
  draftId?: string
  draftTitle?: string
  draftUpdatedAt?: string
}

export interface ApplyProductionProposalCounts {
  segments_created: number
  scene_moments_created: number
  content_units_created: number
  asset_slots_created: number
  keyframes_created: number
  creative_references_created: number
  creative_reference_usages: number
}

export interface ProposalSimulationResult {
  acceptedNodes: number
  rejectedNodes: number
  unresolvedNodes: number
  counts: ApplyProductionProposalCounts
  actions: { create: number; update: number; delete: number }
  preview: ProposalApplyPreview
  backendPreview?: {
    dryRun: boolean
    counts: ApplyProductionProposalCounts
    returned: {
      segments: number
      sceneMoments: number
      creativeReferences: number
      assetSlots: number
      contentUnits: number
      keyframes: number
    }
    semanticChanges: ProductionProposalPreviewSemanticChange[]
    warnings: ProductionProposalPreviewWarning[]
  }
}

export interface ProposalReviewNode {
  key: string
  action: ProposalSnapshotAction
  kind: 'segment' | 'scene_moment' | 'content_unit' | 'keyframe' | 'creative_reference' | 'asset_slot'
}

export interface ProductionProposalSnapshotRecord {
  ID: number
  [key: string]: unknown
}

export interface BuildCurrentProductionProposalSnapshotInput {
  segments: ProductionProposalSnapshotRecord[]
  sceneMoments: ProductionProposalSnapshotRecord[]
  creativeReferences: ProductionProposalSnapshotRecord[]
  creativeReferenceUsages: ProductionProposalSnapshotRecord[]
  contentUnits: ProductionProposalSnapshotRecord[]
  keyframes: ProductionProposalSnapshotRecord[]
  assetSlots: ProductionProposalSnapshotRecord[]
}

export function parseProductionProposalDraft(draft: AgentDraft): ProposalDraftContent | null {
  try {
    const content = JSON.parse(draft.content) as Record<string, unknown>
    if (content.schema !== PRODUCTION_PROPOSAL_DRAFT_SCHEMA) return null
    const proposal = isRecordValue(content.proposal) ? content.proposal : {}
    if (content.mode !== 'snapshot' || containsProposalActionField(proposal)) return null
    const rawSegments = Array.isArray(proposal.segments)
      ? proposal.segments
      : Array.isArray(content.segments)
        ? content.segments
        : []
    const productionId = numericDraftField(content.productionId)
      ?? numericDraftField(content.production_id)
      ?? numericDraftField(draft.target?.entityId)
      ?? numericDraftField(draft.target?.productionId)
      ?? numericDraftField(draft.metadata?.productionId)
      ?? 0

    return {
      mode: 'snapshot',
      productionId,
      proposalScope: stringDraftField(content.proposal_scope) || stringDraftField(content.proposalScope),
      summary: stringDraftField(content.summary),
      proposal: {
        segments: rawSegments.filter(isRecordValue) as unknown as ProposalSegmentNode[],
      },
      proposedAt: stringDraftField(content.proposedAt) || stringDraftField(content.createdAt) || draft.createdAt,
      draftId: draft.id,
      draftTitle: draft.title,
      draftUpdatedAt: draft.updatedAt,
    }
  } catch {
    return null
  }
}

export function buildCurrentProductionProposalSnapshot(input: BuildCurrentProductionProposalSnapshotInput): { segments: ProposalSegmentNode[] } {
  const creativeReferenceById = new Map(input.creativeReferences.map((reference) => [reference.ID, reference]))
  const referencesBySceneMoment = new Map<number, ProposalCreativeRefNode[]>()
  const assetSlotsBySceneMoment = new Map<number, ProductionProposalSnapshotRecord[]>()
  const unitsBySceneMoment = new Map<number, ProductionProposalSnapshotRecord[]>()
  const keyframesBySceneMoment = new Map<number, ProductionProposalSnapshotRecord[]>()
  const keyframesByContentUnit = new Map<number, ProductionProposalSnapshotRecord[]>()

  for (const usage of input.creativeReferenceUsages) {
    if (String(usage.owner_type ?? '') !== 'scene_moment') continue
    const ownerId = positiveRecordNumber(usage.owner_id)
    const referenceId = positiveRecordNumber(usage.creative_reference_id)
    if (!ownerId || !referenceId) continue
    const reference = creativeReferenceById.get(referenceId)
    pushSnapshotGroupedRecord(referencesBySceneMoment, ownerId, {
      id: referenceId,
      name: reference ? stringRecordValue(reference.name) || proposalSnapshotTitleOfRecord(reference) : undefined,
      kind: reference ? stringRecordValue(reference.kind) : undefined,
      role: stringRecordValue(usage.role),
      source_label: '当前项目',
    })
  }

  for (const slot of input.assetSlots) {
    if (String(slot.owner_type ?? '') !== 'scene_moment') continue
    const ownerId = positiveRecordNumber(slot.owner_id)
    if (!ownerId) continue
    pushSnapshotGroupedRecord(assetSlotsBySceneMoment, ownerId, slot)
  }
  for (const unit of input.contentUnits) {
    const sceneMomentId = positiveRecordNumber(unit.scene_moment_id)
    if (!sceneMomentId) continue
    pushSnapshotGroupedRecord(unitsBySceneMoment, sceneMomentId, unit)
  }
  for (const keyframe of input.keyframes) {
    const contentUnitId = positiveRecordNumber(keyframe.content_unit_id)
    if (contentUnitId) {
      pushSnapshotGroupedRecord(keyframesByContentUnit, contentUnitId, keyframe)
      continue
    }
    const sceneMomentId = positiveRecordNumber(keyframe.scene_moment_id)
    if (sceneMomentId) pushSnapshotGroupedRecord(keyframesBySceneMoment, sceneMomentId, keyframe)
  }

  return {
    segments: input.segments.map((segment) => {
      const moments = input.sceneMoments
        .filter((moment) => Number(moment.segment_id) === segment.ID)
        .sort(proposalSnapshotByOrder)
        .map((moment) => {
          const contentUnits = (unitsBySceneMoment.get(moment.ID) ?? []).slice().sort(proposalSnapshotByOrder).map((unit) => ({
            id: unit.ID,
            client_id: stringRecordValue(unit.client_id),
            title: stringRecordValue(unit.title) || proposalSnapshotTitleOfRecord(unit),
            kind: stringRecordValue(unit.kind),
            unit_code: stringRecordValue(unit.unit_code),
            description: stringRecordValue(unit.description),
            shot_size: stringRecordValue(unit.shot_size),
            camera_angle: stringRecordValue(unit.camera_angle),
            duration_sec: positiveRecordNumber(unit.duration_sec),
            order: positiveRecordNumber(unit.order),
            status: stringRecordValue(unit.status),
            script_block_id: positiveRecordNumber(unit.script_block_id),
            keyframes: (keyframesByContentUnit.get(unit.ID) ?? []).slice().sort(proposalSnapshotByOrder).map(proposalKeyframeFromRecord),
          }))
          return {
            id: moment.ID,
            client_id: stringRecordValue(moment.client_id),
            title: stringRecordValue(moment.title) || proposalSnapshotTitleOfRecord(moment),
            scene_code: stringRecordValue(moment.scene_code),
            time_text: stringRecordValue(moment.time_text),
            location_text: stringRecordValue(moment.location_text),
            action_text: stringRecordValue(moment.action_text),
            mood: stringRecordValue(moment.mood),
            description: stringRecordValue(moment.description),
            order: positiveRecordNumber(moment.order),
            status: stringRecordValue(moment.status),
            script_block_id: positiveRecordNumber(moment.script_block_id),
            content_units: contentUnits,
            keyframes: (keyframesBySceneMoment.get(moment.ID) ?? []).slice().sort(proposalSnapshotByOrder).map(proposalKeyframeFromRecord),
            creative_references: (referencesBySceneMoment.get(moment.ID) ?? []).slice(),
            asset_slots: (assetSlotsBySceneMoment.get(moment.ID) ?? []).slice().sort(proposalSnapshotByOrder).map((slot) => ({
              id: slot.ID,
              client_id: stringRecordValue(slot.client_id),
              name: stringRecordValue(slot.name) || proposalSnapshotTitleOfRecord(slot),
              kind: stringRecordValue(slot.kind),
              description: stringRecordValue(slot.description),
              priority: stringRecordValue(slot.priority),
              source_label: '当前项目',
            })),
          } satisfies ProposalSceneMomentNode
        })
      return {
        id: segment.ID,
        client_id: stringRecordValue(segment.client_id),
        title: stringRecordValue(segment.title) || proposalSnapshotTitleOfRecord(segment),
        kind: stringRecordValue(segment.kind),
        summary: stringRecordValue(segment.summary ?? segment.content),
        order: positiveRecordNumber(segment.order),
        status: stringRecordValue(segment.status),
        script_block_id: positiveRecordNumber(segment.script_block_id),
        scene_moments: moments,
      } satisfies ProposalSegmentNode
    }),
  }

  function proposalKeyframeFromRecord(keyframe: ProductionProposalSnapshotRecord): ProposalKeyframeNode {
    return {
      id: keyframe.ID,
      client_id: stringRecordValue(keyframe.client_id),
      title: stringRecordValue(keyframe.title) || proposalSnapshotTitleOfRecord(keyframe),
      description: stringRecordValue(keyframe.description),
      prompt: stringRecordValue(keyframe.prompt),
      order: positiveRecordNumber(keyframe.order),
      status: stringRecordValue(keyframe.status),
    }
  }
}

export function proposalNodeIdentity(node: { client_id?: string; id?: number }, fallback: string) {
  return node.client_id ?? (node.id ? String(node.id) : fallback)
}

export function proposalNodeDecisionKey(type: string, node: { client_id?: string; id?: number }, fallback: string) {
  return nodeDecisionKey(type, proposalNodeIdentity(node, fallback))
}

export function collectProposalReviewNodes(segments: ProposalSegmentNode[]): ProposalReviewNode[] {
  return segments.flatMap((segment, index) => collectSegmentProposalReviewNodes(segment, index))
}

export function collectProposalContextResources(segments: ProposalSegmentNode[]): ProposalContextResources {
  const context: ProposalContextResources = {
    creativeReferences: [],
    assetSlots: [],
  }

  segments.forEach((segment, segmentIndex) => {
    const segmentId = proposalNodeIdentity(segment, String(segmentIndex))
    const segmentTitle = segment.title || `编排段 ${segmentIndex + 1}`
    ;(segment.scene_moments ?? []).forEach((moment, momentIndex) => {
      const momentFallback = `${segmentId}-${momentIndex}`
      const momentTitle = moment.title || `情节 ${momentIndex + 1}`
      const parent = `${segmentTitle} / ${momentTitle}`

      ;(moment.creative_references ?? []).forEach((reference, referenceIndex) => {
        context.creativeReferences.push({
          nodeKey: proposalNodeDecisionKey('creative_reference', reference, `${momentFallback}-reference-${referenceIndex}`),
          action: proposalSnapshotAction(reference),
          title: reference.name || '未命名设定资料',
          detail: compactParts([reference.kind, reference.role, reference.source_label, stateSummary(reference.state)]),
          parent,
        })
      })

      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        context.assetSlots.push({
          nodeKey: proposalNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`),
          action: proposalSnapshotAction(slot),
          title: slot.name || '未命名素材需求',
          detail: compactParts([slot.kind, slot.priority, slot.source_label, slot.description]),
          parent,
        })
      })
    })
  })

  return context
}

export function buildProposalSemanticDiff(segments: ProposalSegmentNode[]): ProposalSemanticDiffGroup[] {
  return segments.map((segment, segmentIndex) => {
    const segmentId = proposalNodeIdentity(segment, String(segmentIndex))
    const segmentKey = proposalNodeDecisionKey('segment', segment, String(segmentIndex))
    const moments = segment.scene_moments ?? []
    const children: ProposalSemanticDiffItem[] = []

    moments.forEach((moment, momentIndex) => {
      const momentFallback = `${segmentId}-${momentIndex}`
      const momentKey = proposalNodeDecisionKey('scene_moment', moment, momentFallback)
      children.push({
        key: momentKey,
        acceptKeys: [segmentKey, momentKey],
        title: moment.title || `情节 ${momentIndex + 1}`,
        detail: compactParts([moment.time_text, moment.location_text, moment.mood, moment.rationale]),
        action: proposalSnapshotAction(moment),
        kind: 'structure',
        before: proposalBeforeText(moment.before, ['action_text', 'description', 'title']),
        after: compactParts([moment.action_text, moment.description]),
      })
      ;(moment.content_units ?? []).forEach((unit, unitIndex) => {
        const unitFallback = `${momentFallback}-content-${unitIndex}`
        const unitKey = proposalNodeDecisionKey('content_unit', unit, unitFallback)
        children.push({
          key: unitKey,
          acceptKeys: [segmentKey, momentKey, unitKey],
          title: unit.title || `制作项 ${unitIndex + 1}`,
          detail: compactParts([unit.kind, unit.shot_size, unit.camera_angle, unit.duration_sec ? `${unit.duration_sec}s` : '', unit.description]),
          action: proposalSnapshotAction(unit),
          kind: 'content',
          before: proposalBeforeText(unit.before, ['description', 'title']),
          after: compactParts([unit.description]),
        })
        ;(unit.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
          const keyframeKey = proposalNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`)
          children.push({
            key: keyframeKey,
            acceptKeys: [segmentKey, momentKey, unitKey, keyframeKey],
            title: keyframe.title || `镜头关键帧 ${keyframeIndex + 1}`,
            detail: compactParts([keyframe.description, keyframe.prompt]),
            action: proposalSnapshotAction(keyframe),
            kind: 'content',
            before: proposalBeforeText(keyframe.before, ['description', 'prompt', 'title']),
            after: compactParts([keyframe.description, keyframe.prompt]),
          })
        })
      })
      ;(moment.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
        const keyframeKey = proposalNodeDecisionKey('keyframe', keyframe, `${momentFallback}-keyframe-${keyframeIndex}`)
        children.push({
          key: keyframeKey,
          acceptKeys: [segmentKey, momentKey, keyframeKey],
          title: keyframe.title || `情节预览画面 ${keyframeIndex + 1}`,
          detail: compactParts([keyframe.description, keyframe.prompt]),
          action: proposalSnapshotAction(keyframe),
          kind: 'content',
          before: proposalBeforeText(keyframe.before, ['description', 'prompt', 'title']),
          after: compactParts([keyframe.description, keyframe.prompt]),
        })
      })
      ;(moment.creative_references ?? []).forEach((reference, referenceIndex) => {
        const referenceKey = proposalNodeDecisionKey('creative_reference', reference, `${momentFallback}-reference-${referenceIndex}`)
        children.push({
          key: referenceKey,
          acceptKeys: [segmentKey, momentKey, referenceKey],
          title: reference.name || '设定资料',
          detail: compactParts([reference.kind, reference.role, reference.source_label, stateSummary(reference.state)]),
          action: proposalSnapshotAction(reference),
          kind: 'reference',
        })
      })
      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        const slotKey = proposalNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`)
        children.push({
          key: slotKey,
          acceptKeys: [segmentKey, momentKey, slotKey],
          title: slot.name || '素材需求',
          detail: compactParts([slot.kind, slot.priority, slot.source_label, slot.description]),
          action: proposalSnapshotAction(slot),
          kind: 'asset',
        })
      })
    })

    return {
      key: segmentKey,
      title: segment.title || `编排段 ${segmentIndex + 1}`,
      detail: compactParts([segment.kind, segment.summary, segment.rationale]),
      action: proposalSnapshotAction(segment),
      kind: 'structure',
      acceptKeys: [segmentKey],
      nodeKeys: [segmentKey, ...children.map((item) => item.key)],
      stats: [
        `${moments.length} 情节`,
        `${children.filter((item) => item.kind === 'content').length} 内容分镜`,
        `${children.filter((item) => item.kind === 'reference').length} 设定引用`,
        `${children.filter((item) => item.kind === 'asset').length} 素材需求`,
      ],
      children,
    }
  })
}

export function buildProposalApplyPreview(segments: ProposalSegmentNode[], decisions: ProposalNodeDecisions): ProposalApplyPreview {
  const preview: ProposalApplyPreview = {
    writePlan: [],
    rejected: [],
    pending: [],
    blocked: [],
  }

  function pushByDecision(item: ProposalApplyPreviewItem, decision: ProposalNodeDecision | undefined, blocked = false) {
    if (blocked) {
      preview.blocked.push(item)
    } else if (decision === 'accepted') {
      preview.writePlan.push(item)
    } else if (decision === 'rejected') {
      preview.rejected.push(item)
    } else {
      preview.pending.push(item)
    }
  }

  segments.forEach((segment, segmentIndex) => {
    const segmentId = proposalNodeIdentity(segment, String(segmentIndex))
    const segmentKey = proposalNodeDecisionKey('segment', segment, String(segmentIndex))
    const segmentDecision = decisions[segmentKey]
    const segmentTitle = segment.title || `编排段 ${segmentIndex + 1}`
    pushByDecision({
      key: segmentKey,
      title: segmentTitle,
      detail: compactParts([segment.kind, segment.summary, segment.rationale]),
      kind: 'segment',
      action: proposalSnapshotAction(segment),
    }, segmentDecision)

    ;(segment.scene_moments ?? []).forEach((moment, momentIndex) => {
      const momentFallback = `${segmentId}-${momentIndex}`
      const momentKey = proposalNodeDecisionKey('scene_moment', moment, momentFallback)
      const momentDecision = decisions[momentKey]
      const momentTitle = moment.title || `情节 ${momentIndex + 1}`
      const momentBlocked = momentDecision === 'accepted' && segmentDecision !== 'accepted'
      pushByDecision({
        key: momentKey,
        title: momentTitle,
        detail: compactParts([moment.time_text, moment.location_text, moment.mood, moment.action_text, moment.description]),
        kind: 'scene_moment',
        action: proposalSnapshotAction(moment),
        parent: segmentTitle,
      }, momentDecision, momentBlocked)

      ;(moment.content_units ?? []).forEach((unit, unitIndex) => {
        const unitFallback = `${momentFallback}-content-${unitIndex}`
        const unitKey = proposalNodeDecisionKey('content_unit', unit, unitFallback)
        const unitDecision = decisions[unitKey]
        const unitTitle = unit.title || `制作项 ${unitIndex + 1}`
        const unitBlocked = unitDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted')
        pushByDecision({
          key: unitKey,
          title: unitTitle,
          detail: compactParts([unit.kind, unit.shot_size, unit.camera_angle, unit.duration_sec ? `${unit.duration_sec}s` : '', unit.description]),
          kind: 'content_unit',
          action: proposalSnapshotAction(unit),
          parent: `${segmentTitle} / ${momentTitle}`,
        }, unitDecision, unitBlocked)

        ;(unit.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
          const keyframeKey = proposalNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`)
          const keyframeDecision = decisions[keyframeKey]
          const keyframeBlocked = keyframeDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted' || unitDecision !== 'accepted')
          pushByDecision({
            key: keyframeKey,
            title: keyframe.title || `镜头关键帧 ${keyframeIndex + 1}`,
            detail: compactParts([keyframe.description, keyframe.prompt]),
            kind: 'keyframe',
            action: proposalSnapshotAction(keyframe),
            parent: `${segmentTitle} / ${momentTitle} / ${unitTitle}`,
          }, keyframeDecision, keyframeBlocked)
        })
      })

      ;(moment.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
        const keyframeKey = proposalNodeDecisionKey('keyframe', keyframe, `${momentFallback}-keyframe-${keyframeIndex}`)
        const keyframeDecision = decisions[keyframeKey]
        const keyframeBlocked = keyframeDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted')
        pushByDecision({
          key: keyframeKey,
          title: keyframe.title || `情节预览画面 ${keyframeIndex + 1}`,
          detail: compactParts([keyframe.description, keyframe.prompt]),
          kind: 'keyframe',
          action: proposalSnapshotAction(keyframe),
          parent: `${segmentTitle} / ${momentTitle}`,
        }, keyframeDecision, keyframeBlocked)
      })

      ;(moment.creative_references ?? []).forEach((reference, referenceIndex) => {
        const referenceKey = proposalNodeDecisionKey('creative_reference', reference, `${momentFallback}-reference-${referenceIndex}`)
        const referenceDecision = decisions[referenceKey]
        const referenceBlocked = referenceDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted' || !snapshotNodeHasID(reference))
        pushByDecision({
          key: referenceKey,
          title: reference.name || '设定资料',
          detail: compactParts([reference.kind, reference.role, reference.source_label, stateSummary(reference.state)]),
          kind: 'creative_reference',
          action: proposalSnapshotAction(reference),
          parent: `${segmentTitle} / ${momentTitle}`,
        }, referenceDecision, referenceBlocked)
      })

      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        const slotKey = proposalNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`)
        const slotDecision = decisions[slotKey]
        const slotBlocked = slotDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted')
        pushByDecision({
          key: slotKey,
          title: slot.name || '素材需求',
          detail: compactParts([slot.kind, slot.priority, slot.source_label, slot.description]),
          kind: 'asset_slot',
          action: proposalSnapshotAction(slot),
          parent: `${segmentTitle} / ${momentTitle}`,
        }, slotDecision, slotBlocked)
      })
    })
  })

  return preview
}

export function buildProposalApplyGate(preview: ProposalApplyPreview, backendPreviewReady: boolean): ProposalApplyGate {
  if (preview.writePlan.length === 0) {
    return {
      status: 'empty',
      title: '还没有可写入内容',
      detail: '请先在提案审阅中接受至少一个编排段和它的情节。',
    }
  }
  if (preview.blocked.length > 0) {
    return {
      status: 'blocked',
      title: '存在不能写入的变更',
      detail: '请处理依赖未接受的节点；如果变更是新增或更新设定/素材需求，需要先处理对应上游草稿。',
    }
  }
  if (!backendPreviewReady) {
    return {
      status: 'needs_preview',
      title: '需要写入预检',
      detail: '当前决策还没有通过写入预检。请先点击“预检影响”完成校验。',
    }
  }
  if (preview.pending.length > 0) {
    return {
      status: 'ready',
      title: '可写入已接受内容',
      detail: `仍有 ${preview.pending.length} 项未处理，写入时会跳过它们。`,
    }
  }
  return {
    status: 'ready',
    title: '可以写入项目',
    detail: '所有可写入项已通过写入预检，本次写入不会包含已拒绝项。',
  }
}

export function countProposalDecisionSummary(segments: ProposalSegmentNode[], decisions: ProposalNodeDecisions) {
  const nodes = collectProposalReviewNodes(segments)
  const accepted = nodes.filter((node) => decisions[node.key] === 'accepted').length
  const rejected = nodes.filter((node) => decisions[node.key] === 'rejected').length
  return {
    accepted,
    rejected,
    unresolved: Math.max(0, nodes.length - accepted - rejected),
  }
}

export function countProposalActions(segments: ProposalSegmentNode[]) {
  const counts = { create: 0, update: 0, delete: 0 }
  function add(node: { id?: number | null; __delete?: boolean }) {
    const action = proposalSnapshotAction(node)
    if (action === 'delete') counts.delete += 1
    else if (action === 'update') counts.update += 1
    else counts.create += 1
  }
  for (const segment of segments) {
    add(segment)
    for (const moment of segment.scene_moments ?? []) {
      add(moment)
      for (const unit of moment.content_units ?? []) {
        add(unit)
        for (const keyframe of unit.keyframes ?? []) add(keyframe)
      }
      for (const keyframe of moment.keyframes ?? []) add(keyframe)
      for (const reference of moment.creative_references ?? []) add(reference)
      for (const slot of moment.asset_slots ?? []) add(slot)
    }
  }
  return counts
}

export function buildProposalSimulationResult({
  reviewSegments,
  acceptedSegments,
  decisions,
}: {
  reviewSegments: ProposalSegmentNode[]
  acceptedSegments: ProposalSegmentNode[]
  decisions: ProposalNodeDecisions
}): ProposalSimulationResult {
  const reviewNodes = collectProposalReviewNodes(reviewSegments)
  const counts: ApplyProductionProposalCounts = {
    segments_created: 0,
    scene_moments_created: 0,
    content_units_created: 0,
    asset_slots_created: 0,
    keyframes_created: 0,
    creative_references_created: 0,
    creative_reference_usages: 0,
  }
  const actions = { create: 0, update: 0, delete: 0 }
  const addAction = (node: { id?: number | null; __delete?: boolean }) => {
    const action = proposalSnapshotAction(node)
    if (action === 'delete') actions.delete += 1
    else if (action === 'update') actions.update += 1
    else actions.create += 1
  }

  for (const segment of acceptedSegments) {
    addAction(segment)
    if (!snapshotNodeHasID(segment)) counts.segments_created += 1
    for (const moment of segment.scene_moments ?? []) {
      addAction(moment)
      if (!snapshotNodeHasID(moment)) counts.scene_moments_created += 1
      for (const unit of moment.content_units ?? []) {
        addAction(unit)
        if (!snapshotNodeHasID(unit)) counts.content_units_created += 1
        for (const keyframe of unit.keyframes ?? []) {
          addAction(keyframe)
          if (!snapshotNodeHasID(keyframe)) counts.keyframes_created += 1
        }
      }
      for (const keyframe of moment.keyframes ?? []) {
        addAction(keyframe)
        if (!snapshotNodeHasID(keyframe)) counts.keyframes_created += 1
      }
      for (const reference of moment.creative_references ?? []) {
        addAction(reference)
        counts.creative_reference_usages += 1
      }
      for (const slot of moment.asset_slots ?? []) {
        addAction(slot)
        if (!snapshotNodeHasID(slot)) counts.asset_slots_created += 1
      }
    }
  }

  return {
    acceptedNodes: reviewNodes.filter((node) => decisions[node.key] === 'accepted').length,
    rejectedNodes: reviewNodes.filter((node) => decisions[node.key] === 'rejected').length,
    unresolvedNodes: Math.max(0, reviewNodes.length - reviewNodes.filter((node) => decisions[node.key] === 'accepted' || decisions[node.key] === 'rejected').length),
    counts,
    actions,
    preview: buildProposalApplyPreview(reviewSegments, decisions),
  }
}

export function buildProposalReviewSegments(proposalSegments: ProposalSegmentNode[], currentSnapshot: { segments: ProposalSegmentNode[] }): ProposalSegmentNode[] {
  const next = cloneProposalSegments(proposalSegments)
  const currentById = new Map(currentSnapshot.segments.filter((segment) => snapshotNodeHasID(segment)).map((segment) => [segment.id!, segment]))
  const proposedIds = new Set(next.filter((segment) => snapshotNodeHasID(segment)).map((segment) => segment.id!))

  for (const segment of next) {
    if (!snapshotNodeHasID(segment)) continue
    const current = currentById.get(segment.id!)
    if (current) appendDeletedChildren(segment, current)
  }
  for (const current of currentSnapshot.segments) {
    if (!snapshotNodeHasID(current) || proposedIds.has(current.id!)) continue
    next.push(markProposalSegmentDeleted(current))
  }
  return next
}

export function buildMergedProductionProposal(
  currentSnapshot: { segments: ProposalSegmentNode[] },
  reviewSegments: ProposalSegmentNode[],
  decisions: ProposalNodeDecisions,
): { segments: ProposalSegmentNode[] } {
  const next = cloneProposalSegments(currentSnapshot.segments)
  reviewSegments.forEach((segment, segmentIndex) => {
    const segmentKey = proposalNodeDecisionKey('segment', segment, String(segmentIndex))
    if (decisions[segmentKey] !== 'accepted') return
    const segmentId = proposalNodeIdentity(segment, String(segmentIndex))
    if (segment.__delete) {
      removeNodeById(next, segment.id)
      return
    }
    const targetSegment = upsertSegmentNode(next, segment)
    ;(segment.scene_moments ?? []).forEach((moment, momentIndex) => {
      const momentFallback = `${segmentId}-${momentIndex}`
      const momentKey = proposalNodeDecisionKey('scene_moment', moment, momentFallback)
      if (decisions[momentKey] !== 'accepted') return
      if (moment.__delete) {
        targetSegment.scene_moments = removeNodeById(targetSegment.scene_moments ?? [], moment.id)
        return
      }
      const targetMoment = upsertMomentNode(targetSegment, moment)
      ;(moment.content_units ?? []).forEach((unit, unitIndex) => {
        const unitFallback = `${momentFallback}-content-${unitIndex}`
        const unitKey = proposalNodeDecisionKey('content_unit', unit, unitFallback)
        if (decisions[unitKey] !== 'accepted') return
        if (unit.__delete) {
          targetMoment.content_units = removeNodeById(targetMoment.content_units ?? [], unit.id)
          return
        }
        const targetUnit = upsertContentUnitNode(targetMoment, unit)
        ;(unit.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
          const keyframeKey = proposalNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`)
          if (decisions[keyframeKey] !== 'accepted') return
          if (keyframe.__delete) {
            targetUnit.keyframes = removeNodeById(targetUnit.keyframes ?? [], keyframe.id)
            return
          }
          targetUnit.keyframes = upsertNode(targetUnit.keyframes ?? [], keyframe)
        })
      })
      ;(moment.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
        const keyframeKey = proposalNodeDecisionKey('keyframe', keyframe, `${momentFallback}-keyframe-${keyframeIndex}`)
        if (decisions[keyframeKey] !== 'accepted') return
        if (keyframe.__delete) {
          targetMoment.keyframes = removeNodeById(targetMoment.keyframes ?? [], keyframe.id)
          return
        }
        targetMoment.keyframes = upsertNode(targetMoment.keyframes ?? [], keyframe)
      })
      ;(moment.creative_references ?? []).forEach((reference, referenceIndex) => {
        const referenceKey = proposalNodeDecisionKey('creative_reference', reference, `${momentFallback}-reference-${referenceIndex}`)
        if (decisions[referenceKey] !== 'accepted' || reference.__delete) return
        targetMoment.creative_references = upsertNode(targetMoment.creative_references ?? [], reference)
      })
      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        const slotKey = proposalNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`)
        if (decisions[slotKey] !== 'accepted') return
        if (slot.__delete) {
          targetMoment.asset_slots = removeNodeById(targetMoment.asset_slots ?? [], slot.id)
          return
        }
        targetMoment.asset_slots = upsertNode(targetMoment.asset_slots ?? [], slot)
      })
    })
  })
  return { segments: next.map(stripProposalInternalFields) }
}

export function proposalDecisionSnapshotKey(nodes: ProposalReviewNode[], decisions: ProposalNodeDecisions) {
  return nodes
    .map((node) => `${node.key}=${decisions[node.key] ?? 'pending'}`)
    .join('|')
}

export function findProductionProposalSnapshotIssue(proposal: { segments: ProposalSegmentNode[] }): { label: string } | null {
  for (const segment of proposal.segments) {
    for (const moment of segment.scene_moments ?? []) {
      for (const reference of moment.creative_references ?? []) {
        if (!snapshotNodeHasID(reference)) {
          return { label: reference.name ?? reference.client_id ?? '设定资料' }
        }
      }
    }
  }
  return null
}

export function snapshotNodeHasID(node: { id?: number | null }) {
  return typeof node.id === 'number' && node.id > 0
}

export function proposalSnapshotAction(node: { id?: number | null; __delete?: boolean }): ProposalSnapshotAction {
  if (node.__delete) return 'delete'
  return snapshotNodeHasID(node) ? 'update' : 'create'
}

export function stripProposalInternalFields<T>(node: T): T {
  if (Array.isArray(node)) return node.map(stripProposalInternalFields) as T
  if (!isRecordValue(node)) return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === '__delete') continue
    out[key] = stripProposalInternalFields(value)
  }
  return out as T
}

export function cloneProposalSegments(segments: ProposalSegmentNode[]) {
  return segments.map((segment) => cloneProposalNode(segment))
}

export function cloneProposalNode<T>(node: T): T {
  return stripProposalInternalFields(JSON.parse(JSON.stringify(node))) as T
}

function proposalSnapshotByOrder(a: ProductionProposalSnapshotRecord, b: ProductionProposalSnapshotRecord) {
  const ao = typeof a.order === 'number' ? a.order : a.ID
  const bo = typeof b.order === 'number' ? b.order : b.ID
  return ao - bo
}

function positiveRecordNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function stringRecordValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function proposalSnapshotTitleOfRecord(record: ProductionProposalSnapshotRecord | null | undefined) {
  if (!record) return '未命名'
  return String(record.title ?? record.name ?? record.scene_code ?? record.unit_code ?? record.kind ?? `#${record.ID}`)
}

function pushSnapshotGroupedRecord<T>(map: Map<string | number, T[]>, key: string | number, value: T) {
  const list = map.get(key) ?? []
  list.push(value)
  map.set(key, list)
}

function nodeDecisionKey(type: string, id: string) {
  return `${type}:${id}`
}

function collectSegmentProposalReviewNodes(segment: ProposalSegmentNode, index: number): ProposalReviewNode[] {
  const segmentId = proposalNodeIdentity(segment, String(index))
  return [
    { key: proposalNodeDecisionKey('segment', segment, String(index)), action: proposalSnapshotAction(segment), kind: 'segment' },
    ...(segment.scene_moments ?? []).flatMap((moment, momentIndex) =>
      collectSceneProposalReviewNodes(moment, `${segmentId}-${momentIndex}`),
    ),
  ]
}

function collectSceneProposalReviewNodes(moment: ProposalSceneMomentNode, fallback: string): ProposalReviewNode[] {
  return [
    { key: proposalNodeDecisionKey('scene_moment', moment, fallback), action: proposalSnapshotAction(moment), kind: 'scene_moment' },
    ...(moment.content_units ?? []).flatMap((unit, index) => {
      const unitFallback = `${fallback}-content-${index}`
      return [
        {
          key: proposalNodeDecisionKey('content_unit', unit, unitFallback),
          action: proposalSnapshotAction(unit),
          kind: 'content_unit' as const,
        },
        ...(unit.keyframes ?? []).map((keyframe, keyframeIndex) => ({
          key: proposalNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`),
          action: proposalSnapshotAction(keyframe),
          kind: 'keyframe' as const,
        })),
      ]
    }),
    ...(moment.keyframes ?? []).map((keyframe, index) => ({
      key: proposalNodeDecisionKey('keyframe', keyframe, `${fallback}-keyframe-${index}`),
      action: proposalSnapshotAction(keyframe),
      kind: 'keyframe' as const,
    })),
    ...(moment.creative_references ?? []).map((reference, index) => ({
      key: proposalNodeDecisionKey('creative_reference', reference, `${fallback}-reference-${index}`),
      action: proposalSnapshotAction(reference),
      kind: 'creative_reference' as const,
    })),
    ...(moment.asset_slots ?? []).map((slot, index) => ({
      key: proposalNodeDecisionKey('asset_slot', slot, `${fallback}-asset-${index}`),
      action: proposalSnapshotAction(slot),
      kind: 'asset_slot' as const,
    })),
  ]
}

function appendDeletedChildren(proposed: ProposalSegmentNode, current: ProposalSegmentNode) {
  const proposedMoments = proposed.scene_moments ?? []
  const currentMoments = current.scene_moments ?? []
  const proposedMomentIds = new Set(proposedMoments.filter(snapshotNodeHasID).map((moment) => moment.id!))
  for (const moment of proposedMoments) {
    if (!snapshotNodeHasID(moment)) continue
    const currentMoment = currentMoments.find((item) => item.id === moment.id)
    if (currentMoment) appendDeletedMomentChildren(moment, currentMoment)
  }
  const deletedMoments = currentMoments
    .filter((moment) => snapshotNodeHasID(moment) && !proposedMomentIds.has(moment.id!))
    .map(markProposalMomentDeleted)
  if (deletedMoments.length > 0) proposed.scene_moments = [...proposedMoments, ...deletedMoments]
}

function appendDeletedMomentChildren(proposed: ProposalSceneMomentNode, current: ProposalSceneMomentNode) {
  proposed.content_units = appendDeletedNodes(
    proposed.content_units ?? [],
    current.content_units ?? [],
    markProposalContentUnitDeleted,
  )
  proposed.keyframes = appendDeletedNodes(
    proposed.keyframes ?? [],
    current.keyframes ?? [],
    markProposalKeyframeDeleted,
  )
  proposed.asset_slots = appendDeletedNodes(
    proposed.asset_slots ?? [],
    current.asset_slots ?? [],
    markProposalAssetSlotDeleted,
  )
  for (const unit of proposed.content_units ?? []) {
    if (!snapshotNodeHasID(unit)) continue
    const currentUnit = (current.content_units ?? []).find((item) => item.id === unit.id)
    if (!currentUnit) continue
    unit.keyframes = appendDeletedNodes(unit.keyframes ?? [], currentUnit.keyframes ?? [], markProposalKeyframeDeleted)
  }
}

function appendDeletedNodes<T extends { id?: number; __delete?: boolean }>(proposed: T[], current: T[], markDeleted: (node: T) => T): T[] {
  const proposedIds = new Set(proposed.filter(snapshotNodeHasID).map((node) => node.id!))
  const deleted = current
    .filter((node) => snapshotNodeHasID(node) && !proposedIds.has(node.id!))
    .map(markDeleted)
  return deleted.length > 0 ? [...proposed, ...deleted] : proposed
}

function upsertSegmentNode(segments: ProposalSegmentNode[], segment: ProposalSegmentNode) {
  const nextSegment = {
    ...stripProposalInternalFields(segment),
    scene_moments: snapshotNodeHasID(segment)
      ? segments.find((item) => item.id === segment.id)?.scene_moments ?? []
      : [],
  }
  if (!snapshotNodeHasID(segment)) {
    segments.push(nextSegment)
    return nextSegment
  }
  const index = segments.findIndex((item) => item.id === segment.id)
  if (index >= 0) {
    segments[index] = nextSegment
    return segments[index]
  }
  segments.push(nextSegment)
  return nextSegment
}

function upsertMomentNode(segment: ProposalSegmentNode, moment: ProposalSceneMomentNode) {
  const moments = segment.scene_moments ?? []
  segment.scene_moments = moments
  const existing = snapshotNodeHasID(moment) ? moments.find((item) => item.id === moment.id) : undefined
  const nextMoment = {
    ...stripProposalInternalFields(moment),
    content_units: existing?.content_units ?? [],
    keyframes: existing?.keyframes ?? [],
    creative_references: existing?.creative_references ?? [],
    asset_slots: existing?.asset_slots ?? [],
  }
  if (snapshotNodeHasID(nextMoment)) {
    const index = moments.findIndex((item) => item.id === nextMoment.id)
    if (index >= 0) {
      const next = [...moments]
      next[index] = nextMoment
      segment.scene_moments = next
      return next[index]
    }
  }
  segment.scene_moments = [...moments, nextMoment]
  return nextMoment
}

function upsertContentUnitNode(moment: ProposalSceneMomentNode, unit: ProposalContentUnitNode) {
  const units = moment.content_units ?? []
  moment.content_units = units
  const existing = snapshotNodeHasID(unit) ? units.find((item) => item.id === unit.id) : undefined
  const nextUnit = {
    ...stripProposalInternalFields(unit),
    keyframes: existing?.keyframes ?? [],
  }
  if (snapshotNodeHasID(nextUnit)) {
    const index = units.findIndex((item) => item.id === nextUnit.id)
    if (index >= 0) {
      const next = [...units]
      next[index] = nextUnit
      moment.content_units = next
      return next[index]
    }
  }
  moment.content_units = [...units, nextUnit]
  return nextUnit
}

function upsertNode<T extends { id?: number | null; __delete?: boolean }>(nodes: T[], node: T): T[] {
  const cleaned = stripProposalInternalFields(node) as T
  if (snapshotNodeHasID(cleaned)) {
    const index = nodes.findIndex((item) => item.id === cleaned.id)
    if (index >= 0) {
      const next = [...nodes]
      next[index] = cleaned
      return next
    }
  }
  return [...nodes, cleaned]
}

function removeNodeById<T extends { id?: number | null }>(nodes: T[], id?: number | null): T[] {
  if (!id) return nodes
  return nodes.filter((node) => node.id !== id)
}

function markProposalSegmentDeleted(segment: ProposalSegmentNode): ProposalSegmentNode {
  return {
    ...cloneProposalNode(segment),
    __delete: true,
    scene_moments: (segment.scene_moments ?? []).map(markProposalMomentDeleted),
  }
}

function markProposalMomentDeleted(moment: ProposalSceneMomentNode): ProposalSceneMomentNode {
  return {
    ...cloneProposalNode(moment),
    __delete: true,
    content_units: (moment.content_units ?? []).map(markProposalContentUnitDeleted),
    keyframes: (moment.keyframes ?? []).map(markProposalKeyframeDeleted),
    creative_references: [],
    asset_slots: (moment.asset_slots ?? []).map(markProposalAssetSlotDeleted),
  }
}

function markProposalContentUnitDeleted(unit: ProposalContentUnitNode): ProposalContentUnitNode {
  return {
    ...cloneProposalNode(unit),
    __delete: true,
    keyframes: (unit.keyframes ?? []).map(markProposalKeyframeDeleted),
  }
}

function markProposalKeyframeDeleted(keyframe: ProposalKeyframeNode): ProposalKeyframeNode {
  return { ...cloneProposalNode(keyframe), __delete: true }
}

function markProposalAssetSlotDeleted(slot: ProposalAssetSlotNode): ProposalAssetSlotNode {
  return { ...cloneProposalNode(slot), __delete: true }
}

function proposalBeforeText(before: Record<string, unknown> | undefined, keys: string[]) {
  if (!before) return ''
  return compactParts(keys.map((key) => before[key]))
}

function compactParts(values: unknown[]) {
  const text = values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' · ')
  return text.length > 120 ? `${text.slice(0, 120)}...` : text
}

function stateSummary(state?: Record<string, unknown>) {
  if (!state) return ''
  return Object.entries(state)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('，')
}

function containsProposalActionField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProposalActionField)
  if (!isRecordValue(value)) return false
  if (Object.prototype.hasOwnProperty.call(value, 'action')) return true
  return Object.values(value).some(containsProposalActionField)
}

function numericDraftField(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function stringDraftField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
