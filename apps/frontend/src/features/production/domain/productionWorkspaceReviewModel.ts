import type { WorkspaceArtifact } from '@/shared/infrastructure/providerSessionClient'
import { PRODUCTION_WORKSPACE_WORKSPACE_SCHEMA } from '@/features/production/domain/productionWorkspaceWorkspace'
import type {
  ProductionWorkspacePreviewSemanticChange,
  ProductionWorkspacePreviewWarning,
} from '@/shared/infrastructure/api/semanticEntities'
import type {
  ProductionWorkspaceApplyGate as WorkspaceApplyGate,
  ProductionWorkspaceApplyPreview as WorkspaceApplyPreview,
  ProductionWorkspaceApplyPreviewItem as WorkspaceApplyPreviewItem,
  ProductionWorkspaceContextResources as WorkspaceContextResources,
  ProductionWorkspaceNodeDecision,
  ProductionWorkspaceNodeDecisions,
  ProductionWorkspaceSemanticDiffGroup as WorkspaceSemanticDiffGroup,
  ProductionWorkspaceSemanticDiffItem as WorkspaceSemanticDiffItem,
  ProductionWorkspaceSnapshotAction as WorkspaceSnapshotAction,
} from '@/features/production/domain/productionWorkspaceReviewTypes'

export type WorkspaceNodeDecision = ProductionWorkspaceNodeDecision
export type WorkspaceNodeDecisions = ProductionWorkspaceNodeDecisions

export interface WorkspaceContentUnitNode {
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
  script_block_id?: number | null
  before?: Record<string, unknown>
  keyframes?: WorkspaceKeyframeNode[]
  __delete?: boolean
}

