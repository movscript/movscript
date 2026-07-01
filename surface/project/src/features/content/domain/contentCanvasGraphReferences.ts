import type { MovScriptWorkspaceIndexedEntity } from '@movscript/workspace'
import { normalizeRawResourceRef } from '@movscript/resources'
import type {
  ContentCanvasEdge,
  ContentCanvasNode,
  ContentCanvasNodeKind,
  ContentCanvasProjectData,
} from './contentCanvasTypes'

const PROMPT_ENTITY_REFERENCE_PATTERN = /\{\{\s*([a-zA-Z_]+)(?:::|:)\s*([^}\s]+)(?:\s+[^}]*)?\}\}/gi

export function appendContentCanvasReferenceEdges({
  data,
  edges,
  entityNodes,
  nodeByEntityKindAndKey,
  nodeByPath,
}: {
  data: ContentCanvasProjectData
  edges: ContentCanvasEdge[]
  entityNodes: ContentCanvasNode[]
  nodeByEntityKindAndKey: Map<string, ContentCanvasNode>
  nodeByPath: Map<string, ContentCanvasNode>
}) {
  appendContentUnitReferenceEdges({ data, edges, nodeByEntityKindAndKey, nodeByPath })
  appendExpressionUnitReferenceEdges({ data, edges, nodeByEntityKindAndKey, nodeByPath })
  appendAudioCueReferenceEdges({ data, edges, nodeByEntityKindAndKey, nodeByPath })
  appendSettingStateReferenceEdges({ edges, entityNodes, nodeByEntityKindAndKey, nodeByPath })
}

function appendContentUnitReferenceEdges({
  data,
  edges,
  nodeByEntityKindAndKey,
  nodeByPath,
}: {
  data: ContentCanvasProjectData
  edges: ContentCanvasEdge[]
  nodeByEntityKindAndKey: Map<string, ContentCanvasNode>
  nodeByPath: Map<string, ContentCanvasNode>
}) {
  for (const contentUnit of data.contentUnits) {
    const source = nodeByEntityKindAndKey.get(`content_unit:${entityKey(contentUnit, data.projectId)}`)
    if (!source) continue
    appendSingleContentUnitReferences({ contentUnit, edges, nodeByEntityKindAndKey, nodeByPath, source })
  }
}

