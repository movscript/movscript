import {
  getProject,
  listSemanticEntities,
  semanticEntityConfig,
  type SemanticEntityKind,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import type {
  ProjectStandardsProposalDraftView,
  ProjectStyleDraftRow,
} from '@/components/proposals/ProjectStandardsProposalReviewPanel'
import type { AgentDraft } from '@/lib/localAgentClient'

export type WorkspaceRecord = SemanticEntityRecord & {
  description?: string
  summary?: string
  content?: string
  aspect_ratio?: string
  visual_style?: string
  project_style?: string
  total_episodes?: number
  priority?: string
  production_id?: number | null
  creative_reference_id?: number | null
  owner_type?: string
  owner_id?: number | null
  source_type?: string
  kind?: string
  role?: string
}

export interface WorkspaceData {
  project: WorkspaceRecord | null
  productions: WorkspaceRecord[]
  creativeReferences: WorkspaceRecord[]
  creativeRelationships: WorkspaceRecord[]
  creativeReferenceUsages: WorkspaceRecord[]
  assetSlots: WorkspaceRecord[]
  assetSlotCandidates: WorkspaceRecord[]
  segments: WorkspaceRecord[]
  sceneMoments: WorkspaceRecord[]
  contentUnits: WorkspaceRecord[]
}

export type PromptRole = 'context' | 'style' | 'constraint' | 'negative' | 'quality_gate'

export interface CoreStandardDef {
  key: string
  label: string
  category: string
  promptRole: PromptRole
  required: boolean
  helper: string
  multiline?: boolean
  list?: boolean
}

export interface ProjectPromptRule {
  id: string
  key: string
  label: string
  category: string
  value: string
  prompt_role: PromptRole
  enabled: boolean
  required: boolean
  order: number
}

export interface ProjectPromptRuleForm {
  id?: string
  key: string
  label: string
  category: string
  value: string
  prompt_role: PromptRole
  enabled: boolean
  required: boolean
}

export const CORE_STANDARD_DEFS: CoreStandardDef[] = [
  { key: 'aspect_ratio', label: '画幅比例', category: '基础', promptRole: 'context', required: true, helper: '例如 16:9、9:16、1:1。用于生成任务默认比例。' },
  { key: 'visual_style', label: '视觉风格', category: '视觉', promptRole: 'style', required: true, helper: '项目整体画风、质感、年代感和镜头观感。', multiline: true },
  { key: 'shot_size_system', label: '镜头大小体系', category: '镜头', promptRole: 'style', required: true, helper: '每行一个镜头尺度，例如远景、中景、近景、特写。', multiline: true, list: true },
  { key: 'camera_language', label: '镜头语言', category: '镜头', promptRole: 'style', required: true, helper: '运动、稳定性、构图、视角和镜头切换规则。', multiline: true },
  { key: 'lighting_style', label: '灯光规则', category: '视觉', promptRole: 'style', required: true, helper: '光源、明暗层次、曝光和氛围要求。', multiline: true },
  { key: 'color_palette', label: '色彩规则', category: '视觉', promptRole: 'style', required: true, helper: '主色、辅助色、饱和度和禁止色彩倾向。', multiline: true },
  { key: 'pacing_rules', label: '节奏规则', category: '叙事', promptRole: 'constraint', required: true, helper: '剪辑、情绪推进、镜头时长和段落节奏。', multiline: true },
  { key: 'negative_rules', label: '负面规则', category: '负面', promptRole: 'negative', required: true, helper: '每行一个禁止项，会进入负面约束。', multiline: true, list: true },
]

export const PROMPT_ROLE_LABELS: Record<PromptRole, string> = {
  context: '背景',
  style: '风格',
  constraint: '约束',
  negative: '负面',
  quality_gate: '质检',
}

const PROMPT_ROLE_SECTIONS: Array<{ role: PromptRole; title: string }> = [
  { role: 'context', title: '项目背景规范' },
  { role: 'style', title: '视觉与表达规范' },
  { role: 'constraint', title: '必须遵守' },
  { role: 'negative', title: '禁止出现' },
  { role: 'quality_gate', title: '质检口径' },
]

export const emptyRuleForm: ProjectPromptRuleForm = {
  key: '',
  label: '',
  category: '通用',
  value: '',
  prompt_role: 'constraint',
  enabled: true,
  required: false,
}

export const STYLE_REFERENCE_RULE_KEY = 'style_reference_images'

export const emptyData: WorkspaceData = {
  project: null,
  productions: [],
  creativeReferences: [],
  creativeRelationships: [],
  creativeReferenceUsages: [],
  assetSlots: [],
  assetSlotCandidates: [],
  segments: [],
  sceneMoments: [],
  contentUnits: [],
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function isProjectStandardsProposalHelperDraft(draft: AgentDraft) {
  if (draft.kind !== 'project_standards_proposal') return false
  const metadata = isRecord(draft.metadata) ? draft.metadata : {}
  return typeof metadata.sourceDraftId === 'string' && metadata.sourceDraftId.trim().length > 0
}

export function parseProjectStandardsProposalDraft(draft: AgentDraft, pageKey?: string): ProjectStandardsProposalDraftView | null {
  try {
    const content = JSON.parse(draft.content) as Record<string, unknown>
    const impactNotes = [
      ...asRecordArray(content.impact_notes).map((item) => asString(item.note ?? item.text ?? item.content ?? item.summary)),
      ...asRecordArray(content.impactNotes).map((item) => asString(item.note ?? item.text ?? item.content ?? item.summary)),
      ...(Array.isArray(content.impact_notes) ? content.impact_notes.map((item) => asString(item)).filter(Boolean) : []),
      ...(Array.isArray(content.impactNotes) ? content.impactNotes.map((item) => asString(item)).filter(Boolean) : []),
    ].filter(Boolean)

    return {
      summary: asString(content.summary, '暂无摘要'),
      impactNotes,
      debug: {
        scope: asString(content.scope, ''),
        pageKey,
        draftId: draft.id,
        draftUpdatedAt: draft.updatedAt,
        draftStatus: draft.status,
        sourceRunId: asString(draft.createdByRunId, asString(content.sourceRunId, '')),
        sourceThreadId: asString(draft.createdByThreadId, asString(content.sourceThreadId, '')),
      },
    }
  } catch {
    return null
  }
}

export function buildProjectStyleApplyPayload(draft: AgentDraft) {
  const content = JSON.parse(draft.content) as Record<string, unknown>
  const proposal = isRecord(content.proposal) ? content.proposal : {}
  return JSON.stringify({
    ...content,
    mode: 'snapshot',
    proposal: {
      project_style: isRecord(proposal.project_style) ? proposal.project_style : {},
    },
  }, null, 2)
}

function draftEntryFieldText(value: unknown) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value) || isRecord(value)) {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function valueToPromptText(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => draftEntryFieldText(item)).filter(Boolean).join('；')
  return draftEntryFieldText(value)
}