export interface WorkspaceKeyframeNode {
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

export interface WorkspaceWritingExpressionNode {
  id?: number
  client_id?: string
  kind?: 'dialogue' | 'action' | 'narration' | 'subtitle' | 'visual' | string
  speaker?: string
  text?: string
  note?: string
  intent?: string
  order?: number
  script_block_id?: number | null
  before?: Record<string, unknown>
  __delete?: boolean
}

export interface WorkspaceCreativeRefNode {
  id?: number
  client_id?: string
  name?: string
  kind?: string
  role?: string
  source_label?: string
  state?: Record<string, unknown>
  __delete?: boolean
}

export interface WorkspaceAssetSlotNode {
  id?: number
  client_id?: string
  name?: string
  kind?: string
  description?: string
  priority?: string
  source_label?: string
  __delete?: boolean
}

export interface WorkspaceSceneMomentNode {
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
  script_block_id?: number | null
  content_units?: WorkspaceContentUnitNode[]
  creative_references?: WorkspaceCreativeRefNode[]
  asset_slots?: WorkspaceAssetSlotNode[]
  keyframes?: WorkspaceKeyframeNode[]
  writing_expressions?: WorkspaceWritingExpressionNode[]
  rationale?: string
  before?: Record<string, unknown>
  __delete?: boolean
}

export interface WorkspaceSegmentNode {
  id?: number
  client_id?: string
  title?: string
  kind?: string
  summary?: string
  order?: number
  status?: string
  script_block_id?: number | null
  scene_moments?: WorkspaceSceneMomentNode[]
  rationale?: string
  before?: Record<string, unknown>
  __delete?: boolean
}

export interface ProductionWorkspaceArtifactContent {
  mode?: 'snapshot'
  productionId: number
  workspaceScope?: string
  summary?: string
  workspace: { segments: WorkspaceSegmentNode[] }
  proposedAt?: string
  workspaceId?: string
  workspaceTitle?: string
  workspaceUpdatedAt?: string
}

/** @deprecated Use ProductionWorkspaceArtifactContent. */
export type WorkspaceWorkspaceContent = ProductionWorkspaceArtifactContent

export interface ApplyProductionWorkspaceCounts {
  segments_created: number
  scene_moments_created: number
  content_units_created: number
  asset_slots_created: number
  keyframes_created: number
  creative_references_created: number
  creative_reference_usages: number
  writing_expressions_created: number
}

export interface WorkspaceSimulationResult {
  acceptedNodes: number
  rejectedNodes: number
  unresolvedNodes: number
  counts: ApplyProductionWorkspaceCounts
  actions: { create: number; update: number; delete: number }
  preview: WorkspaceApplyPreview
  backendPreview?: {
    dryRun: boolean
    counts: ApplyProductionWorkspaceCounts
    returned: {
      segments: number
      sceneMoments: number
      creativeReferences: number
      assetSlots: number
      contentUnits: number
      keyframes: number
      writingExpressions: number
    }
    semanticChanges: ProductionWorkspacePreviewSemanticChange[]
    warnings: ProductionWorkspacePreviewWarning[]
  }
}

export interface WorkspaceReviewNode {
  key: string
  action: WorkspaceSnapshotAction
  kind: 'segment' | 'scene_moment' | 'content_unit' | 'keyframe' | 'creative_reference' | 'asset_slot' | 'writing_expression'
}

export interface ProductionWorkspaceSnapshotRecord {
  ID: number
  [key: string]: unknown
}

export interface BuildCurrentProductionWorkspaceSnapshotInput {
  segments: ProductionWorkspaceSnapshotRecord[]
  sceneMoments: ProductionWorkspaceSnapshotRecord[]
  creativeReferences: ProductionWorkspaceSnapshotRecord[]
  creativeReferenceUsages: ProductionWorkspaceSnapshotRecord[]
  contentUnits: ProductionWorkspaceSnapshotRecord[]
  keyframes: ProductionWorkspaceSnapshotRecord[]
  assetSlots: ProductionWorkspaceSnapshotRecord[]
  writingExpressions: ProductionWorkspaceSnapshotRecord[]
}

export function parseProductionWorkspaceArtifact(workspace: WorkspaceArtifact): ProductionWorkspaceArtifactContent | null {
  try {
    const content = JSON.parse(workspace.content) as Record<string, unknown>
    if (content.schema !== PRODUCTION_WORKSPACE_WORKSPACE_SCHEMA) return null
    const workspacePayload = isRecordValue(content.workspace) ? content.workspace : {}
    if (content.mode !== 'snapshot' || containsWorkspaceActionField(workspacePayload)) return null
    const rawSegments = Array.isArray(workspacePayload.segments)
      ? workspacePayload.segments
      : Array.isArray(content.segments)
        ? content.segments
        : []
    const productionId = numericWorkspaceField(content.productionId)
      ?? numericWorkspaceField(content.production_id)
      ?? numericWorkspaceField(isRecordValue(workspacePayload.target) ? workspacePayload.target.entityId : undefined)
      ?? numericWorkspaceField(isRecordValue(workspacePayload.target) ? workspacePayload.target.productionId : undefined)
      ?? numericWorkspaceField(isRecordValue(workspacePayload.metadata) ? workspacePayload.metadata.productionId : undefined)
      ?? 0

    return {
      mode: 'snapshot',
      productionId,
      workspaceScope: stringWorkspaceField(content.workspace_scope) || stringWorkspaceField(content.workspaceScope),
      summary: stringWorkspaceField(content.summary),
      workspace: {
        segments: rawSegments.filter(isRecordValue) as unknown as WorkspaceSegmentNode[],
      },
      proposedAt: stringWorkspaceField(content.proposedAt) || stringWorkspaceField(content.createdAt) || workspace.createdAt,
      workspaceId: workspace.id,
      workspaceTitle: workspace.title,
      workspaceUpdatedAt: workspace.updatedAt,
    }
  } catch {
    return null
  }
}

/** @deprecated Use parseProductionWorkspaceArtifact. */
export const parseProductionWorkspaceWorkspace = parseProductionWorkspaceArtifact

export function buildCurrentProductionWorkspaceSnapshot(input: BuildCurrentProductionWorkspaceSnapshotInput): { segments: WorkspaceSegmentNode[] } {
  const creativeReferenceById = new Map(input.creativeReferences.map((reference) => [reference.ID, reference]))
  const referencesBySceneMoment = new Map<number, WorkspaceCreativeRefNode[]>()
  const expressionsBySceneMoment = new Map<number, ProductionWorkspaceSnapshotRecord[]>()

  for (const usage of input.creativeReferenceUsages) {
    if (String(usage.owner_type ?? '') !== 'scene_moment') continue
    const ownerId = positiveRecordNumber(usage.owner_id)
    const referenceId = positiveRecordNumber(usage.creative_reference_id)
    if (!ownerId || !referenceId) continue
    const reference = creativeReferenceById.get(referenceId)
    pushSnapshotGroupedRecord(referencesBySceneMoment, ownerId, {
      id: referenceId,
      name: reference ? stringRecordValue(reference.name) || workspaceSnapshotTitleOfRecord(reference) : undefined,
      kind: reference ? stringRecordValue(reference.kind) : undefined,
      role: stringRecordValue(usage.role),
      source_label: '当前项目',
    })
  }

  for (const expression of input.writingExpressions) {
    const sceneMomentId = positiveRecordNumber(expression.scene_moment_id)
    if (!sceneMomentId) continue
    pushSnapshotGroupedRecord(expressionsBySceneMoment, sceneMomentId, expression)
  }

  return {
    segments: input.segments.map((segment) => {
      const moments = input.sceneMoments
        .filter((moment) => Number(moment.segment_id) === segment.ID)
        .sort(workspaceSnapshotByOrder)
        .map((moment) => {
          return {
            id: moment.ID,
            client_id: stringRecordValue(moment.client_id),
            title: stringRecordValue(moment.title) || workspaceSnapshotTitleOfRecord(moment),
            scene_code: stringRecordValue(moment.scene_code),
            time_text: stringRecordValue(moment.time_text),
            location_text: stringRecordValue(moment.location_text),
            action_text: stringRecordValue(moment.action_text),
            mood: stringRecordValue(moment.mood),
            description: stringRecordValue(moment.description),
            order: positiveRecordNumber(moment.order),
            status: stringRecordValue(moment.status),
            script_block_id: positiveRecordNumber(moment.script_block_id),
            creative_references: (referencesBySceneMoment.get(moment.ID) ?? []).slice(),
            writing_expressions: (expressionsBySceneMoment.get(moment.ID) ?? []).slice().sort(workspaceSnapshotByOrder).map(workspaceWritingExpressionFromRecord),
          } satisfies WorkspaceSceneMomentNode
        })
      return {
        id: segment.ID,
        client_id: stringRecordValue(segment.client_id),
        title: stringRecordValue(segment.title) || workspaceSnapshotTitleOfRecord(segment),
        kind: stringRecordValue(segment.kind),
        summary: stringRecordValue(segment.summary ?? segment.content),
        order: positiveRecordNumber(segment.order),
        status: stringRecordValue(segment.status),
        script_block_id: positiveRecordNumber(segment.script_block_id),
        scene_moments: moments,
      } satisfies WorkspaceSegmentNode
    }),
  }
  function workspaceWritingExpressionFromRecord(expression: ProductionWorkspaceSnapshotRecord): WorkspaceWritingExpressionNode {
    return {
      id: expression.ID,
      client_id: stringRecordValue(expression.client_id),
      kind: stringRecordValue(expression.kind),
      speaker: stringRecordValue(expression.speaker),
      text: stringRecordValue(expression.text),
      note: stringRecordValue(expression.note),
      intent: stringRecordValue(expression.intent),
      order: positiveRecordNumber(expression.order),
      script_block_id: positiveRecordNumber(expression.script_block_id) ?? null,
    }
  }
}

export function workspaceNodeIdentity(node: { client_id?: string; id?: number }, fallback: string) {
  return node.client_id ?? (node.id ? String(node.id) : fallback)
}

export function workspaceNodeDecisionKey(type: string, node: { client_id?: string; id?: number }, fallback: string) {
  return nodeDecisionKey(type, workspaceNodeIdentity(node, fallback))
}

export function collectWorkspaceReviewNodes(segments: WorkspaceSegmentNode[]): WorkspaceReviewNode[] {
  return segments.flatMap((segment, index) => collectSegmentWorkspaceReviewNodes(segment, index))
}

export function collectWorkspaceContextResources(segments: WorkspaceSegmentNode[]): WorkspaceContextResources {
  const context: WorkspaceContextResources = {
    creativeReferences: [],
    assetSlots: [],
  }

  segments.forEach((segment, segmentIndex) => {
    const segmentId = workspaceNodeIdentity(segment, String(segmentIndex))
    const segmentTitle = segment.title || `编排段 ${segmentIndex + 1}`
    ;(segment.scene_moments ?? []).forEach((moment, momentIndex) => {
      const momentFallback = `${segmentId}-${momentIndex}`
      const momentTitle = moment.title || `情节 ${momentIndex + 1}`
      const parent = `${segmentTitle} / ${momentTitle}`

      ;(moment.creative_references ?? []).forEach((reference, referenceIndex) => {
        context.creativeReferences.push({
          nodeKey: workspaceNodeDecisionKey('creative_reference', reference, `${momentFallback}-reference-${referenceIndex}`),
          action: workspaceSnapshotAction(reference),
          title: reference.name || '未命名设定资料',
          detail: compactParts([reference.kind, reference.role, reference.source_label, stateSummary(reference.state)]),
          parent,
        })
      })

      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        context.assetSlots.push({
          nodeKey: workspaceNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`),
          action: workspaceSnapshotAction(slot),
          title: slot.name || '未命名素材需求',
          detail: compactParts([slot.kind, slot.priority, slot.source_label, slot.description]),
          parent,
        })
      })
    })
  })

  return context
}

export function buildWorkspaceSemanticDiff(segments: WorkspaceSegmentNode[]): WorkspaceSemanticDiffGroup[] {
  return segments.map((segment, segmentIndex) => {
    const segmentId = workspaceNodeIdentity(segment, String(segmentIndex))
    const segmentKey = workspaceNodeDecisionKey('segment', segment, String(segmentIndex))
    const moments = segment.scene_moments ?? []
    const children: WorkspaceSemanticDiffItem[] = []

    moments.forEach((moment, momentIndex) => {
      const momentFallback = `${segmentId}-${momentIndex}`
      const momentKey = workspaceNodeDecisionKey('scene_moment', moment, momentFallback)
      children.push({
        key: momentKey,
        acceptKeys: [segmentKey, momentKey],
        title: moment.title || `情节 ${momentIndex + 1}`,
        detail: compactParts([moment.time_text, moment.location_text, moment.mood, moment.rationale]),
        action: workspaceSnapshotAction(moment),
        kind: 'structure',
        before: workspaceBeforeText(moment.before, ['action_text', 'description', 'title']),
        after: compactParts([moment.action_text, moment.description]),
      })
      ;(moment.writing_expressions ?? []).forEach((expression, expressionIndex) => {
        const expressionKey = workspaceNodeDecisionKey('writing_expression', expression, `${momentFallback}-expression-${expressionIndex}`)
        children.push({
          key: expressionKey,
          acceptKeys: [segmentKey, momentKey, expressionKey],
          title: expression.text || `表达条目 ${expressionIndex + 1}`,
          detail: compactParts([expression.kind, expression.speaker, expression.intent, expression.note]),
          action: workspaceSnapshotAction(expression),
          kind: 'content',
          before: workspaceBeforeText(expression.before, ['kind', 'speaker', 'text', 'intent', 'note']),
          after: compactParts([expression.text, expression.intent, expression.note]),
        })
      })
      ;(moment.content_units ?? []).forEach((unit, unitIndex) => {
        const unitFallback = `${momentFallback}-content-${unitIndex}`
        const unitKey = workspaceNodeDecisionKey('content_unit', unit, unitFallback)
        children.push({
          key: unitKey,
          acceptKeys: [segmentKey, momentKey, unitKey],
          title: unit.title || `制作项 ${unitIndex + 1}`,
          detail: compactParts([unit.kind, unit.shot_size, unit.camera_angle, unit.duration_sec ? `${unit.duration_sec}s` : '', unit.description]),
          action: workspaceSnapshotAction(unit),
          kind: 'content',
          before: workspaceBeforeText(unit.before, ['description', 'title']),
          after: compactParts([unit.description]),
        })
        ;(unit.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
          const keyframeKey = workspaceNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`)
          children.push({
            key: keyframeKey,
            acceptKeys: [segmentKey, momentKey, unitKey, keyframeKey],
            title: keyframe.title || `镜头关键帧 ${keyframeIndex + 1}`,
            detail: compactParts([keyframe.description, keyframe.prompt]),
            action: workspaceSnapshotAction(keyframe),
            kind: 'content',
            before: workspaceBeforeText(keyframe.before, ['description', 'prompt', 'title']),
            after: compactParts([keyframe.description, keyframe.prompt]),
          })
        })
      })
      ;(moment.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
        const keyframeKey = workspaceNodeDecisionKey('keyframe', keyframe, `${momentFallback}-keyframe-${keyframeIndex}`)
        children.push({
          key: keyframeKey,
          acceptKeys: [segmentKey, momentKey, keyframeKey],
          title: keyframe.title || `情节预览画面 ${keyframeIndex + 1}`,
          detail: compactParts([keyframe.description, keyframe.prompt]),
          action: workspaceSnapshotAction(keyframe),
          kind: 'content',
          before: workspaceBeforeText(keyframe.before, ['description', 'prompt', 'title']),
          after: compactParts([keyframe.description, keyframe.prompt]),
        })
      })
      ;(moment.creative_references ?? []).forEach((reference, referenceIndex) => {
        const referenceKey = workspaceNodeDecisionKey('creative_reference', reference, `${momentFallback}-reference-${referenceIndex}`)
        children.push({
          key: referenceKey,
          acceptKeys: [segmentKey, momentKey, referenceKey],
          title: reference.name || '设定资料',
          detail: compactParts([reference.kind, reference.role, reference.source_label, stateSummary(reference.state)]),
          action: workspaceSnapshotAction(reference),
          kind: 'reference',
        })
      })
      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        const slotKey = workspaceNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`)
        children.push({
          key: slotKey,
          acceptKeys: [segmentKey, momentKey, slotKey],
          title: slot.name || '素材需求',
          detail: compactParts([slot.kind, slot.priority, slot.source_label, slot.description]),
          action: workspaceSnapshotAction(slot),
          kind: 'asset',
        })
      })
    })

    return {
      key: segmentKey,
      title: segment.title || `编排段 ${segmentIndex + 1}`,
      detail: compactParts([segment.kind, segment.summary, segment.rationale]),
      action: workspaceSnapshotAction(segment),
      kind: 'structure',
      acceptKeys: [segmentKey],
      nodeKeys: [segmentKey, ...children.map((item) => item.key)],
      stats: [
        `${moments.length} 情节`,
        `${children.filter((item) => item.kind === 'content').length} 表达`,
        `${children.filter((item) => item.kind === 'reference').length} 设定引用`,
        `${children.filter((item) => item.kind === 'asset').length} 素材需求`,
      ],
      children,
    }
  })
}

export function buildWorkspaceApplyPreview(segments: WorkspaceSegmentNode[], decisions: WorkspaceNodeDecisions): WorkspaceApplyPreview {
  const preview: WorkspaceApplyPreview = {
    writeTaskGraph: [],
    rejected: [],
    pending: [],
    blocked: [],
  }

  function pushByDecision(item: WorkspaceApplyPreviewItem, decision: WorkspaceNodeDecision | undefined, blocked = false) {
    if (blocked) {
      preview.blocked.push(item)
    } else if (decision === 'accepted') {
      preview.writeTaskGraph.push(item)
    } else if (decision === 'rejected') {
      preview.rejected.push(item)
    } else {
      preview.pending.push(item)
    }
  }

  segments.forEach((segment, segmentIndex) => {
    const segmentId = workspaceNodeIdentity(segment, String(segmentIndex))
    const segmentKey = workspaceNodeDecisionKey('segment', segment, String(segmentIndex))
    const segmentDecision = decisions[segmentKey]
    const segmentTitle = segment.title || `编排段 ${segmentIndex + 1}`
    pushByDecision({
      key: segmentKey,
      title: segmentTitle,
      detail: compactParts([segment.kind, segment.summary, segment.rationale]),
      kind: 'segment',
      action: workspaceSnapshotAction(segment),
    }, segmentDecision)

    ;(segment.scene_moments ?? []).forEach((moment, momentIndex) => {
      const momentFallback = `${segmentId}-${momentIndex}`
      const momentKey = workspaceNodeDecisionKey('scene_moment', moment, momentFallback)
      const momentDecision = decisions[momentKey]
      const momentTitle = moment.title || `情节 ${momentIndex + 1}`
      const momentBlocked = momentDecision === 'accepted' && segmentDecision !== 'accepted'
      pushByDecision({
        key: momentKey,
        title: momentTitle,
        detail: compactParts([moment.time_text, moment.location_text, moment.mood, moment.action_text, moment.description]),
        kind: 'scene_moment',
        action: workspaceSnapshotAction(moment),
        parent: segmentTitle,
      }, momentDecision, momentBlocked)

      ;(moment.writing_expressions ?? []).forEach((expression, expressionIndex) => {
        const expressionKey = workspaceNodeDecisionKey('writing_expression', expression, `${momentFallback}-expression-${expressionIndex}`)
        const expressionDecision = decisions[expressionKey]
        const expressionBlocked = expressionDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted')
        pushByDecision({
          key: expressionKey,
          title: expression.text || `表达条目 ${expressionIndex + 1}`,
          detail: compactParts([expression.kind, expression.speaker, expression.intent, expression.note]),
          kind: 'writing_expression',
          action: workspaceSnapshotAction(expression),
          parent: `${segmentTitle} / ${momentTitle}`,
        }, expressionDecision, expressionBlocked)
      })

      ;(moment.content_units ?? []).forEach((unit, unitIndex) => {
        const unitFallback = `${momentFallback}-content-${unitIndex}`
        const unitKey = workspaceNodeDecisionKey('content_unit', unit, unitFallback)
        const unitDecision = decisions[unitKey]
        const unitTitle = unit.title || `制作项 ${unitIndex + 1}`
        const unitBlocked = unitDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted')
        pushByDecision({
          key: unitKey,
          title: unitTitle,
          detail: compactParts([unit.kind, unit.shot_size, unit.camera_angle, unit.duration_sec ? `${unit.duration_sec}s` : '', unit.description]),
          kind: 'content_unit',
          action: workspaceSnapshotAction(unit),
          parent: `${segmentTitle} / ${momentTitle}`,
        }, unitDecision, unitBlocked)

        ;(unit.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
          const keyframeKey = workspaceNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`)
          const keyframeDecision = decisions[keyframeKey]
          const keyframeBlocked = keyframeDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted' || unitDecision !== 'accepted')
          pushByDecision({
            key: keyframeKey,
            title: keyframe.title || `镜头关键帧 ${keyframeIndex + 1}`,
            detail: compactParts([keyframe.description, keyframe.prompt]),
            kind: 'keyframe',
            action: workspaceSnapshotAction(keyframe),
            parent: `${segmentTitle} / ${momentTitle} / ${unitTitle}`,
          }, keyframeDecision, keyframeBlocked)
        })
      })

      ;(moment.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
        const keyframeKey = workspaceNodeDecisionKey('keyframe', keyframe, `${momentFallback}-keyframe-${keyframeIndex}`)
        const keyframeDecision = decisions[keyframeKey]
        const keyframeBlocked = keyframeDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted')
        pushByDecision({
          key: keyframeKey,
          title: keyframe.title || `情节预览画面 ${keyframeIndex + 1}`,
          detail: compactParts([keyframe.description, keyframe.prompt]),
          kind: 'keyframe',
          action: workspaceSnapshotAction(keyframe),
          parent: `${segmentTitle} / ${momentTitle}`,
        }, keyframeDecision, keyframeBlocked)
      })

      ;(moment.creative_references ?? []).forEach((reference, referenceIndex) => {
        const referenceKey = workspaceNodeDecisionKey('creative_reference', reference, `${momentFallback}-reference-${referenceIndex}`)
        const referenceDecision = decisions[referenceKey]
        const referenceBlocked = referenceDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted' || !snapshotNodeHasID(reference))
        pushByDecision({
          key: referenceKey,
          title: reference.name || '设定资料',
          detail: compactParts([reference.kind, reference.role, reference.source_label, stateSummary(reference.state)]),
          kind: 'creative_reference',
          action: workspaceSnapshotAction(reference),
          parent: `${segmentTitle} / ${momentTitle}`,
        }, referenceDecision, referenceBlocked)
      })

      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        const slotKey = workspaceNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`)
        const slotDecision = decisions[slotKey]
        const slotBlocked = slotDecision === 'accepted' && (segmentDecision !== 'accepted' || momentDecision !== 'accepted')
        pushByDecision({
          key: slotKey,
          title: slot.name || '素材需求',
          detail: compactParts([slot.kind, slot.priority, slot.source_label, slot.description]),
          kind: 'asset_slot',
          action: workspaceSnapshotAction(slot),
          parent: `${segmentTitle} / ${momentTitle}`,
        }, slotDecision, slotBlocked)
      })
    })
  })

  return preview
}

export function buildWorkspaceApplyGate(preview: WorkspaceApplyPreview, backendPreviewReady: boolean): WorkspaceApplyGate {
  if (preview.writeTaskGraph.length === 0) {
    return {
      status: 'empty',
      title: '还没有可写入内容',
      detail: '请先在草案审阅中接受至少一个编排段和它的情节。',
    }
  }
  if (preview.blocked.length > 0) {
    return {
      status: 'blocked',
      title: '存在不能写入的变更',
      detail: '请处理依赖未接受的节点；如果变更是新增或更新设定/素材需求，需要先处理对应上游工作区。',
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

export function countWorkspaceDecisionSummary(segments: WorkspaceSegmentNode[], decisions: WorkspaceNodeDecisions) {
  const nodes = collectWorkspaceReviewNodes(segments)
  const accepted = nodes.filter((node) => decisions[node.key] === 'accepted').length
  const rejected = nodes.filter((node) => decisions[node.key] === 'rejected').length
  return {
    accepted,
    rejected,
    unresolved: Math.max(0, nodes.length - accepted - rejected),
  }
}

export function countWorkspaceActions(segments: WorkspaceSegmentNode[]) {
  const counts = { create: 0, update: 0, delete: 0 }
  function add(node: { id?: number | null; __delete?: boolean }) {
    const action = workspaceSnapshotAction(node)
    if (action === 'delete') counts.delete += 1
    else if (action === 'update') counts.update += 1
    else counts.create += 1
  }
  for (const segment of segments) {
    add(segment)
    for (const moment of segment.scene_moments ?? []) {
      add(moment)
      for (const expression of moment.writing_expressions ?? []) add(expression)
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

export function buildWorkspaceSimulationResult({
  reviewSegments,
  acceptedSegments,
  decisions,
}: {
  reviewSegments: WorkspaceSegmentNode[]
  acceptedSegments: WorkspaceSegmentNode[]
  decisions: WorkspaceNodeDecisions
}): WorkspaceSimulationResult {
  const reviewNodes = collectWorkspaceReviewNodes(reviewSegments)
  const counts: ApplyProductionWorkspaceCounts = {
    segments_created: 0,
    scene_moments_created: 0,
    content_units_created: 0,
    asset_slots_created: 0,
    keyframes_created: 0,
    creative_references_created: 0,
    creative_reference_usages: 0,
    writing_expressions_created: 0,
  }
  const actions = { create: 0, update: 0, delete: 0 }
  const addAction = (node: { id?: number | null; __delete?: boolean }) => {
    const action = workspaceSnapshotAction(node)
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
      for (const expression of moment.writing_expressions ?? []) {
        addAction(expression)
        if (!snapshotNodeHasID(expression)) counts.writing_expressions_created += 1
      }
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
    preview: buildWorkspaceApplyPreview(reviewSegments, decisions),
  }
}

export function buildWorkspaceReviewSegments(workspaceSegments: WorkspaceSegmentNode[], currentSnapshot: { segments: WorkspaceSegmentNode[] }): WorkspaceSegmentNode[] {
  const next = cloneWorkspaceSegments(workspaceSegments)
  const currentById = new Map(currentSnapshot.segments.filter((segment) => snapshotNodeHasID(segment)).map((segment) => [segment.id!, segment]))
  const proposedIds = new Set(next.filter((segment) => snapshotNodeHasID(segment)).map((segment) => segment.id!))

  for (const segment of next) {
    if (!snapshotNodeHasID(segment)) continue
    const current = currentById.get(segment.id!)
    if (current) appendDeletedChildren(segment, current)
  }
  for (const current of currentSnapshot.segments) {
    if (!snapshotNodeHasID(current) || proposedIds.has(current.id!)) continue
    next.push(markWorkspaceSegmentDeleted(current))
  }
  return next.flatMap((segment) => {
    const current = snapshotNodeHasID(segment) ? currentById.get(segment.id!) : undefined
    const pruned = pruneUnchangedWorkspaceSegment(segment, current)
    return pruned ? [pruned] : []
  })
}

export function buildMergedProductionWorkspace(
  currentSnapshot: { segments: WorkspaceSegmentNode[] },
  reviewSegments: WorkspaceSegmentNode[],
  decisions: WorkspaceNodeDecisions,
): { segments: WorkspaceSegmentNode[] } {
  const next = cloneWorkspaceSegments(currentSnapshot.segments)
  reviewSegments.forEach((segment, segmentIndex) => {
    const segmentKey = workspaceNodeDecisionKey('segment', segment, String(segmentIndex))
    if (decisions[segmentKey] !== 'accepted') return
    const segmentId = workspaceNodeIdentity(segment, String(segmentIndex))
    if (segment.__delete) {
      removeNodeById(next, segment.id)
      return
    }
    const targetSegment = upsertSegmentNode(next, segment)
    ;(segment.scene_moments ?? []).forEach((moment, momentIndex) => {
      const momentFallback = `${segmentId}-${momentIndex}`
      const momentKey = workspaceNodeDecisionKey('scene_moment', moment, momentFallback)
      if (decisions[momentKey] !== 'accepted') return
      if (moment.__delete) {
        targetSegment.scene_moments = removeNodeById(targetSegment.scene_moments ?? [], moment.id)
        return
      }
      const targetMoment = upsertMomentNode(targetSegment, moment)
      ;(moment.writing_expressions ?? []).forEach((expression, expressionIndex) => {
        const expressionKey = workspaceNodeDecisionKey('writing_expression', expression, `${momentFallback}-expression-${expressionIndex}`)
        if (decisions[expressionKey] !== 'accepted') return
        if (expression.__delete) {
          targetMoment.writing_expressions = removeNodeById(targetMoment.writing_expressions ?? [], expression.id)
          return
        }
        targetMoment.writing_expressions = upsertNode(targetMoment.writing_expressions ?? [], expression)
      })
      ;(moment.content_units ?? []).forEach((unit, unitIndex) => {
        const unitFallback = `${momentFallback}-content-${unitIndex}`
        const unitKey = workspaceNodeDecisionKey('content_unit', unit, unitFallback)
        if (decisions[unitKey] !== 'accepted') return
        if (unit.__delete) {
          targetMoment.content_units = removeNodeById(targetMoment.content_units ?? [], unit.id)
          return
        }
        const targetUnit = upsertContentUnitNode(targetMoment, unit)
        ;(unit.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
          const keyframeKey = workspaceNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`)
          if (decisions[keyframeKey] !== 'accepted') return
          if (keyframe.__delete) {
            targetUnit.keyframes = removeNodeById(targetUnit.keyframes ?? [], keyframe.id)
            return
          }
          targetUnit.keyframes = upsertNode(targetUnit.keyframes ?? [], keyframe)
        })
      })
      ;(moment.keyframes ?? []).forEach((keyframe, keyframeIndex) => {
        const keyframeKey = workspaceNodeDecisionKey('keyframe', keyframe, `${momentFallback}-keyframe-${keyframeIndex}`)
        if (decisions[keyframeKey] !== 'accepted') return
        if (keyframe.__delete) {
          targetMoment.keyframes = removeNodeById(targetMoment.keyframes ?? [], keyframe.id)
          return
        }
        targetMoment.keyframes = upsertNode(targetMoment.keyframes ?? [], keyframe)
      })
      ;(moment.creative_references ?? []).forEach((reference, referenceIndex) => {
        const referenceKey = workspaceNodeDecisionKey('creative_reference', reference, `${momentFallback}-reference-${referenceIndex}`)
        if (decisions[referenceKey] !== 'accepted') return
        if (reference.__delete) {
          targetMoment.creative_references = removeNodeById(targetMoment.creative_references ?? [], reference.id)
          return
        }
        targetMoment.creative_references = upsertNode(targetMoment.creative_references ?? [], reference)
      })
      ;(moment.asset_slots ?? []).forEach((slot, slotIndex) => {
        const slotKey = workspaceNodeDecisionKey('asset_slot', slot, `${momentFallback}-asset-${slotIndex}`)
        if (decisions[slotKey] !== 'accepted') return
        if (slot.__delete) {
          targetMoment.asset_slots = removeNodeById(targetMoment.asset_slots ?? [], slot.id)
          return
        }
        targetMoment.asset_slots = upsertNode(targetMoment.asset_slots ?? [], slot)
      })
    })
  })
  return { segments: next.map(stripWorkspaceInternalFields) }
}