function appendSingleContentUnitReferences({
  contentUnit,
  edges,
  nodeByEntityKindAndKey,
  nodeByPath,
  source,
}: {
  contentUnit: MovScriptWorkspaceIndexedEntity
  edges: ContentCanvasEdge[]
  nodeByEntityKindAndKey: Map<string, ContentCanvasNode>
  nodeByPath: Map<string, ContentCanvasNode>
  source: ContentCanvasNode
}) {
  appendContentUnitReferenceSet({
    refs: compactUniqueStrings(
      contentUnit.record.scene_moment_ref,
      contentUnit.record.scene_moment_refs,
      contentUnitGenerationEntityRefsForRecord(contentUnit.record, 'scene_moment'),
    ),
    targetKind: 'scene_moment',
    collectionSegment: 'scene_moments',
    edgeId: (target) => `${target.id}->${source.id}:scene-moment-ref`,
    edgeSource: (target) => target.id,
    edgeTarget: () => source.id,
    label: '情节',
    relation: 'content_unit_scene',
    edges,
    nodeByEntityKindAndKey,
    nodeByPath,
  })
  appendContentUnitReferenceSet({
    refs: contentUnitAssetRefsForRecord(contentUnit.record),
    targetKind: 'asset',
    collectionSegment: 'assets',
    edgeId: (target) => `${source.id}->${target.id}:asset-ref`,
    edgeSource: () => source.id,
    edgeTarget: (target) => target.id,
    label: '素材',
    relation: 'content_unit_asset',
    edges,
    nodeByEntityKindAndKey,
    nodeByPath,
  })
  appendContentUnitReferenceSet({
    refs: compactUniqueStrings(
      contentUnit.record.keyframe_ref,
      contentUnit.record.keyframe_refs,
      contentUnitGenerationEntityRefsForRecord(contentUnit.record, 'keyframe'),
    ),
    targetKind: 'keyframe',
    collectionSegment: 'keyframes',
    edgeId: (target) => `${source.id}->${target.id}:keyframe-ref`,
    edgeSource: () => source.id,
    edgeTarget: (target) => target.id,
    label: '关键帧',
    relation: 'content_unit_keyframe',
    edges,
    nodeByEntityKindAndKey,
    nodeByPath,
  })
  appendContentUnitReferenceSet({
    refs: compactUniqueStrings(
      contentUnit.record.storyboard_ref,
      contentUnit.record.storyboard_refs,
      contentUnitGenerationEntityRefsForRecord(contentUnit.record, 'storyboard'),
    ),
    targetKind: 'storyboard',
    collectionSegment: 'storyboards',
    edgeId: (target) => `${source.id}->${target.id}:storyboard-ref`,
    edgeSource: () => source.id,
    edgeTarget: (target) => target.id,
    label: '分镜',
    relation: 'content_unit_storyboard',
    edges,
    nodeByEntityKindAndKey,
    nodeByPath,
  })
  appendContentUnitReferenceSet({
    refs: compactUniqueStrings(
      contentUnit.record.audio_cue_ref,
      contentUnit.record.audio_cue_refs,
      contentUnitGenerationEntityRefsForRecord(contentUnit.record, 'audio_cue'),
    ),
    targetKind: 'audio_cue',
    collectionSegment: 'audio_cues',
    edgeId: (target) => `${source.id}->${target.id}:audio-cue-ref`,
    edgeSource: () => source.id,
    edgeTarget: (target) => target.id,
    label: '声音',
    relation: 'content_unit_audio_cue',
    edges,
    nodeByEntityKindAndKey,
    nodeByPath,
  })
  appendContentUnitReferenceSet({
    refs: contentUnitRawResourceRefsForRecord(contentUnit.record),
    targetKind: 'resource',
    collectionSegment: 'resources',
    edgeId: (target) => `${target.id}->${source.id}:resource-ref`,
    edgeSource: (target) => target.id,
    edgeTarget: () => source.id,
    label: '资源',
    relation: 'content_unit_resource',
    edges,
    nodeByEntityKindAndKey,
    nodeByPath,
  })
  for (const expressionRef of compactUniqueStrings(
    contentUnit.record.expression_unit_ref,
    contentUnit.record.expression_unit_refs,
    contentUnit.record.expression_ref,
    contentUnit.record.expression_refs,
    contentUnitGenerationEntityRefsForRecord(contentUnit.record, 'expression_unit'),
  )) {
    const target = referencedNodeFor('expression_unit', expressionRef, nodeByEntityKindAndKey, nodeByPath, 'expression_units')
    if (target) {
      edges.push({
        id: `${target.id}->${source.id}:expression-content-unit-ref:${expressionRef}`,
        source: target.id,
        target: source.id,
        label: '表达约束',
        kind: 'reference',
        relation: 'expression_unit_content_unit',
      })
    }
  }
}

function appendContentUnitReferenceSet({
  collectionSegment,
  edgeId,
  edgeSource,
  edgeTarget,
  edges,
  label,
  nodeByEntityKindAndKey,
  nodeByPath,
  refs,
  relation,
  targetKind,
}: {
  collectionSegment: string
  edgeId: (target: ContentCanvasNode) => string
  edgeSource: (target: ContentCanvasNode) => string
  edgeTarget: (target: ContentCanvasNode) => string
  edges: ContentCanvasEdge[]
  label: string
  nodeByEntityKindAndKey: Map<string, ContentCanvasNode>
  nodeByPath: Map<string, ContentCanvasNode>
  refs: string[]
  relation: NonNullable<ContentCanvasEdge['relation']>
  targetKind: ContentCanvasNodeKind
}) {
  for (const ref of refs) {
    const target = referencedNodeFor(targetKind, ref, nodeByEntityKindAndKey, nodeByPath, collectionSegment)
    if (!target) continue
    edges.push({
      id: edgeId(target),
      source: edgeSource(target),
      target: edgeTarget(target),
      label,
      kind: 'reference',
      relation,
    })
  }
}

