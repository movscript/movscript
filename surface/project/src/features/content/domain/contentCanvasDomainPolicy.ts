import type { ContentCanvasNode, ContentCanvasNodeKind } from './contentCanvasTypes'

const CONTENT_CANVAS_KIND_LABELS: Partial<Record<ContentCanvasNodeKind, string>> = {
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

const CONTENT_UNIT_CANDIDATE_SYSTEM_PRIMITIVES = new Set<ContentCanvasNodeKind>([
  'scene_moment',
  'asset',
  'expression_unit',
  'keyframe',
  'storyboard',
])

const GENERATABLE_SYSTEM_PRIMITIVES = new Set<ContentCanvasNodeKind>([
  ...CONTENT_UNIT_CANDIDATE_SYSTEM_PRIMITIVES,
  'content_unit',
])

export function contentCanvasNodeIsNamespace(node: Pick<ContentCanvasNode, 'domainCategory'> | undefined): boolean {
  return node?.domainCategory === 'timeline_namespace' || node?.domainCategory === 'setting_namespace'
}

export function contentCanvasNodeNamespaceKind(
  node: Pick<ContentCanvasNode, 'domainCategory' | 'domainKind' | 'kind' | 'record'> | undefined,
): string | undefined {
  if (!contentCanvasNodeIsNamespace(node)) return undefined
  return stringValue(node?.domainKind)
    ?? stringValue(node?.record.namespace_kind)
    ?? stringValue(node?.record.namespaceKind)
    ?? stringValue(node?.record.timeline_namespace_kind)
    ?? stringValue(node?.record.timelineNamespaceKind)
    ?? stringValue(node?.record.setting_namespace_kind)
    ?? stringValue(node?.record.settingNamespaceKind)
}

export function contentCanvasNodeDisplayKind(
  node: Pick<ContentCanvasNode, 'domainCategory' | 'domainKind' | 'kind' | 'record'>,
): string {
  return contentCanvasNodeNamespaceKind(node) ?? contentCanvasKindLabel(node.kind)
}

export function contentCanvasNodeDisplayCode(
  node: Pick<ContentCanvasNode, 'domainCategory' | 'domainKind' | 'kind' | 'record'>,
): string {
  const namespaceKind = contentCanvasNodeNamespaceKind(node)
  if (namespaceKind) {
    const code = namespaceKind.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 8)
    if (code) return code
  }
  return contentCanvasKindCode(node.kind)
}

export function contentCanvasKindLabel(kind: ContentCanvasNodeKind): string {
  return CONTENT_CANVAS_KIND_LABELS[kind] ?? kind
}

export function contentCanvasKindCode(kind: ContentCanvasNodeKind): string {
  if (kind === 'project') return 'PRJ'
  if (kind === 'production') return 'PROD'
  if (kind === 'segment') return 'SEG'
  if (kind === 'scene_moment') return 'SCN'
  if (kind === 'storyboard') return 'STB'
  if (kind === 'expression_unit') return 'EXP'
  if (kind === 'content_unit') return 'UNIT'
  if (kind === 'candidate') return 'CAND'
  if (kind === 'selection') return 'SEL'
  if (kind === 'resource') return 'RES'
  if (kind === 'keyframe') return 'KEY'
  if (kind === 'asset') return 'AST'
  if (kind === 'setting') return 'SET'
  if (kind === 'state') return 'STATE'
  if (kind === 'audio_cue') return 'AUD'
  if (kind === 'work_item') return 'WORK'
  if (kind === 'actor') return 'ACT'
  if (kind === 'group') return 'GRP'
  return 'NODE'
}

export function contentCanvasNodeCanUseCandidateFlow(node: ContentCanvasNode | undefined): boolean {
  if (!node || contentCanvasNodeIsNamespace(node)) return false
  if (node.domainCategory === 'content_unit') return true
  if (node.domainCategory === 'system_primitive') return CONTENT_UNIT_CANDIDATE_SYSTEM_PRIMITIVES.has(node.kind)
  return CONTENT_UNIT_CANDIDATE_SYSTEM_PRIMITIVES.has(node.kind) || node.kind === 'content_unit'
}

export function contentCanvasNodeCanGenerate(node: ContentCanvasNode | undefined): boolean {
  if (!node || contentCanvasNodeIsNamespace(node)) return false
  if (node.domainCategory === 'content_unit') return true
  if (node.domainCategory === 'system_primitive') return GENERATABLE_SYSTEM_PRIMITIVES.has(node.kind)
  return GENERATABLE_SYSTEM_PRIMITIVES.has(node.kind)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