export function workspaceDecisionSnapshotKey(nodes: WorkspaceReviewNode[], decisions: WorkspaceNodeDecisions) {
  return nodes
    .map((node) => `${node.key}=${decisions[node.key] ?? 'pending'}`)
    .join('|')
}

export function findProductionWorkspaceSnapshotIssue(workspace: { segments: WorkspaceSegmentNode[] }): { label: string } | null {
  for (const segment of workspace.segments) {
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

export function workspaceSnapshotAction(node: { id?: number | null; __delete?: boolean }): WorkspaceSnapshotAction {
  if (node.__delete) return 'delete'
  return snapshotNodeHasID(node) ? 'update' : 'create'
}

export function stripWorkspaceInternalFields<T>(node: T): T {
  if (Array.isArray(node)) return node.map(stripWorkspaceInternalFields) as T
  if (!isRecordValue(node)) return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === '__delete') continue
    out[key] = stripWorkspaceInternalFields(value)
  }
  return out as T
}

export function cloneWorkspaceSegments(segments: WorkspaceSegmentNode[]) {
  return segments.map((segment) => cloneWorkspaceNode(segment))
}

export function cloneWorkspaceNode<T>(node: T): T {
  return stripWorkspaceInternalFields(JSON.parse(JSON.stringify(node))) as T
}