function appendExpressionUnitReferenceEdges({
  data,
  edges,
  nodeByEntityKindAndKey,
  nodeByPath,
}: {
  data: ContentCanvasProjectData
  edges: ContentCanvasEdge[]
  nodeByEntityKindAndKey: Map<string, ContentCanvasNode>
  nodeByPath: Map<string, ContentCanvasNode>
}) {
  for (const expressionUnit of data.expressionUnits) {
    const source = nodeByEntityKindAndKey.get(`expression_unit:${entityKey(expressionUnit, data.projectId)}`)
    if (!source) continue
    for (const storyboardRef of expressionStoryboardRefs(expressionUnit.record)) {
      const target = referencedNodeFor('storyboard', storyboardRef, nodeByEntityKindAndKey, nodeByPath, 'storyboards')
      if (target) {
        edges.push({
          id: `${source.id}->${target.id}:expression-storyboard-ref:${storyboardRef}`,
          source: source.id,
          target: target.id,
          label: '表达分镜',
          kind: 'reference',
          relation: 'expression_unit_storyboard',
        })
      }
    }
  }
}

function appendAudioCueReferenceEdges({
  data,
  edges,
  nodeByEntityKindAndKey,
  nodeByPath,
}: {
  data: ContentCanvasProjectData
  edges: ContentCanvasEdge[]
  nodeByEntityKindAndKey: Map<string, ContentCanvasNode>
  nodeByPath: Map<string, ContentCanvasNode>
}) {
  for (const audioCue of data.audioCues ?? []) {
    const source = nodeByEntityKindAndKey.get(`audio_cue:${entityKey(audioCue, data.projectId)}`)
    if (!source) continue
    for (const storyboardRef of compactStrings(audioCue.record.storyboard_ref, audioCue.record.storyboard_refs)) {
      const target = referencedNodeFor('storyboard', storyboardRef, nodeByEntityKindAndKey, nodeByPath, 'storyboards')
      if (target) {
        edges.push({
          id: `${source.id}->${target.id}:audio-storyboard-ref`,
          source: source.id,
          target: target.id,
          label: '声音分镜',
          kind: 'reference',
          relation: 'audio_cue_storyboard',
        })
      }
    }
    for (const assetRef of compactStrings(audioCue.record.asset_ref, audioCue.record.asset_refs)) {
      const target = referencedNodeFor('asset', assetRef, nodeByEntityKindAndKey, nodeByPath, 'assets')
      if (target) {
        edges.push({
          id: `${source.id}->${target.id}:audio-asset-ref`,
          source: source.id,
          target: target.id,
          label: '声音素材',
          kind: 'reference',
          relation: 'audio_cue_asset',
        })
      }
    }
  }
}

function appendSettingStateReferenceEdges({
  edges,
  entityNodes,
  nodeByEntityKindAndKey,
  nodeByPath,
}: {
  edges: ContentCanvasEdge[]
  entityNodes: ContentCanvasNode[]
  nodeByEntityKindAndKey: Map<string, ContentCanvasNode>
  nodeByPath: Map<string, ContentCanvasNode>
}) {
  for (const node of entityNodes) {
    if (node.kind === 'asset') continue
    for (const stateRef of settingStateRefsForRecord(node.record)) {
      const target = referencedNodeFor('state', stateRef, nodeByEntityKindAndKey, nodeByPath, 'states')
      if (!target || target.id === node.id) continue
      edges.push({
        id: `${node.id}->${target.id}:setting-state-ref:${stateRef}`,
        source: node.id,
        target: target.id,
        label: '设定状态',
        kind: 'reference',
        relation: 'setting_state_reference',
      })
    }
  }
}

function referencedNodeFor(
  kind: ContentCanvasNodeKind,
  ref: string,
  nodes: Map<string, ContentCanvasNode>,
  nodeByPath: Map<string, ContentCanvasNode>,
  collectionSegment: string,
): ContentCanvasNode | undefined {
  return nodeByPath.get(ref)
    ?? nodes.get(`${kind}:${ref}`)
    ?? nodes.get(`${kind}:${pathSegmentAfter(ref, collectionSegment)}`)
}

function entityKey(entity: MovScriptWorkspaceIndexedEntity, projectId: number) {
  if (entity.entityKind === 'project') return String(entity.id ?? entity.record.project_id ?? projectId)
  return idValue(entity.id ?? entity.record.ID ?? entity.record.id) ?? `${entity.entityKind}:${entity.path}`
}

function idValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function compactStrings(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    return typeof value === 'string' && value.trim() ? [value.trim()] : []
  })
}

