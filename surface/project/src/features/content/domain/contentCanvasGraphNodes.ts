import type { MovScriptWorkspaceIndexedEntity } from '@movscript/workspace'
import type {
  ContentCanvasCandidate,
  ContentCanvasGenerationTask,
  ContentCanvasNode,
  ContentCanvasNodeKind,
  ContentCanvasProjectData,
} from './contentCanvasTypes'

const KIND_LABELS: Partial<Record<ContentCanvasNodeKind, string>> = {
  project: '项目',
  production: '制作',
  segment: '段落',
  scene_moment: '情节',
  storyboard: '分镜图',
  expression_unit: '表达单元',
  content_unit: '创作片段',
  candidate: '候选',
  selection: '选择',
  resource: '资源',
  keyframe: '关键帧',
  asset: '素材',
  setting: '设定',
  state: '状态',
  audio_cue: '声音',
  work_item: '工作项',
  actor: '处理者',
  group: '分组',
}

export function createContentCanvasEntityNode(
  entity: MovScriptWorkspaceIndexedEntity,
  projectId: number,
  contentUnitCandidates: ContentCanvasProjectData['contentUnitCandidates'],
  generationTaskByTargetNodeId: Map<string, ContentCanvasGenerationTask>,
): ContentCanvasNode {
  const kind = contentCanvasKind(entity)
  const key = entityKey(entity, projectId)
  const nodeId = nodeIdForEntity(entity, projectId)
  const candidates = kind === 'content_unit'
    ? (contentUnitCandidates[key] ?? [])
    : []
  const generationTask = generationTaskByTargetNodeId.get(nodeId)
  return {
    id: nodeId,
    entityKey: key,
    kind,
    title: titleForEntity(entity, projectId),
    subtitle: subtitleForEntity(entity),
    summary: summaryForEntity(entity),
    status: statusForEntity(entity),
    metrics: metricsForEntity(entity, candidates, generationTask),
    sourcePath: entity.path,
    record: entity.record,
    candidates,
    generationTask,
    position: { x: 0, y: 0 },
  }
}

export function nodeIdForEntity(entity: MovScriptWorkspaceIndexedEntity, projectId: number) {
  return `${contentCanvasKind(entity)}:${entityKey(entity, projectId)}`
}

export function entityKey(entity: MovScriptWorkspaceIndexedEntity, projectId: number) {
  if (entity.entityKind === 'project') return String(entity.id ?? entity.record.project_id ?? projectId)
  return idValue(entity.id ?? entity.record.ID ?? entity.record.id) ?? `${entity.entityKind}:${entity.path}`
}

export function contentCanvasKind(entity: MovScriptWorkspaceIndexedEntity): ContentCanvasNodeKind {
  if (entity.entityKind === 'asset') return 'asset'
  if (entity.entityKind === 'setting_state') return 'state'
  return entity.entityKind as ContentCanvasNodeKind
}

export function titleForEntity(entity: MovScriptWorkspaceIndexedEntity, projectId: number) {
  const record = entity.record
  return stringValue(record.title ?? record.name ?? record.label)
    ?? (entity.entityKind === 'project' ? `Project ${projectId}` : `${kindLabel(contentCanvasKind(entity))} ${entityKey(entity, projectId)}`)
}

export function summaryForEntity(entity: MovScriptWorkspaceIndexedEntity) {
  const record = entity.record
  const prompt = record.edit_prompt
  return stringValue(record.summary ?? record.description ?? record.action_text ?? record.action ?? record.text ?? record.visual_intent ?? record.prompt ?? (isRecord(prompt) ? prompt.text : undefined))
    ?? '暂无摘要'
}

export function idValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function pathSegmentAfter(path: string | undefined, segment: string): string | undefined {
  if (!path) return undefined
  const parts = path.split('/')
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

export function compactStrings(...values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    return typeof value === 'string' && value.trim() ? [value.trim()] : []
  })
}

function subtitleForEntity(entity: MovScriptWorkspaceIndexedEntity) {
  const kind = contentCanvasKind(entity)
  const record = entity.record
  if (kind === 'content_unit') return stringValue(record.output_kind ?? record.content_unit_type ?? record.kind) ?? kindLabel(kind)
  if (kind === 'storyboard') return stringValue(record.slot ?? record.asset_kind ?? record.kind) ?? kindLabel(kind)
  if (kind === 'expression_unit') return stringValue(record.expression_kind ?? record.kind) ?? kindLabel(kind)
  if (kind === 'asset') return stringValue(record.kind ?? record.asset_kind ?? record.slot_key) ?? kindLabel(kind)
  if (kind === 'state') return stringValue(record.state_kind ?? record.kind) ?? kindLabel(kind)
  if (kind === 'audio_cue') return stringValue(record.cue_kind ?? record.kind) ?? kindLabel(kind)
  if (kind === 'segment') return stringValue(record.segment_kind ?? record.kind) ?? kindLabel(kind)
  if (kind === 'setting') return stringValue(record.kind ?? record.setting_kind) ?? kindLabel(kind)
  return kindLabel(kind)
}

function kindLabel(kind: ContentCanvasNodeKind): string {
  return KIND_LABELS[kind] ?? kind
}

function metricsForEntity(
  entity: MovScriptWorkspaceIndexedEntity,
  mergedCandidates: ContentCanvasCandidate[] = [],
  generationTask?: ContentCanvasGenerationTask,
) {
  const record = entity.record
  const candidates = generationTask?.candidates ?? mergedCandidates
  const selectedCandidate = candidates.find((candidate) => candidate.selected)
  return [
    numberMetric('顺序', record.order),
    numberMetric('时长', record.duration_sec ?? (isRecord(record.model_intent) ? record.model_intent.duration_sec : undefined), 's'),
    stringMetric('状态', record.status ?? record.review_status),
    entity.entityKind === 'asset' ? stringMetric('素材', record.asset_kind ?? record.kind ?? record.mime_type ?? record.media_type) : undefined,
    entity.entityKind === 'asset' ? valueMetric('资源', record.resource_id ?? record.resourceId ?? record.artifact_ref ?? record.artifactRef ?? record.uri ?? record.url) : undefined,
    generationTask ? `创作片段 ${generationTask.outputKind}` : undefined,
    generationTask?.status === 'needs_candidate' ? '待生成候选' : undefined,
    candidates.length ? `候选 ${candidates.length}` : undefined,
    selectedCandidate ? '已选择候选' : undefined,
  ].filter((item): item is string => Boolean(item))
}

function statusForEntity(entity: MovScriptWorkspaceIndexedEntity): ContentCanvasNode['status'] {
  const record = entity.record
  const status = stringValue(record.status ?? record.review_status)
  if (status === 'ready' || status === 'selected' || status === 'approved') return 'ready'
  if (status === 'blocked' || status === 'missing') return 'missing'
  if (entity.entityKind === 'content_unit' && !summaryForEntity(entity)) return 'missing'
  if (entity.entityKind === 'content_unit' || entity.entityKind === 'keyframe') return 'active'
  return 'neutral'
}

function numberMetric(label: string, value: unknown, suffix = '') {
  const number = numberValue(value)
  return number === undefined ? undefined : `${label} ${number}${suffix}`
}

function stringMetric(label: string, value: unknown) {
  const text = stringValue(value)
  return text ? `${label} ${text}` : undefined
}

function valueMetric(label: string, value: unknown) {
  const text = idValue(value)
  return text ? `${label} ${text}` : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value)
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