export function splitListText(value: string) {
  return value
    .split(/\n|,|，|;|；/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function coreStandardValue(project: WorkspaceRecord | null | undefined, key: string) {
  const style = parseProjectStyleRecord(project)
  if (key === 'aspect_ratio') return project?.aspect_ratio ?? style.aspect_ratio
  if (key === 'visual_style') return project?.visual_style ?? style.visual_style
  return style[key]
}

export function coreStandardText(project: WorkspaceRecord | null | undefined, key: string) {
  return valueToPromptText(coreStandardValue(project, key))
}

function normalizePromptRole(value: unknown): PromptRole {
  if (value === 'context' || value === 'style' || value === 'constraint' || value === 'negative' || value === 'quality_gate') return value
  return 'constraint'
}

function normalizeProjectPromptRule(value: unknown, index: number): ProjectPromptRule | null {
  if (!isRecord(value)) return null
  const label = asString(value.label, asString(value.name, asString(value.key, `扩展规范 ${index + 1}`)))
  const ruleValue = draftEntryFieldText(value.value ?? value.content ?? value.description)
  const key = asString(value.key, label.toLowerCase().replace(/\s+/g, '_'))
  if (!label && !ruleValue) return null
  return {
    id: asString(value.id, `rule_${key || index}_${index}`),
    key,
    label,
    category: asString(value.category, '通用'),
    value: ruleValue,
    prompt_role: normalizePromptRole(value.prompt_role ?? value.promptRole ?? value.role),
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    required: typeof value.required === 'boolean' ? value.required : false,
    order: typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : (index + 1) * 10,
  }
}

export function projectPromptRules(project?: WorkspaceRecord | null) {
  const style = parseProjectStyleRecord(project)
  return asRecordArray(style.custom_rules)
    .map((item, index) => normalizeProjectPromptRule(item, index))
    .filter((item): item is ProjectPromptRule => Boolean(item))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

export function projectPromptRulePayload(rules: ProjectPromptRule[]) {
  return rules
    .map((rule, index) => ({
      id: rule.id,
      key: rule.key.trim(),
      label: rule.label.trim(),
      category: rule.category.trim() || '通用',
      value: rule.value.trim(),
      prompt_role: rule.prompt_role,
      enabled: rule.enabled,
      required: rule.required,
      order: rule.order || (index + 1) * 10,
    }))
    .filter((rule) => rule.key || rule.label || rule.value)
}

export function extractResourceIds(value: string) {
  const ids = new Set<number>()
  const patterns = [
    /resource#(\d+)/gi,
    /reference_resource_ids\s*[:=]\s*\[?([0-9,\s]+)\]?/gi,
  ]
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const idText = match[1] ?? ''
      for (const part of idText.split(',')) {
        const id = Number(part.trim())
        if (Number.isInteger(id) && id > 0) ids.add(id)
      }
    }
  }
  return Array.from(ids)
}

export function buildStyleReferenceRule(resourceIds: number[], existing?: ProjectPromptRule): ProjectPromptRule {
  const uniqueIds = Array.from(new Set(resourceIds.filter((id) => Number.isInteger(id) && id > 0)))
  const resourceText = uniqueIds.map((id) => `resource#${id}`).join('、')
  return {
    id: existing?.id ?? 'rule_style_reference_images',
    key: STYLE_REFERENCE_RULE_KEY,
    label: existing?.label || '全局画风参考图',
    category: existing?.category || '视觉',
    value: `画风参考图片：${resourceText}；reference_resource_ids=[${uniqueIds.join(', ')}]。仅用于视觉画风、质感、色彩、线条质量和光影连续性参考；后续图片/视频生成时，将这些资源 ID 作为 reference_resource_ids 传给支持参考图的生成工具。`,
    prompt_role: 'style',
    enabled: true,
    required: existing?.required ?? false,
    order: existing?.order ?? 5,
  }
}

function buildRuleId(key: string) {
  const safe = key.trim().toLowerCase().replace(/[^a-z0-9_\u4e00-\u9fa5-]+/gi, '_').replace(/^_+|_+$/g, '')
  return `rule_${safe || Date.now().toString(36)}`
}

export function normalizeRuleForm(form: ProjectPromptRuleForm, order: number): ProjectPromptRule {
  const label = form.label.trim() || form.key.trim() || '未命名规范'
  const key = form.key.trim() || label.toLowerCase().replace(/\s+/g, '_')
  return {
    id: form.id || buildRuleId(key),
    key,
    label,
    category: form.category.trim() || '通用',
    value: form.value.trim(),
    prompt_role: form.prompt_role,
    enabled: form.enabled,
    required: form.required,
    order,
  }
}

export function buildProjectPromptPreview(project?: WorkspaceRecord | null) {
  const coreItems = CORE_STANDARD_DEFS.map((item) => ({
    label: item.label,
    role: item.promptRole,
    value: coreStandardText(project, item.key),
  })).filter((item) => item.value)
  const customItems = projectPromptRules(project)
    .filter((item) => item.enabled && item.value)
    .map((item) => ({ label: item.label, role: item.prompt_role, value: item.value }))
  const allItems = [...coreItems, ...customItems]
  const sections = PROMPT_ROLE_SECTIONS.flatMap((section) => {
    const items = allItems.filter((item) => item.role === section.role)
    if (items.length === 0) return []
    return [`${section.title}：`, ...items.map((item) => `- ${item.label}：${item.value}`)]
  })
  return sections.length > 0 ? `项目规范：\n${sections.join('\n')}` : '项目规范：\n- 暂无已启用规范。'
}

export function parseProjectStyleDraftRows(draft: AgentDraft, project?: WorkspaceRecord | null): ProjectStyleDraftRow[] {
  try {
    const content = JSON.parse(draft.content) as Record<string, unknown>
    const proposal = isRecord(content.proposal) ? content.proposal : {}
    const projectStyle = isRecord(proposal.project_style) ? proposal.project_style : {}
    const currentStyle = parseProjectStyleRecord(project)
    const coreRows = CORE_STANDARD_DEFS.flatMap(({ key, label }) => {
      const value = projectStyle[key]
      const text = draftEntryFieldText(value)
      if (!text) return []
      const before = draftEntryFieldText(key === 'aspect_ratio'
        ? project?.aspect_ratio ?? currentStyle[key]
        : key === 'visual_style'
          ? project?.visual_style ?? currentStyle[key]
          : currentStyle[key])
      return [{ key, label, before, after: text, changed: before !== text, kind: 'core' as const }]
    })
    const currentRules = new Map(projectPromptRules(project).map((rule) => [rule.id || rule.key, rule]))
    const customRows = asRecordArray(projectStyle.custom_rules).flatMap((item, index) => {
      const rule = normalizeProjectPromptRule(item, index)
      if (!rule) return []
      const current = currentRules.get(rule.id) ?? currentRules.get(rule.key)
      const before = current?.value ?? ''
      return [{
        key: `custom:${rule.id}`,
        label: `扩展：${rule.label}`,
        before,
        after: rule.value,
        changed: before !== rule.value || current?.enabled !== rule.enabled || current?.prompt_role !== rule.prompt_role,
        kind: 'custom' as const,
      }]
    })
    return [...coreRows, ...customRows]
  } catch {
    return []
  }
}

export function parseProjectStyleRecord(project?: WorkspaceRecord | null): Record<string, unknown> {
  if (!project?.project_style) return {}
  try {
    const parsed = JSON.parse(project.project_style)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function projectStandardRows(project?: WorkspaceRecord | null): ProjectStyleDraftRow[] {
  return CORE_STANDARD_DEFS.map((item) => ({
    key: item.key,
    label: item.label,
    before: '',
    after: valueToPromptText(coreStandardValue(project, item.key)),
    changed: false,
    kind: 'core' as const,
  }))
}

export function projectStandardMissingLabels(project?: WorkspaceRecord | null) {
  return projectStandardRows(project)
    .filter((row) => !row.after)
    .map((row) => row.label)
}

export function projectStandardFilledCount(project?: WorkspaceRecord | null) {
  return projectStandardRows(project).filter((row) => row.after).length
}

async function safeList(projectId: number, kind: SemanticEntityKind): Promise<WorkspaceRecord[]> {
  try {
    return await listSemanticEntities(projectId, semanticEntityConfig(kind)) as WorkspaceRecord[]
  } catch (error) {
    console.warn(`Failed to load project workspace entity: ${kind}`, error)
    return []
  }
}

export async function loadProjectStandardsWorkspaceData(projectId: number): Promise<WorkspaceData> {
  const [
    project,
    productions,
    creativeReferences,
    creativeRelationships,
    creativeReferenceUsages,
    assetSlots,
    assetSlotCandidates,
    segments,
    sceneMoments,
    contentUnits,
  ] = await Promise.all([
    getProject(projectId).catch((error) => {
      console.warn('Failed to load project globals', error)
      return null
    }),
    safeList(projectId, 'productions'),
    safeList(projectId, 'creativeReferences'),
    safeList(projectId, 'creativeRelationships'),
    safeList(projectId, 'creativeReferenceUsages'),
    safeList(projectId, 'assetSlots'),
    safeList(projectId, 'assetSlotCandidates'),
    safeList(projectId, 'segments'),
    safeList(projectId, 'sceneMoments'),
    safeList(projectId, 'contentUnits'),
  ])

  return {
    project: project as WorkspaceRecord | null,
    productions,
    creativeReferences,
    creativeRelationships,
    creativeReferenceUsages,
    assetSlots,
    assetSlotCandidates,
    segments,
    sceneMoments,
    contentUnits,
  }
}