function compactUniqueStrings(...values: unknown[]): string[] {
  return [...new Set(compactStrings(...values))]
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function settingStateRefsForRecord(record: Record<string, unknown>): string[] {
  const refs = new Set<string>()
  for (const ref of compactStrings(record.setting_state_id, record.setting_state_ref, record.settingStateId, record.settingStateRef)) {
    refs.add(ref)
  }
  for (const item of arrayValue(record.setting_refs)) {
    if (!isRecord(item)) continue
    for (const ref of compactStrings(item.setting_state_id, item.settingStateId, item.setting_state_ref, item.settingStateRef)) {
      refs.add(ref)
    }
  }
  return [...refs]
}

function expressionStoryboardRefs(record: Record<string, unknown>): string[] {
  const span = isRecord(record.span) ? record.span : {}
  return compactStrings(
    record.storyboard_ref,
    record.storyboard_refs,
    span.storyboard_ref,
    span.storyboard_refs,
    span.from_storyboard_id,
    span.fromStoryboardId,
    span.to_storyboard_id,
    span.toStoryboardId,
  )
}

export function contentUnitRawResourceRefsForRecord(record: Record<string, unknown>): string[] {
  const refs = new Set<string>()
  for (const ref of compactStrings(
    record.resource_ref,
    record.resource_refs,
    record.raw_resource_ref,
    record.raw_resource_refs,
    record.input_resource_id,
    record.input_resource_ids,
    record.reference_resource_id,
    record.reference_resource_ids,
    record.resource_id,
    record.resource_ids,
  )) refs.add(normalizeResourceRef(ref))
  for (const ref of numericResourceRefs(
    record.input_resource_id,
    record.input_resource_ids,
    record.reference_resource_id,
    record.reference_resource_ids,
    record.resource_id,
    record.resource_ids,
  )) refs.add(ref)

  for (const ref of contentUnitGenerationResourceRefsForRecord(record)) refs.add(ref)
  if (!contentUnitHasExplicitGenerationReferences(record)) {
    const prompt = record.edit_prompt ?? record.prompt
    const promptText = stringValue(isRecord(prompt) ? prompt.text : prompt)
    if (promptText) {
      for (const ref of resourceRefsFromPrompt(promptText)) refs.add(ref)
    }
  }
  return [...refs].filter(Boolean)
}

function contentUnitAssetRefsForRecord(record: Record<string, unknown>): string[] {
  const refs = new Set<string>()
  for (const ref of compactStrings(record.asset_ref, record.asset_refs)) refs.add(ref)
  for (const ref of contentUnitGenerationEntityRefsForRecord(record, 'asset')) refs.add(ref)

  if (!contentUnitHasExplicitGenerationReferences(record)) {
    const prompt = record.edit_prompt ?? record.prompt
    for (const text of promptTextFields(prompt)) {
      for (const ref of assetRefsFromPrompt(text)) refs.add(ref)
    }
  }
  return [...refs].filter(Boolean)
}

function promptTextFields(prompt: unknown): string[] {
  if (isRecord(prompt)) {
    return compactStrings(prompt.text, prompt.negative_text, prompt.notes)
  }
  return compactStrings(prompt)
}

function assetRefsFromPrompt(text: string): string[] {
  return promptEntityRefsFromText(text, 'asset')
}

function resourceRefsFromPrompt(text: string): string[] {
  const refs = new Set<string>()
  for (const ref of promptEntityRefsFromText(text, 'resource')) {
    const normalized = normalizeResourceRef(ref)
    if (normalized) refs.add(normalized)
  }
  const patterns = [
    /\[\[\s*resource(?:::|:)\s*([^\]\s]+)\s*\]\]/gi,
    /@\[resource:\s*([^\]\s]+)\s*\]/gi,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const ref = normalizeResourceRef(match[1] ?? '')
      if (ref) refs.add(ref)
    }
  }
  return [...refs]
}