function workspaceSnapshotByOrder(a: ProductionWorkspaceSnapshotRecord, b: ProductionWorkspaceSnapshotRecord) {
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

function workspaceSnapshotTitleOfRecord(record: ProductionWorkspaceSnapshotRecord | null | undefined) {
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

function collectSegmentWorkspaceReviewNodes(segment: WorkspaceSegmentNode, index: number): WorkspaceReviewNode[] {
  const segmentId = workspaceNodeIdentity(segment, String(index))
  return [
    { key: workspaceNodeDecisionKey('segment', segment, String(index)), action: workspaceSnapshotAction(segment), kind: 'segment' },
    ...(segment.scene_moments ?? []).flatMap((moment, momentIndex) =>
      collectSceneWorkspaceReviewNodes(moment, `${segmentId}-${momentIndex}`),
    ),
  ]
}

function collectSceneWorkspaceReviewNodes(moment: WorkspaceSceneMomentNode, fallback: string): WorkspaceReviewNode[] {
  return [
    { key: workspaceNodeDecisionKey('scene_moment', moment, fallback), action: workspaceSnapshotAction(moment), kind: 'scene_moment' },
    ...(moment.writing_expressions ?? []).map((expression, index) => ({
      key: workspaceNodeDecisionKey('writing_expression', expression, `${fallback}-expression-${index}`),
      action: workspaceSnapshotAction(expression),
      kind: 'writing_expression' as const,
    })),
    ...(moment.content_units ?? []).flatMap((unit, index) => {
      const unitFallback = `${fallback}-content-${index}`
      return [
        {
          key: workspaceNodeDecisionKey('content_unit', unit, unitFallback),
          action: workspaceSnapshotAction(unit),
          kind: 'content_unit' as const,
        },
        ...(unit.keyframes ?? []).map((keyframe, keyframeIndex) => ({
          key: workspaceNodeDecisionKey('keyframe', keyframe, `${unitFallback}-keyframe-${keyframeIndex}`),
          action: workspaceSnapshotAction(keyframe),
          kind: 'keyframe' as const,
        })),
      ]
    }),
    ...(moment.keyframes ?? []).map((keyframe, index) => ({
      key: workspaceNodeDecisionKey('keyframe', keyframe, `${fallback}-keyframe-${index}`),
      action: workspaceSnapshotAction(keyframe),
      kind: 'keyframe' as const,
    })),
    ...(moment.creative_references ?? []).map((reference, index) => ({
      key: workspaceNodeDecisionKey('creative_reference', reference, `${fallback}-reference-${index}`),
      action: workspaceSnapshotAction(reference),
      kind: 'creative_reference' as const,
    })),
    ...(moment.asset_slots ?? []).map((slot, index) => ({
      key: workspaceNodeDecisionKey('asset_slot', slot, `${fallback}-asset-${index}`),
      action: workspaceSnapshotAction(slot),
      kind: 'asset_slot' as const,
    })),
  ]
}

function appendDeletedChildren(proposed: WorkspaceSegmentNode, current: WorkspaceSegmentNode) {
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
    .map(markWorkspaceMomentDeleted)
  if (deletedMoments.length > 0) proposed.scene_moments = [...proposedMoments, ...deletedMoments]
}

function pruneUnchangedWorkspaceSegment(proposed: WorkspaceSegmentNode, current?: WorkspaceSegmentNode): WorkspaceSegmentNode | null {
  if (!snapshotNodeHasID(proposed) || proposed.__delete || !current) return proposed
  const prunedMoments = (proposed.scene_moments ?? []).flatMap((moment) => {
    const currentMoment = snapshotNodeHasID(moment)
      ? (current.scene_moments ?? []).find((item) => item.id === moment.id)
      : undefined
    const pruned = pruneUnchangedWorkspaceMoment(moment, currentMoment)
    return pruned ? [pruned] : []
  })
  if (!workspaceOwnFieldsEqual(proposed, current, ['scene_moments']) || prunedMoments.length > 0) {
    return { ...proposed, scene_moments: prunedMoments }
  }
  return null
}

function pruneUnchangedWorkspaceMoment(proposed: WorkspaceSceneMomentNode, current?: WorkspaceSceneMomentNode): WorkspaceSceneMomentNode | null {
  if (!snapshotNodeHasID(proposed) || proposed.__delete || !current) return proposed
  const prunedContentUnits = (proposed.content_units ?? []).flatMap((unit) => {
    const currentUnit = snapshotNodeHasID(unit)
      ? (current.content_units ?? []).find((item) => item.id === unit.id)
      : undefined
    const pruned = pruneUnchangedWorkspaceContentUnit(unit, currentUnit)
    return pruned ? [pruned] : []
  })
  const prunedKeyframes = pruneUnchangedWorkspaceNodes(proposed.keyframes ?? [], current.keyframes ?? [], ['keyframes'])
  const prunedCreativeReferences = pruneUnchangedWorkspaceNodes(proposed.creative_references ?? [], current.creative_references ?? [], ['creative_references'])
  const prunedAssetSlots = pruneUnchangedWorkspaceNodes(proposed.asset_slots ?? [], current.asset_slots ?? [], ['asset_slots'])
  const prunedWritingExpressions = pruneUnchangedWorkspaceNodes(proposed.writing_expressions ?? [], current.writing_expressions ?? [], ['writing_expressions'])
  const hasOwnChange = !workspaceOwnFieldsEqual(proposed, current, ['content_units', 'creative_references', 'asset_slots', 'keyframes', 'writing_expressions'])
  const hasChildChanges = prunedContentUnits.length > 0 || prunedKeyframes.length > 0 || prunedCreativeReferences.length > 0 || prunedAssetSlots.length > 0 || prunedWritingExpressions.length > 0
  if (!hasOwnChange && !hasChildChanges) return null
  return {
    ...proposed,
    content_units: prunedContentUnits,
    keyframes: prunedKeyframes,
    creative_references: prunedCreativeReferences,
    asset_slots: prunedAssetSlots,
    writing_expressions: prunedWritingExpressions,
  }
}

function pruneUnchangedWorkspaceContentUnit(proposed: WorkspaceContentUnitNode, current?: WorkspaceContentUnitNode): WorkspaceContentUnitNode | null {
  if (!snapshotNodeHasID(proposed) || proposed.__delete || !current) return proposed
  const prunedKeyframes = pruneUnchangedWorkspaceNodes(proposed.keyframes ?? [], current.keyframes ?? [], ['keyframes'])
  if (!workspaceOwnFieldsEqual(proposed, current, ['keyframes']) || prunedKeyframes.length > 0) {
    return { ...proposed, keyframes: prunedKeyframes }
  }
  return null
}

function pruneUnchangedWorkspaceNodes<T extends { id?: number; __delete?: boolean }>(proposed: T[], current: T[], childKeys: string[]): T[] {
  return proposed.flatMap((node) => {
    if (!snapshotNodeHasID(node) || node.__delete) return [node]
    const currentNode = current.find((item) => item.id === node.id)
    if (!currentNode || !workspaceOwnFieldsEqual(node, currentNode, childKeys)) return [node]
    return []
  })
}

function workspaceOwnFieldsEqual(
  left: object,
  right: object,
  childKeys: string[],
) {
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const ignored = new Set(['__delete', 'before', 'rationale', ...childKeys])
  const keys = new Set([
    ...Object.keys(leftRecord).filter((key) => !ignored.has(key)),
    ...Object.keys(rightRecord).filter((key) => !ignored.has(key)),
  ])
  for (const key of keys) {
    if (!workspaceFieldValueEqual(leftRecord[key], rightRecord[key])) return false
  }
  return true
}

function workspaceFieldValueEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (left === undefined && right === undefined) return true
  if ((left === null || left === undefined) && (right === null || right === undefined)) return true
  return JSON.stringify(left) === JSON.stringify(right)
}

function appendDeletedMomentChildren(proposed: WorkspaceSceneMomentNode, current: WorkspaceSceneMomentNode) {
  proposed.content_units = appendDeletedNodes(
    proposed.content_units ?? [],
    current.content_units ?? [],
    markWorkspaceContentUnitDeleted,
  )
  proposed.keyframes = appendDeletedNodes(
    proposed.keyframes ?? [],
    current.keyframes ?? [],
    markWorkspaceKeyframeDeleted,
  )
  proposed.asset_slots = appendDeletedNodes(
    proposed.asset_slots ?? [],
    current.asset_slots ?? [],
    markWorkspaceAssetSlotDeleted,
  )
  proposed.creative_references = appendDeletedNodes(
    proposed.creative_references ?? [],
    current.creative_references ?? [],
    markWorkspaceCreativeReferenceDeleted,
  )
  if (Object.prototype.hasOwnProperty.call(proposed, 'writing_expressions')) {
    proposed.writing_expressions = appendDeletedNodes(
      proposed.writing_expressions ?? [],
      current.writing_expressions ?? [],
      markWorkspaceWritingExpressionDeleted,
    )
  }
  for (const unit of proposed.content_units ?? []) {
    if (!snapshotNodeHasID(unit)) continue
    const currentUnit = (current.content_units ?? []).find((item) => item.id === unit.id)
    if (!currentUnit) continue
    unit.keyframes = appendDeletedNodes(unit.keyframes ?? [], currentUnit.keyframes ?? [], markWorkspaceKeyframeDeleted)
  }
}

function appendDeletedNodes<T extends { id?: number; __delete?: boolean }>(proposed: T[], current: T[], markDeleted: (node: T) => T): T[] {
  const proposedIds = new Set(proposed.filter(snapshotNodeHasID).map((node) => node.id!))
  const deleted = current
    .filter((node) => snapshotNodeHasID(node) && !proposedIds.has(node.id!))
    .map(markDeleted)
  return deleted.length > 0 ? [...proposed, ...deleted] : proposed
}

function upsertSegmentNode(segments: WorkspaceSegmentNode[], segment: WorkspaceSegmentNode) {
  const nextSegment = {
    ...stripWorkspaceInternalFields(segment),
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

function upsertMomentNode(segment: WorkspaceSegmentNode, moment: WorkspaceSceneMomentNode) {
  const moments = segment.scene_moments ?? []
  segment.scene_moments = moments
  const existing = snapshotNodeHasID(moment) ? moments.find((item) => item.id === moment.id) : undefined
  const nextMoment = {
    ...stripWorkspaceInternalFields(moment),
    content_units: existing?.content_units ?? [],
    keyframes: existing?.keyframes ?? [],
    creative_references: existing?.creative_references ?? [],
    asset_slots: existing?.asset_slots ?? [],
    writing_expressions: existing?.writing_expressions ?? [],
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

function upsertContentUnitNode(moment: WorkspaceSceneMomentNode, unit: WorkspaceContentUnitNode) {
  const units = moment.content_units ?? []
  moment.content_units = units
  const existing = snapshotNodeHasID(unit) ? units.find((item) => item.id === unit.id) : undefined
  const nextUnit = {
    ...stripWorkspaceInternalFields(unit),
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
  const cleaned = stripWorkspaceInternalFields(node) as T
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

function markWorkspaceSegmentDeleted(segment: WorkspaceSegmentNode): WorkspaceSegmentNode {
  return {
    ...cloneWorkspaceNode(segment),
    __delete: true,
    scene_moments: (segment.scene_moments ?? []).map(markWorkspaceMomentDeleted),
  }
}

function markWorkspaceMomentDeleted(moment: WorkspaceSceneMomentNode): WorkspaceSceneMomentNode {
  return {
    ...cloneWorkspaceNode(moment),
    __delete: true,
    content_units: (moment.content_units ?? []).map(markWorkspaceContentUnitDeleted),
    keyframes: (moment.keyframes ?? []).map(markWorkspaceKeyframeDeleted),
    creative_references: [],
    asset_slots: (moment.asset_slots ?? []).map(markWorkspaceAssetSlotDeleted),
    writing_expressions: (moment.writing_expressions ?? []).map(markWorkspaceWritingExpressionDeleted),
  }
}

function markWorkspaceContentUnitDeleted(unit: WorkspaceContentUnitNode): WorkspaceContentUnitNode {
  return {
    ...cloneWorkspaceNode(unit),
    __delete: true,
    keyframes: (unit.keyframes ?? []).map(markWorkspaceKeyframeDeleted),
  }
}

function markWorkspaceKeyframeDeleted(keyframe: WorkspaceKeyframeNode): WorkspaceKeyframeNode {
  return { ...cloneWorkspaceNode(keyframe), __delete: true }
}

function markWorkspaceCreativeReferenceDeleted(reference: WorkspaceCreativeRefNode): WorkspaceCreativeRefNode {
  return { ...cloneWorkspaceNode(reference), __delete: true }
}

function markWorkspaceAssetSlotDeleted(slot: WorkspaceAssetSlotNode): WorkspaceAssetSlotNode {
  return { ...cloneWorkspaceNode(slot), __delete: true }
}

function markWorkspaceWritingExpressionDeleted(expression: WorkspaceWritingExpressionNode): WorkspaceWritingExpressionNode {
  return { ...cloneWorkspaceNode(expression), __delete: true }
}

function workspaceBeforeText(before: Record<string, unknown> | undefined, keys: string[]) {
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

function containsWorkspaceActionField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsWorkspaceActionField)
  if (!isRecordValue(value)) return false
  if (Object.prototype.hasOwnProperty.call(value, 'action')) return true
  return Object.values(value).some(containsWorkspaceActionField)
}

function numericWorkspaceField(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function stringWorkspaceField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
