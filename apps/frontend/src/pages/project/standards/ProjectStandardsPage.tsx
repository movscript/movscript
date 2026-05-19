import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileText,
  GitBranch,
  ImagePlus,
  Layers3,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import { Badge, Button, Card, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@movscript/ui'

import {
  applyProjectStandardsProposal,
  getProject,
  listSemanticEntities,
  semanticEntityConfig,
  type SemanticEntityKind,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import { AuthedImage } from '@/components/shared/AuthedImage'
import { buildCommandFirstClientInput, buildPageKey } from '@/lib/agentCommandInput'
import { openAgentPanelDraft, registerAgentPanelPageTool } from '@/lib/agentPanelBridge'
import { selectLatestDraftArtifact } from '@/lib/agentArtifacts'
import { buildDefaultProjectStylePatch, buildEmptyProjectStandardsProposalDraftContent } from '@/lib/projectStandardsProposalDraft'
import { api } from '@/lib/api'
import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import { ROUTES } from '@/routes/projectRoutes'
import type { RawResource } from '@/types'

type WorkspaceRecord = SemanticEntityRecord & {
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

interface WorkspaceData {
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

interface ProjectStandardsProposalDraftView {
  summary: string
  impactNotes: string[]
  debug: {
    scope?: string
    pageKey?: string
    draftId?: string
    draftUpdatedAt?: string
    draftStatus?: string
    sourceRunId?: string
    sourceThreadId?: string
  }
}

interface ProjectStyleDraftRow {
  key: string
  label: string
  before: string
  after: string
  changed: boolean
  kind?: 'core' | 'custom'
}

interface StatCardProps {
  title: string
  value: string | number
  detail: string
  icon: LucideIcon
}

type PromptRole = 'context' | 'style' | 'constraint' | 'negative' | 'quality_gate'

interface CoreStandardDef {
  key: string
  label: string
  category: string
  promptRole: PromptRole
  required: boolean
  helper: string
  multiline?: boolean
  list?: boolean
}

interface ProjectPromptRule {
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

interface ProjectPromptRuleForm {
  id?: string
  key: string
  label: string
  category: string
  value: string
  prompt_role: PromptRole
  enabled: boolean
  required: boolean
}

const CORE_STANDARD_DEFS: CoreStandardDef[] = [
  { key: 'aspect_ratio', label: '画幅比例', category: '基础', promptRole: 'context', required: true, helper: '例如 16:9、9:16、1:1。用于生成任务默认比例。' },
  { key: 'visual_style', label: '视觉风格', category: '视觉', promptRole: 'style', required: true, helper: '项目整体画风、质感、年代感和镜头观感。', multiline: true },
  { key: 'shot_size_system', label: '镜头大小体系', category: '镜头', promptRole: 'style', required: true, helper: '每行一个镜头尺度，例如远景、中景、近景、特写。', multiline: true, list: true },
  { key: 'camera_language', label: '镜头语言', category: '镜头', promptRole: 'style', required: true, helper: '运动、稳定性、构图、视角和镜头切换规则。', multiline: true },
  { key: 'lighting_style', label: '灯光规则', category: '视觉', promptRole: 'style', required: true, helper: '光源、明暗层次、曝光和氛围要求。', multiline: true },
  { key: 'color_palette', label: '色彩规则', category: '视觉', promptRole: 'style', required: true, helper: '主色、辅助色、饱和度和禁止色彩倾向。', multiline: true },
  { key: 'pacing_rules', label: '节奏规则', category: '叙事', promptRole: 'constraint', required: true, helper: '剪辑、情绪推进、镜头时长和段落节奏。', multiline: true },
  { key: 'negative_rules', label: '负面规则', category: '负面', promptRole: 'negative', required: true, helper: '每行一个禁止项，会进入负面约束。', multiline: true, list: true },
]

const PROMPT_ROLE_LABELS: Record<PromptRole, string> = {
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

const emptyRuleForm: ProjectPromptRuleForm = {
  key: '',
  label: '',
  category: '通用',
  value: '',
  prompt_role: 'constraint',
  enabled: true,
  required: false,
}

const STYLE_REFERENCE_RULE_KEY = 'style_reference_images'

const emptyData: WorkspaceData = {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function isProjectStandardsProposalHelperDraft(draft: AgentDraft) {
  if (draft.kind !== 'project_standards_proposal') return false
  const metadata = isRecord(draft.metadata) ? draft.metadata : {}
  return typeof metadata.sourceDraftId === 'string' && metadata.sourceDraftId.trim().length > 0
}

function parseProjectStandardsProposalDraft(draft: AgentDraft, pageKey?: string): ProjectStandardsProposalDraftView | null {
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

function buildProjectStyleApplyPayload(draft: AgentDraft) {
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

function splitListText(value: string) {
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

function coreStandardText(project: WorkspaceRecord | null | undefined, key: string) {
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

function projectPromptRules(project?: WorkspaceRecord | null) {
  const style = parseProjectStyleRecord(project)
  return asRecordArray(style.custom_rules)
    .map((item, index) => normalizeProjectPromptRule(item, index))
    .filter((item): item is ProjectPromptRule => Boolean(item))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

function projectPromptRulePayload(rules: ProjectPromptRule[]) {
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

function extractResourceIds(value: string) {
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

function buildStyleReferenceRule(resourceIds: number[], existing?: ProjectPromptRule): ProjectPromptRule {
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

function normalizeRuleForm(form: ProjectPromptRuleForm, order: number): ProjectPromptRule {
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

function buildProjectPromptPreview(project?: WorkspaceRecord | null) {
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

function parseProjectStyleDraftRows(draft: AgentDraft, project?: WorkspaceRecord | null): ProjectStyleDraftRow[] {
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

function parseProjectStyleRecord(project?: WorkspaceRecord | null): Record<string, unknown> {
  if (!project?.project_style) return {}
  try {
    const parsed = JSON.parse(project.project_style)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function projectStandardRows(project?: WorkspaceRecord | null): ProjectStyleDraftRow[] {
  return CORE_STANDARD_DEFS.map((item) => ({
    key: item.key,
    label: item.label,
    before: '',
    after: valueToPromptText(coreStandardValue(project, item.key)),
    changed: false,
    kind: 'core' as const,
  }))
}

function projectStandardMissingLabels(project?: WorkspaceRecord | null) {
  return projectStandardRows(project)
    .filter((row) => !row.after)
    .map((row) => row.label)
}

function projectStandardFilledCount(project?: WorkspaceRecord | null) {
  return projectStandardRows(project).filter((row) => row.after).length
}

function draftStatusVariant(status: AgentDraft['status']) {
  if (status === 'applied') return 'success' as const
  if (status === 'rejected') return 'danger' as const
  if (status === 'superseded') return 'outline' as const
  if (status === 'accepted') return 'secondary' as const
  return 'warning' as const
}

function draftStatusLabel(status: AgentDraft['status']) {
  const labels: Record<AgentDraft['status'], string> = {
    draft: '待应用',
    accepted: '已接受',
    rejected: '已拒绝',
    applied: '已应用',
    superseded: '已替代',
  }
  return labels[status] ?? status
}

function formatDate(value?: string) {
  if (!value) return ''
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return ''
  return `${time.getMonth() + 1}/${time.getDate()} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}

async function safeList(projectId: number, kind: SemanticEntityKind): Promise<WorkspaceRecord[]> {
  try {
    return await listSemanticEntities(projectId, semanticEntityConfig(kind)) as WorkspaceRecord[]
  } catch (error) {
    console.warn(`Failed to load project workspace entity: ${kind}`, error)
    return []
  }
}

async function loadWorkspaceData(projectId: number): Promise<WorkspaceData> {
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

function StatCard({ title, value, detail, icon: Icon }: StatCardProps) {
  return (
    <Card className="rounded-lg border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon size={17} />
        </span>
      </div>
    </Card>
  )
}

export default function ProjectStandardsPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const orchestrationToolCleanupRef = useRef<(() => void) | null>(null)
  const styleReferenceInputRef = useRef<HTMLInputElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [orchestrationPrompt, setOrchestrationPrompt] = useState('')
  const [launching, setLaunching] = useState(false)
  const [workspaceView, setWorkspaceView] = useState<'structure' | 'review'>('structure')
  const [applyingDraftId, setApplyingDraftId] = useState<string | null>(null)
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [editingCoreKey, setEditingCoreKey] = useState<string | null>(null)
  const [coreDraftValue, setCoreDraftValue] = useState('')
  const [savingCoreKey, setSavingCoreKey] = useState<string | null>(null)
  const [ruleForm, setRuleForm] = useState<ProjectPromptRuleForm | null>(null)
  const [savingRule, setSavingRule] = useState(false)
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
  const [uploadingStyleReferences, setUploadingStyleReferences] = useState(false)
  const [lastUploadedStyleReferences, setLastUploadedStyleReferences] = useState<RawResource[]>([])
  const openedDraftId = searchParams.get('draftId')?.trim() || ''

  const queryKey = ['project-workspace', projectId] as const

  const { data = emptyData, isFetching, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => loadWorkspaceData(projectId!),
    enabled: !!projectId,
  })

  const pageKey = useMemo(() => {
    if (!projectId) return undefined
    return buildPageKey({
      route: { pathname: ROUTES.project.standards },
      projectId,
      selection: { entityType: 'project', entityId: projectId, label: project?.name ?? `项目 #${projectId}` },
      labels: ['project-workspace', 'project-standards'],
    })
  }, [project?.name, projectId])

  useEffect(() => {
    setActiveDraftId(openedDraftId || null)
    if (openedDraftId) setWorkspaceView('review')
  }, [openedDraftId])

  useEffect(() => {
    return () => orchestrationToolCleanupRef.current?.()
  }, [])

  const draftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['project-workspace-drafts', projectId, pageKey, activeDraftId, openedDraftId],
    queryFn: async () => {
      if (!projectId || !pageKey) return []
      const scopedDraftId = openedDraftId || activeDraftId
      if (scopedDraftId) {
        const draft = await localAgentClient.getDraft(scopedDraftId)
        return draft.kind === 'project_standards_proposal' ? [draft] : []
      }
      const { drafts } = await localAgentClient.listDrafts({ projectId, kind: 'project_standards_proposal', pageKey, limit: 20 })
      return drafts
    },
    enabled: !!projectId && !!pageKey,
    refetchInterval: (openedDraftId || activeDraftId) ? 1500 : false,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    if (openedDraftId || activeDraftId) return
    const firstProjectStandardsProposalDraft = draftsQuery.data?.find((draft) => draft.kind === 'project_standards_proposal')
    if (!firstProjectStandardsProposalDraft) return
    setActiveDraftId(firstProjectStandardsProposalDraft.id)
    setWorkspaceView('review')
  }, [activeDraftId, draftsQuery.data, openedDraftId])

  const draftCounts = useMemo(() => {
    const drafts = (draftsQuery.data ?? []).filter((draft) => !isProjectStandardsProposalHelperDraft(draft))
    return {
      draft: drafts.filter((item) => item.status === 'draft').length,
      applied: drafts.filter((item) => item.status === 'applied').length,
    }
  }, [draftsQuery.data])

  async function startProjectOrchestration(promptOverride?: string) {
    if (!projectId || !pageKey) return
    const requestedPrompt = typeof promptOverride === 'string' ? promptOverride : orchestrationPrompt
    setLaunching(true)
    try {
      const draftShell = await localAgentClient.createDraft({
        projectId,
        kind: 'project_standards_proposal',
        title: `项目规范提案草稿 - ${project?.name ?? `#${projectId}`}`,
        content: JSON.stringify(buildEmptyProjectStandardsProposalDraftContent({
          projectId,
          mode: 'snapshot',
          projectStyle: buildDefaultProjectStylePatch(),
          createdAt: new Date().toISOString(),
          summary: '请定义项目级制作规范：固定 8 项和按需扩展的提示词规则。',
        }), null, 2),
        source: {
          entityType: 'project',
          entityId: projectId,
          pageKey,
          pageType: 'project_standards',
          pageRoute: ROUTES.project.standards,
        },
        target: {
          projectId,
          entityType: 'project',
          entityId: projectId,
          field: 'project_style',
        },
        metadata: {
          pageOwned: true,
          proposalScope: 'project_standards',
          proposalMode: 'snapshot',
          backendApply: 'project_standards_proposal',
        },
      })
      setActiveDraftId(draftShell.id)
      setWorkspaceView('review')
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.set('draftId', draftShell.id)
        return next
      }, { replace: true })

      const requestId = `project_orchestrate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const userMessage = requestedPrompt || `请基于已写入 draft 的空模板，为项目「${project?.name ?? `#${projectId}`}」制定项目级制作规范。填写 proposal.project_style：保留并补齐固定字段 aspect_ratio、shot_size_system、camera_language、visual_style、lighting_style、color_palette、pacing_rules、negative_rules；也可以按项目需要新增 custom_rules，每条包含 key、label、category、value、prompt_role、enabled、required、order。若项目需要用图片固定画风，请用 custom_rules 实现：新增 enabled=true、prompt_role="style" 的画风参考规则，在 value 中写明参考图片的 resource#ID 或 reference_resource_ids，并说明这些图片用于画风、质感、色彩、线条、光影参考；后续生成图片/视频时应把这些资源 ID 作为 reference_resource_ids 传给支持参考图的生成工具。不要创建设定资料或素材需求。`

      orchestrationToolCleanupRef.current?.()
      orchestrationToolCleanupRef.current = registerAgentPanelPageTool(requestId, async (payload) => {
        if (payload.run?.status === 'failed' || payload.run?.status === 'cancelled') {
          await draftsQuery.refetch()
          return
        }
        const latestDraftArtifact = selectLatestDraftArtifact(payload.artifacts, 'project_standards_proposal')
        const nextDraftId = latestDraftArtifact?.draftId || draftShell.id
        setActiveDraftId(nextDraftId)
        setSearchParams((current) => {
          const next = new URLSearchParams(current)
          next.set('draftId', nextDraftId)
          return next
        }, { replace: true })
        await draftsQuery.refetch()
      })

      openAgentPanelDraft({
        requestId,
        taskType: 'project_standards_proposal',
        message: `请制定项目规范：${project?.name ?? `#${projectId}`}`,
        title: `项目规范提案: ${project?.name ?? `#${projectId}`}`,
        newConversation: true,
        autoSend: true,
        projectId,
        clientInput: buildCommandFirstClientInput({
          message: userMessage,
          labels: ['project-workspace', 'project-standards', 'draft-review'],
          hints: {
            projectId,
            draftId: draftShell.id,
            route: { pathname: ROUTES.project.standards },
            selection: { entityType: 'project', entityId: projectId, label: project?.name ?? `项目 #${projectId}` },
          },
        }),
        runPolicy: { maxToolCalls: 16, maxIterations: 10 },
        timeoutMs: 180_000,
        renderMode: 'page',
      })
      toast.info('已打开项目规范提案会话；AI 生成的草稿会回到审阅区')
      await draftsQuery.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '项目规范提案启动失败')
    } finally {
      setLaunching(false)
    }
  }

  async function applyDraft(draft: AgentDraft) {
    if (!projectId) return
    if (draft.kind === 'project_standards_proposal') {
      setApplyingDraftId(draft.id)
      try {
        const proposedValue = buildProjectStyleApplyPayload(draft)
        await localAgentClient.updateDraft(draft.id, {
          metadata: {
            ...(isRecord(draft.metadata) ? draft.metadata : {}),
            reviewedFrom: 'project-standards-workbench',
            reviewedAt: new Date().toISOString(),
          },
        })
        try {
          await localAgentClient.applyDraft(draft.id, {
            target: {
              projectId,
              entityType: 'project',
              entityId: projectId,
              field: 'proposal',
            },
            currentValue: {
              aspect_ratio: data.project?.aspect_ratio ?? '',
              visual_style: data.project?.visual_style ?? '',
              project_style: data.project?.project_style ?? '',
            },
            proposedValue,
          })
        } catch (error) {
          await applyProjectStandardsProposal(projectId, JSON.parse(proposedValue) as Record<string, unknown>)
          await localAgentClient.updateDraft(draft.id, {
            status: 'applied',
            target: {
              projectId,
              entityType: 'project',
              entityId: projectId,
              field: 'proposal',
            },
            metadata: {
              ...(isRecord(draft.metadata) ? draft.metadata : {}),
              reviewedFrom: 'project-standards-workbench',
              reviewedAt: new Date().toISOString(),
              backendWritePerformed: true,
              backendApplyFallback: error instanceof Error ? error.message : String(error),
            },
          })
        }
        const nextProject = await getProject(projectId)
        useProjectStore.getState().setCurrent(nextProject)
        toast.success('项目规范已写入后端')
        await refetch()
        await draftsQuery.refetch()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '应用项目规范提案失败')
      } finally {
        setApplyingDraftId(null)
      }
      return
    }
  }

  function refreshAll() {
    void refetch()
    void draftsQuery.refetch()
  }

  const drafts = (draftsQuery.data ?? []).filter((draft) => !isProjectStandardsProposalHelperDraft(draft))

  const filledStandardCount = projectStandardFilledCount(data.project)
  const missingStandardLabels = projectStandardMissingLabels(data.project)
  const customRules = useMemo(() => projectPromptRules(data.project), [data.project])
  const enabledCustomRules = customRules.filter((rule) => rule.enabled)
  const enabledRuleCount = filledStandardCount + enabledCustomRules.length
  const promptPreview = useMemo(() => buildProjectPromptPreview(data.project), [data.project])
  const styleReferenceRule = customRules.find((rule) => rule.key === STYLE_REFERENCE_RULE_KEY)
  const styleReferenceIds = useMemo(() => extractResourceIds(styleReferenceRule?.value ?? ''), [styleReferenceRule?.value])
  const uploadedStyleReferencesById = useMemo(() => new Map(lastUploadedStyleReferences.map((resource) => [resource.ID, resource])), [lastUploadedStyleReferences])

  async function saveProjectStylePatch(projectStyle: Record<string, unknown>, successMessage: string) {
    if (!projectId) return
    await applyProjectStandardsProposal(projectId, {
      scope: 'project_standards_proposal',
      mode: 'patch',
      proposal: {
        project_style: projectStyle,
      },
    })
    const nextProject = await getProject(projectId)
    useProjectStore.getState().setCurrent(nextProject)
    await refetch()
    toast.success(successMessage)
  }

  function openCoreEditor(key: string) {
    setEditingCoreKey(key)
    setCoreDraftValue(coreStandardText(data.project, key))
  }

  async function saveCoreStandard(def: CoreStandardDef) {
    if (!projectId) return
    setSavingCoreKey(def.key)
    try {
      const value = def.list ? splitListText(coreDraftValue) : coreDraftValue.trim()
      await saveProjectStylePatch({ [def.key]: value }, '核心规范已保存')
      setEditingCoreKey(null)
      setCoreDraftValue('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存核心规范失败')
    } finally {
      setSavingCoreKey(null)
    }
  }

  function openNewRuleForm() {
    setRuleForm({ ...emptyRuleForm })
  }

  function openEditRuleForm(rule: ProjectPromptRule) {
    setRuleForm({
      id: rule.id,
      key: rule.key,
      label: rule.label,
      category: rule.category,
      value: rule.value,
      prompt_role: rule.prompt_role,
      enabled: rule.enabled,
      required: rule.required,
    })
  }

  async function saveRuleForm() {
    if (!projectId || !ruleForm) return
    const normalized = normalizeRuleForm(ruleForm, ruleForm.id
      ? customRules.find((rule) => rule.id === ruleForm.id)?.order ?? (customRules.length + 1) * 10
      : (customRules.length + 1) * 10)
    if (!normalized.value) {
      toast.error('请填写规范内容')
      return
    }
    setSavingRule(true)
    try {
      const exists = customRules.some((rule) => rule.id === normalized.id)
      const nextRules = exists
        ? customRules.map((rule) => rule.id === normalized.id ? normalized : rule)
        : [...customRules, normalized]
      await saveProjectStylePatch({ custom_rules: projectPromptRulePayload(nextRules) }, exists ? '扩展规范已更新' : '扩展规范已新增')
      setRuleForm(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存扩展规范失败')
    } finally {
      setSavingRule(false)
    }
  }

  async function toggleRule(rule: ProjectPromptRule) {
    if (!projectId) return
    const nextRules = customRules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item)
    try {
      await saveProjectStylePatch({ custom_rules: projectPromptRulePayload(nextRules) }, rule.enabled ? '规范已停用' : '规范已启用')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新规范状态失败')
    }
  }

  async function deleteRule(rule: ProjectPromptRule) {
    if (!projectId) return
    setDeletingRuleId(rule.id)
    try {
      const nextRules = customRules.filter((item) => item.id !== rule.id)
      await saveProjectStylePatch({ custom_rules: projectPromptRulePayload(nextRules) }, '扩展规范已删除')
      if (ruleForm?.id === rule.id) setRuleForm(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除扩展规范失败')
    } finally {
      setDeletingRuleId(null)
    }
  }

  async function uploadStyleReferenceImages(files: FileList | null) {
    if (!projectId || !files || files.length === 0) return
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      toast.error('请选择图片文件')
      return
    }
    setUploadingStyleReferences(true)
    try {
      const uploaded: RawResource[] = []
      for (const file of imageFiles) {
        const fd = new FormData()
        fd.append('file', file)
        const resource = await api.post('/resources/upload', fd).then((r) => r.data as RawResource)
        uploaded.push(resource)
      }
      const existingIds = extractResourceIds(styleReferenceRule?.value ?? '')
      const nextRule = buildStyleReferenceRule([...existingIds, ...uploaded.map((resource) => resource.ID)], styleReferenceRule)
      const nextRules = styleReferenceRule
        ? customRules.map((rule) => rule.id === styleReferenceRule.id ? nextRule : rule)
        : [nextRule, ...customRules]
      setLastUploadedStyleReferences((current) => {
        const byId = new Map(current.map((resource) => [resource.ID, resource]))
        for (const resource of uploaded) byId.set(resource.ID, resource)
        return Array.from(byId.values())
      })
      await saveProjectStylePatch({ custom_rules: projectPromptRulePayload(nextRules) }, `已上传 ${uploaded.length} 张画风参考图`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传画风参考图失败')
    } finally {
      setUploadingStyleReferences(false)
      if (styleReferenceInputRef.current) styleReferenceInputRef.current.value = ''
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border bg-card px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Layers3 size={13} />
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={12} />
              <span>项目规范</span>
              <Badge variant="secondary" className="h-6 rounded-full px-2 text-[10px]">
                backend apply
              </Badge>
              {isFetching ? <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px]">同步中</Badge> : null}
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-normal text-foreground">项目规范库</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => startProjectOrchestration()} loading={launching} disabled={!projectId}>
              <Wand2 size={13} />
              发起提案
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={refreshAll}>
              <RefreshCw size={13} className={isFetching || draftsQuery.isFetching ? 'animate-spin' : undefined} />
              刷新
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-h-0 flex-1 overflow-auto bg-muted/20">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              加载项目现状…
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 lg:p-5">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard title="核心规范完成度" value={`${filledStandardCount}/8`} detail={missingStandardLabels.length > 0 ? `缺失 ${missingStandardLabels.length} 项必选规范` : '固定规范已覆盖'} icon={Route} />
                <StatCard title="启用规范" value={enabledRuleCount} detail={`${enabledCustomRules.length} 条扩展规范会进入提示词`} icon={BookOpen} />
                <StatCard title="扩展规范" value={customRules.length} detail="支持任意 key/value、分类和提示词角色" icon={Sparkles} />
                <StatCard title="待审阅提案" value={draftCounts.draft} detail="AI 生成的规范变更在审阅区应用" icon={PackageCheck} />
              </section>

              <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-muted/90 px-4 py-3 backdrop-blur lg:-mx-5 lg:px-5">
                <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1 rounded-full border border-border bg-background p-1">
                    <Button
                      size="sm"
                      variant={workspaceView === 'structure' ? 'secondary' : 'ghost'}
                      className="h-7 gap-1.5 rounded-full px-3 text-xs"
                      onClick={() => setWorkspaceView('structure')}
                    >
                      <Route size={13} />
                      主视图
                    </Button>
                    <Button
                      size="sm"
                      variant={workspaceView === 'review' ? 'secondary' : 'ghost'}
                      className="h-7 gap-1.5 rounded-full px-3 text-xs"
                      onClick={() => setWorkspaceView('review')}
                    >
                      <GitBranch size={13} />
                      审阅
                      <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[10px]">{draftCounts.draft}</Badge>
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Badge variant={workspaceView === 'review' ? 'secondary' : 'outline'} className="h-6 rounded-full px-2 text-[10px]">
                      {workspaceView === 'review' ? '规范审阅' : '项目规范库'}
                    </Badge>
                    <span>{workspaceView === 'review' ? '审阅并写入项目级固定规范和扩展规范' : '核心规范必填，扩展规范按需进入提示词'}</span>
                  </div>
                </div>
              </div>

              {workspaceView === 'structure' && (
                <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.78fr)]">
                  <div className="min-w-0 space-y-4">
                    <Card className="min-h-0 overflow-hidden rounded-lg border-border bg-card p-4 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="text-sm font-semibold text-foreground">核心规范</h2>
                            <p className="mt-1 text-xs text-muted-foreground">固定 8 项为必选规范，直接写入 Project 全局字段和 project_style。</p>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => startProjectOrchestration('请为当前项目制定项目级制作规范：补齐固定 8 项，并按需要新增 custom_rules。custom_rules 每条要包含 key、label、category、value、prompt_role、enabled、required、order。如果需要用图片固定画风，请新增 prompt_role="style" 的 custom_rules，在 value 中记录参考图 resource#ID 或 reference_resource_ids，并说明后续图片/视频生成要把这些 ID 作为 reference_resource_ids 用于画风参考。不要创建设定资料或素材需求。')}>
                            <Wand2 size={12} />
                            让 AI 制定
                          </Button>
                        </div>

                        <div className="mt-4 grid gap-2 md:grid-cols-2">
                          {CORE_STANDARD_DEFS.map((def) => {
                            const value = coreStandardText(data.project, def.key)
                            const editing = editingCoreKey === def.key
                            return (
                              <div key={def.key} className={cn(
                                'rounded-md border px-3 py-2',
                                value ? 'border-border bg-background' : 'border-dashed border-amber-500/40 bg-amber-500/5',
                              )}>
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className="text-xs font-medium text-foreground">{def.label}</p>
                                      <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[9px]">{def.category}</Badge>
                                      <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[9px]">{PROMPT_ROLE_LABELS[def.promptRole]}</Badge>
                                      <Badge variant={value ? 'success' : 'warning'} className="h-5 rounded-full px-1.5 text-[9px]">{value ? '已设置' : '缺失'}</Badge>
                                    </div>
                                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{def.helper}</p>
                                  </div>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0" onClick={() => editing ? setEditingCoreKey(null) : openCoreEditor(def.key)}>
                                    {editing ? <X size={13} /> : <Pencil size={13} />}
                                  </Button>
                                </div>
                                {editing ? (
                                  <div className="mt-2 space-y-2">
                                    {def.multiline ? (
                                      <Textarea value={coreDraftValue} onChange={(event) => setCoreDraftValue(event.target.value)} className="min-h-24 text-xs" placeholder={def.helper} />
                                    ) : (
                                      <Input value={coreDraftValue} onChange={(event) => setCoreDraftValue(event.target.value)} className="h-8 text-xs" placeholder={def.helper} />
                                    )}
                                    <div className="flex justify-end gap-1.5">
                                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingCoreKey(null)}>取消</Button>
                                      <Button size="sm" className="h-7 gap-1.5 text-xs" loading={savingCoreKey === def.key} onClick={() => saveCoreStandard(def)}>
                                        <Save size={12} />
                                        保存
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-foreground">{value || '未设置'}</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                    </Card>

                    <Card className="min-h-0 overflow-hidden rounded-lg border-border bg-card p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><ImagePlus size={14} />全局画风参考图</h2>
                          <p className="mt-1 text-xs text-muted-foreground">上传后会写入 style_reference_images 规则，后续图片/视频生成可作为 reference_resource_ids 使用。</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            ref={styleReferenceInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(event) => uploadStyleReferenceImages(event.target.files)}
                          />
                          <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => styleReferenceInputRef.current?.click()} loading={uploadingStyleReferences} disabled={!projectId}>
                            <Upload size={12} />
                            上传参考图
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3">
                        {styleReferenceIds.length === 0 ? (
                          <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground">
                            尚未设置画风参考图。上传图片后会自动生成全局画风规则。
                          </div>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {styleReferenceIds.map((id) => {
                              const uploaded = uploadedStyleReferencesById.get(id)
                              return (
                                <div key={id} className="overflow-hidden rounded-md border border-border bg-background">
                                  <div className="aspect-video bg-muted">
                                    <AuthedImage src={`/api/v1/resources/${id}/file`} alt={uploaded?.name ?? `resource#${id}`} className="h-full w-full object-cover" />
                                  </div>
                                  <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                                    <p className="min-w-0 truncate text-[10px] text-foreground">{uploaded?.name ?? `resource#${id}`}</p>
                                    <Badge variant="secondary" className="shrink-0 text-[9px]">#{id}</Badge>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {styleReferenceRule ? (
                        <p className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-2 text-[10px] leading-4 text-muted-foreground">{styleReferenceRule.value}</p>
                      ) : null}
                    </Card>

                    <Card className="min-h-0 overflow-hidden rounded-lg border-border bg-card p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-sm font-semibold text-foreground">扩展规范</h2>
                          <p className="mt-1 text-xs text-muted-foreground">用任意 key/value 补充角色、台词、平台禁忌、审核口径等项目规则。</p>
                        </div>
                        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={openNewRuleForm}>
                          <Plus size={12} />
                          新增规范
                        </Button>
                      </div>

                      {ruleForm && (
                        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                          <div className="grid gap-2 md:grid-cols-2">
                            <label className="space-y-1 text-[10px] font-medium text-muted-foreground">
                              名称
                              <Input value={ruleForm.label} onChange={(event) => setRuleForm({ ...ruleForm, label: event.target.value })} className="h-8 text-xs" placeholder="角色一致性" />
                            </label>
                            <label className="space-y-1 text-[10px] font-medium text-muted-foreground">
                              Key
                              <Input value={ruleForm.key} onChange={(event) => setRuleForm({ ...ruleForm, key: event.target.value })} className="h-8 font-mono text-xs" placeholder="character_consistency" />
                            </label>
                            <label className="space-y-1 text-[10px] font-medium text-muted-foreground">
                              分类
                              <Input value={ruleForm.category} onChange={(event) => setRuleForm({ ...ruleForm, category: event.target.value })} className="h-8 text-xs" placeholder="人物 / 审核 / 平台 / 交付" />
                            </label>
                            <label className="space-y-1 text-[10px] font-medium text-muted-foreground">
                              提示词角色
                              <Select value={ruleForm.prompt_role} onValueChange={(value) => setRuleForm({ ...ruleForm, prompt_role: value as PromptRole })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {Object.entries(PROMPT_ROLE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </label>
                          </div>
                          <label className="mt-2 block space-y-1 text-[10px] font-medium text-muted-foreground">
                            规范内容
                            <Textarea value={ruleForm.value} onChange={(event) => setRuleForm({ ...ruleForm, value: event.target.value })} className="min-h-24 text-xs" placeholder="写清楚会进入提示词的项目级规则。" />
                          </label>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                              <label className="inline-flex items-center gap-1.5">
                                <input type="checkbox" checked={ruleForm.enabled} onChange={(event) => setRuleForm({ ...ruleForm, enabled: event.target.checked })} />
                                启用
                              </label>
                              <label className="inline-flex items-center gap-1.5">
                                <input type="checkbox" checked={ruleForm.required} onChange={(event) => setRuleForm({ ...ruleForm, required: event.target.checked })} />
                                标记必选
                              </label>
                            </div>
                            <div className="flex gap-1.5">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRuleForm(null)}>取消</Button>
                              <Button size="sm" className="h-7 gap-1.5 text-xs" loading={savingRule} onClick={saveRuleForm}>
                                <Save size={12} />
                                保存规范
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-3 space-y-2">
                        {customRules.length === 0 ? (
                          <EmptyBlock compact title="暂无扩展规范" detail="新增一条规范后，它会按启用状态进入提示词预览。" />
                        ) : customRules.map((rule) => (
                          <div key={rule.id} className={cn('rounded-md border p-3', rule.enabled ? 'border-border bg-background' : 'border-dashed border-border bg-muted/30 opacity-80')}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p className="text-xs font-semibold text-foreground">{rule.label}</p>
                                  <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[9px]">{rule.category}</Badge>
                                  <Badge variant="secondary" className="h-5 rounded-full px-1.5 text-[9px]">{PROMPT_ROLE_LABELS[rule.prompt_role]}</Badge>
                                  {rule.required ? <Badge variant="warning" className="h-5 rounded-full px-1.5 text-[9px]">必选</Badge> : null}
                                  <Badge variant={rule.enabled ? 'success' : 'outline'} className="h-5 rounded-full px-1.5 text-[9px]">{rule.enabled ? '启用' : '停用'}</Badge>
                                </div>
                                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{rule.key}</p>
                                <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-foreground">{rule.value || '未填写'}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => toggleRule(rule)}>{rule.enabled ? '停用' : '启用'}</Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditRuleForm(rule)} title="编辑规范"><Pencil size={13} /></Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" loading={deletingRuleId === rule.id} onClick={() => deleteRule(rule)} title="删除规范"><Trash2 size={13} /></Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>

                  <Card className="min-h-0 self-start overflow-hidden rounded-lg border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Eye size={14} />提示词预览</h2>
                        <p className="mt-1 text-xs text-muted-foreground">这里展示最终会注入模型的项目规范片段。</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">{enabledRuleCount} 条启用</Badge>
                    </div>
                    <pre className="mt-3 max-h-[620px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs leading-5 text-foreground">{promptPreview}</pre>
                  </Card>
                </section>
              )}

              {workspaceView === 'review' && (
                <section className="min-w-0 space-y-4">
                  <Card className="min-h-0 overflow-hidden rounded-lg border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">项目规范审阅</h2>
                        <p className="mt-1 text-xs text-muted-foreground">审阅 project_standards_proposal 中的 project_style，包含固定规范和扩展 custom_rules。</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">draft {draftCounts.draft}</Badge>
                    </div>

                    <div className="mt-3 min-h-0 space-y-3 overflow-y-auto">
                      {draftsQuery.isLoading ? (
                        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-3 text-xs text-muted-foreground">
                          <Loader2 size={12} className="animate-spin" />
                          读取草稿…
                        </div>
                      ) : drafts.length === 0 ? (
                        <EmptyBlock title="暂无项目规范草稿" detail="从上方发起项目规范提案后，AI 对核心规范和扩展规则的建议会进入这里审阅。" />
                      ) : drafts.map((draft) => {
                        const proposalView = parseProjectStandardsProposalDraft(draft, pageKey)
                        const styleRows = parseProjectStyleDraftRows(draft, data.project)

                        return (
                          <div key={draft.id} className="rounded-lg border border-border bg-background p-3 last:mb-0">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-foreground">{draft.title}</p>
                                <p className="mt-1 text-[10px] text-muted-foreground">{formatDate(draft.updatedAt)} · {draft.id}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={draftStatusVariant(draft.status)} className="shrink-0 text-[10px]">{draftStatusLabel(draft.status)}</Badge>
                                <Badge variant="outline" className="text-[10px]">{styleRows.length} 条标准</Badge>
                              </div>
                            </div>

                            {proposalView ? (
                              <div className="mt-3 space-y-3">
                                <div className="rounded-md border border-sky-500/20 bg-sky-500/5 p-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-medium text-foreground">项目规范提案</p>
                                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{proposalView.summary}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                      <Badge variant="secondary" className="h-5 rounded-full px-1.5">{styleRows.length} 条规范</Badge>
                                      <Badge variant="outline" className="h-5 rounded-full px-1.5">写入 Project</Badge>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <p className="text-[10px] text-muted-foreground">提交后会写入 Project.aspect_ratio、Project.visual_style 和完整 project_style JSON，包括 custom_rules。</p>
                                    <div className="flex gap-1.5">
                                      <Button
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        onClick={() => applyDraft(draft)}
                                        loading={applyingDraftId === draft.id}
                                        disabled={draft.status === 'applied' || draft.status === 'accepted' || styleRows.length === 0}
                                      >
                                        <CheckCircle2 size={12} />
                                        应用规范
                                      </Button>
                                    </div>
                                  </div>
                                </div>

                                {styleRows.length > 0 ? (
                                  <div className="grid gap-2 md:grid-cols-2">
                                    {styleRows.map((row) => (
                                      <div key={row.key} className="rounded-md border border-border bg-card px-3 py-2">
                                        <p className="text-[10px] font-medium text-muted-foreground">{row.label}</p>
                                        <div className="mt-1 flex items-start gap-1.5 text-[10px] leading-4">
                                          <span className="min-w-0 flex-1 truncate text-muted-foreground line-through">{row.before || '未设置'}</span>
                                          <ArrowRight size={9} className="mt-0.5 shrink-0 text-muted-foreground" />
                                          <span className={cn('min-w-0 flex-1 whitespace-pre-wrap', row.changed ? 'text-foreground' : 'text-muted-foreground')}>{row.after}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-[10px] text-muted-foreground">
                                    这份草稿还没有填写 project_style。
                                  </div>
                                )}

                                {proposalView.impactNotes.length > 0 ? (
                                  <div className="space-y-1 rounded-md border border-border bg-background/70 p-2">
                                    <p className="text-[10px] font-medium text-foreground">影响说明</p>
                                    {proposalView.impactNotes.slice(0, 4).map((note, index) => (
                                      <p key={`${draft.id}-impact-${index}`} className="text-[10px] leading-4 text-muted-foreground">{note}</p>
                                    ))}
                                  </div>
                                ) : null}

                                <div className="rounded-md border border-border bg-muted/20 p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[10px] font-medium text-foreground">历史</p>
                                    <Button size="sm" variant="outline" className="h-6 gap-1.5 px-2 text-[10px]" asChild>
                                      <Link to={ROUTES.agentDrafts}>
                                        <FileText size={12} />
                                        查看全部
                                      </Link>
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 rounded-md border border-dashed border-border bg-background px-3 py-4 text-[10px] text-muted-foreground">
                                无法解析这份草稿的差异。
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                </section>
              )}
            </div>
          )}
        </main>
      </div>

    </div>
  )
}

function EmptyBlock({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
  return (
    <div className={cn('rounded-md border border-dashed border-border bg-background text-center', compact ? 'px-3 py-4' : 'px-4 py-6')}>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  )
}