function contentUnitGenerationEntityRefsForRecord(record: Record<string, unknown>, kind: ContentCanvasNodeKind): string[] {
  const refs = new Set<string>()
  for (const item of contentUnitGenerationReferenceRecords(record)) {
    const refKind = stringValue(item.kind ?? item.ref_kind ?? item.refKind ?? item.type)?.toLowerCase()
    const sourceRef = stringValue(item.source_ref ?? item.sourceRef ?? item.raw)
    if (sourceRef) {
      for (const ref of promptEntityRefsFromText(sourceRef, kind)) refs.add(ref)
    }
    if (refKind !== kind) continue
    for (const ref of compactStrings(item.ref, item.target_ref, item.targetRef)) refs.add(normalizePromptEntityRef(ref, kind))
  }
  if (contentUnitHasExplicitGenerationReferences(record)) return [...refs]
  for (const ref of contentUnitPromptEntityRefsForRecord(record, kind)) refs.add(ref)
  return [...refs]
}

function contentUnitGenerationResourceRefsForRecord(record: Record<string, unknown>): string[] {
  const refs = new Set<string>()
  for (const item of contentUnitGenerationReferenceRecords(record)) {
    const refKind = stringValue(item.kind ?? item.ref_kind ?? item.refKind ?? item.type)?.toLowerCase()
    const sourceRef = stringValue(item.source_ref ?? item.sourceRef ?? item.raw)
    for (const ref of compactStrings(item.resource_id, item.resourceId)) refs.add(normalizeResourceRef(ref))
    for (const ref of numericResourceRefs(item.resource_id, item.resourceId)) refs.add(ref)
    if (sourceRef) {
      for (const ref of resourceRefsFromPrompt(sourceRef)) refs.add(ref)
    }
    if (refKind === 'resource') {
      for (const ref of compactStrings(item.ref, item.target_ref, item.targetRef)) refs.add(normalizeResourceRef(ref))
    }
  }
  for (const item of arrayValue(record.reference_assets ?? record.referenceAssets)) {
    if (!isRecord(item)) continue
    for (const ref of compactStrings(item.resource_id, item.resourceId)) refs.add(normalizeResourceRef(ref))
    for (const ref of numericResourceRefs(item.resource_id, item.resourceId)) refs.add(ref)
    const sourceRef = stringValue(item.source_ref ?? item.sourceRef)
    if (sourceRef) {
      for (const ref of resourceRefsFromPrompt(sourceRef)) refs.add(ref)
    }
  }
  return [...refs].filter(Boolean)
}

function contentUnitPromptEntityRefsForRecord(record: Record<string, unknown>, kind: ContentCanvasNodeKind): string[] {
  const refs = new Set<string>()
  const prompt = record.edit_prompt ?? record.prompt
  for (const text of promptTextFields(prompt)) {
    for (const ref of promptEntityRefsFromText(text, kind)) refs.add(ref)
  }
  return [...refs]
}

function contentUnitHasExplicitGenerationReferences(record: Record<string, unknown>): boolean {
  return contentUnitGenerationReferenceRecords(record).length > 0
    || arrayValue(record.reference_assets ?? record.referenceAssets).some(isRecord)
}

function contentUnitGenerationReferenceRecords(record: Record<string, unknown>): Record<string, unknown>[] {
  return arrayValue(record.generation_references ?? record.generationReferences).filter(isRecord)
}

function promptEntityRefsFromText(text: string, kind: string): string[] {
  const refs = new Set<string>()
  for (const match of text.matchAll(PROMPT_ENTITY_REFERENCE_PATTERN)) {
    if ((match[1] ?? '').trim().toLowerCase() !== kind) continue
    const ref = normalizePromptEntityRef(match[2] ?? '', kind)
    if (ref) refs.add(ref)
  }
  return [...refs]
}

function normalizeResourceRef(ref: string): string {
  const normalized = normalizeRawResourceRef(ref)
  if (normalized) return normalized.resourceId
  const fallback = normalizePromptEntityRef(ref, 'resource')
  return /^(?:https?:|data:|blob:|\/)/i.test(fallback) ? '' : fallback
}

function normalizePromptEntityRef(ref: string, kind: string): string {
  return ref.trim().replace(new RegExp(`^${kind}(?:::|:)`, 'i'), '')
}

function numericResourceRefs(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return [String(value)]
    if (Array.isArray(value)) {
      return value.flatMap((item) => typeof item === 'number' && Number.isFinite(item) ? [String(item)] : [])
    }
    return []
  })
}

function pathSegmentAfter(path: string | undefined, segment: string): string | undefined {
  if (!path) return undefined
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
