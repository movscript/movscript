import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  GitBranch,
  Layers,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react'

import { api } from '@/lib/api'
import { buildCommandFirstClientInput } from '@/lib/agentCommandInput'
import { openAgentPanelDraft } from '@/lib/agentPanelBridge'
import { apiErrorMessage } from '@/lib/contentWorkbenchStatus'
import { byOrder, clampProgress, dedupeRecords, firstText, titleOfRecord } from '@/lib/contentWorkbenchRecordUtils'
import { cn } from '@/lib/utils'
import { workbenchScenarios, type WorkbenchScenarioPriority as Priority, type WorkbenchScenarioStatus as WorkStatus } from '@/lib/workbenchScenarios'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'
import type { Script } from '@/types'
import { Badge, Button, Card, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@movscript/ui'
import { listSemanticEntities, semanticEntityConfig, updateSemanticEntity, type SemanticEntityRecord } from '@/api/semanticEntities'
import { ROUTES, mergeSearch } from '@/routes/projectRoutes'
import {
  ContextStack,
  GateChecklist,
  MetricStrip,
  ProjectWorkbenchShell,
  QueueMiniMetric,
  SpecializedQueue,
  type WorkbenchMetric,
} from './WorkbenchChrome'
import { WorkbenchPanel } from './WorkbenchPanel'

type WorkbenchRecord = SemanticEntityRecord & Record<string, any>

function EmptyWorkbenchState({ title, text }: { title: string; text: string }) {
  return (
    <Card className="rounded-lg border-dashed border-border bg-card p-8 text-center">
      <p className="type-body font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md type-body leading-6 text-muted-foreground">{text}</p>
    </Card>
  )
}

interface SettingPrepData {
  productions: WorkbenchRecord[]
  scripts: Script[]
  scriptVersions: WorkbenchRecord[]
  segments: WorkbenchRecord[]
  sceneMoments: WorkbenchRecord[]
  creativeReferences: WorkbenchRecord[]
  creativeReferenceStates: WorkbenchRecord[]
  creativeReferenceUsages: WorkbenchRecord[]
  creativeRelationships: WorkbenchRecord[]
  assetSlots: WorkbenchRecord[]
  contentUnits: WorkbenchRecord[]
}

interface SettingPrepRow {
  id: string
  title: string
  kind: string
  status: WorkStatus
  rawStatus: string
  priority: Priority
  progress: number
  readinessLabel: string
  scope: string
  missing: string[]
  warnings: string[]
  record: WorkbenchRecord
  states: WorkbenchRecord[]
  usages: WorkbenchRecord[]
  relationships: WorkbenchRecord[]
  assetSlots: WorkbenchRecord[]
  linkedSegments: WorkbenchRecord[]
  linkedSceneMoments: WorkbenchRecord[]
  linkedContentUnits: WorkbenchRecord[]
  linkedProductions: WorkbenchRecord[]
}

async function safeWorkbenchList(projectId: number, kind: Parameters<typeof semanticEntityConfig>[0]): Promise<WorkbenchRecord[]> {
  try {
    return await listSemanticEntities(projectId, semanticEntityConfig(kind)) as WorkbenchRecord[]
  } catch (error) {
    console.warn(`Failed to load workbench entity: ${kind}`, error)
    return []
  }
}

async function loadSettingPrepData(projectId: number): Promise<SettingPrepData> {
  const [
    productions,
    scripts,
    scriptVersions,
    segments,
    sceneMoments,
    creativeReferences,
    creativeReferenceStates,
    creativeReferenceUsages,
    creativeRelationships,
    assetSlots,
    contentUnits,
  ] = await Promise.all([
    safeWorkbenchList(projectId, 'productions'),
    api.get<Script[]>(`/projects/${projectId}/scripts`).then((r) => r.data).catch(() => []),
    safeWorkbenchList(projectId, 'scriptVersions'),
    safeWorkbenchList(projectId, 'segments'),
    safeWorkbenchList(projectId, 'sceneMoments'),
    safeWorkbenchList(projectId, 'creativeReferences'),
    safeWorkbenchList(projectId, 'creativeReferenceStates'),
    safeWorkbenchList(projectId, 'creativeReferenceUsages'),
    safeWorkbenchList(projectId, 'creativeRelationships'),
    safeWorkbenchList(projectId, 'assetSlots'),
    safeWorkbenchList(projectId, 'contentUnits'),
  ])
  return {
    productions,
    scripts,
    scriptVersions,
    segments,
    sceneMoments,
    creativeReferences,
    creativeReferenceStates,
    creativeReferenceUsages,
    creativeRelationships,
    assetSlots,
    contentUnits,
  }
}

function normalizeCreativeReferenceStatus(status?: string) {
  if (status === 'confirmed' || status === 'locked' || status === 'ignored' || status === 'merged') return status
  return 'draft'
}

function creativeReferenceStatusLabel(status?: string) {
  const normalized = normalizeCreativeReferenceStatus(status)
  if (normalized === 'confirmed') return '已确认'
  if (normalized === 'locked') return '已锁定'
  if (normalized === 'ignored') return '已忽略'
  if (normalized === 'merged') return '已合并'
  return '草稿'
}

function creativeReferenceStatusVariant(status?: string) {
  const normalized = normalizeCreativeReferenceStatus(status)
  if (normalized === 'confirmed' || normalized === 'locked' || normalized === 'merged') return 'success' as const
  if (normalized === 'ignored') return 'outline' as const
  return 'warning' as const
}

function creativeUsageStatusLabel(status?: string) {
  if (status === 'confirmed') return '已确认'
  if (status === 'corrected') return '已修正'
  if (status === 'ignored') return '已忽略'
  if (status === 'draft') return '草稿'
  return firstText(status, '未设置')
}

function creativeUsageStatusVariant(status?: string) {
  if (status === 'confirmed' || status === 'corrected') return 'success' as const
  if (status === 'ignored') return 'outline' as const
  if (status === 'draft') return 'warning' as const
  return 'outline' as const
}

function creativeReferenceWorkStatus(status?: string): WorkStatus {
  const normalized = normalizeCreativeReferenceStatus(status)
  if (normalized === 'ignored') return 'blocked'
  if (normalized === 'draft') return 'review'
  return 'ready'
}

function creativeReferenceKindLabel(kind?: string) {
  if (kind === 'person') return '人物'
  if (kind === 'character') return '人物'
  if (kind === 'place') return '地点'
  if (kind === 'location') return '地点'
  if (kind === 'scene') return '场景'
  if (kind === 'prop') return '道具'
  if (kind === 'product') return '产品'
  if (kind === 'brand') return '品牌'
  if (kind === 'style') return '风格'
  if (kind === 'world_rule') return '世界规则'
  if (kind === 'time_period') return '时间段'
  if (kind === 'restriction') return '限制'
  return firstText(kind, '设定')
}

function parseCreativeProfileJSON(profileJSON?: string) {
  const raw = firstText(profileJSON, '')
  if (!raw) return { profileJson: '', visualIntent: '' }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { profileJson: raw, visualIntent: '' }
    }
    const data = parsed as Record<string, unknown>
    const visualIntent = firstText(data.visual_intent, data.visualIntent, data.visual_notes, '')
    const cleaned = { ...data }
    delete cleaned.visual_intent
    delete cleaned.visualIntent
    delete cleaned.visual_notes
    return {
      profileJson: Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned, null, 2) : '',
      visualIntent,
    }
  } catch {
    return { profileJson: raw, visualIntent: '' }
  }
}

function composeCreativeProfileJSON(profileJson: string, visualIntent: string) {
  const trimmedProfile = profileJson.trim()
  const trimmedVisual = visualIntent.trim()
  if (!trimmedProfile && !trimmedVisual) return ''
  try {
    const parsed = trimmedProfile ? JSON.parse(trimmedProfile) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid profile json')
    const next = { ...(parsed as Record<string, unknown>) }
    if (trimmedVisual) next.visual_intent = trimmedVisual
    else {
      delete next.visual_intent
      delete next.visualIntent
      delete next.visual_notes
    }
    return JSON.stringify(next, null, 2)
  } catch {
    if (!trimmedVisual) return trimmedProfile
    return JSON.stringify({
      raw_profile: trimmedProfile,
      visual_intent: trimmedVisual,
    }, null, 2)
  }
}

function buildSettingPrepForm(record: WorkbenchRecord) {
  const profile = parseCreativeProfileJSON(record.profile_json)
  return {
    name: firstText(record.name, record.title, record.label, ''),
    alias: firstText(record.alias, ''),
    kind: firstText(record.kind, 'person'),
    importance: firstText(record.importance, 'supporting'),
    status: normalizeCreativeReferenceStatus(record.status),
    description: firstText(record.description, ''),
    content: firstText(record.content, ''),
    visualIntent: profile.visualIntent,
    profileJson: profile.profileJson,
    tagsJson: firstText(record.tags_json, ''),
  }
}

function buildSettingPrepUsageSummary(record: SettingPrepRow | null) {
  if (!record) return '暂无使用上下文'
  const productions = record.linkedProductions.slice(0, 2).map((item) => titleOfRecord(item))
  const segments = record.linkedSegments.slice(0, 2).map((item) => titleOfRecord(item))
  const moments = record.linkedSceneMoments.slice(0, 2).map((item) => titleOfRecord(item))
  const parts = [
    productions.length > 0 ? `制作 ${productions.join('、')}` : null,
    segments.length > 0 ? `编排段 ${segments.join('、')}` : null,
    moments.length > 0 ? `情景 ${moments.join('、')}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : '暂无使用上下文'
}

function buildSettingPrepEvidenceRows(record: SettingPrepRow | null) {
  if (!record) return []
  const lines: string[] = []
  for (const item of record.linkedSceneMoments.slice(0, 3)) {
    const line = [
      titleOfRecord(item),
      firstText(item.time_text, item.location_text, item.mood, item.description, item.action_text),
    ].filter(Boolean).join(' · ')
    if (line.trim()) lines.push(line)
  }
  for (const item of record.linkedSegments.slice(0, 2)) {
    const line = [
      titleOfRecord(item),
      firstText(item.summary, item.description, item.content),
    ].filter(Boolean).join(' · ')
    if (line.trim()) lines.push(line)
  }
  return lines.length > 0 ? lines : ['当前设定暂时没有绑定到可见剧本或编排上下文。']
}

function buildSettingPrepContextRows(record: SettingPrepRow | null) {
  if (!record) return []
  return [
    { label: '设定资料', value: `${creativeReferenceKindLabel(record.record.kind)} / ${creativeReferenceStatusLabel(record.record.status)}`, icon: Sparkles },
    { label: '使用范围', value: buildSettingPrepUsageSummary(record), icon: GitBranch },
    { label: '设定状态', value: `${record.states.length} 个状态记录`, icon: Layers },
    { label: '关联素材', value: record.assetSlots.length > 0 ? `${record.assetSlots.length} 个素材需求` : '尚未关联素材需求', icon: PackageCheck },
    { label: '关系网络', value: record.relationships.length > 0 ? `${record.relationships.length} 条关系` : '尚未建立关系', icon: Route },
  ]
}

function buildSettingPrepChecklist(record: SettingPrepRow | null) {
  if (!record) return []
  const readyForLock = record.missing.length === 0 && (record.rawStatus === 'confirmed' || record.rawStatus === 'locked')
  return [
    { label: '名称明确', detail: firstText(record.record.name, '设定资料需要一个稳定名称'), done: Boolean(firstText(record.record.name)), tone: 'warning' as const },
    { label: '设定正文完整', detail: record.missing.includes('缺设定正文') ? '需要补充可直接用于制作的设定说明' : '已有可用设定正文', done: !record.missing.includes('缺设定正文'), tone: 'warning' as const },
    { label: '视觉锚点可用', detail: record.missing.includes('缺视觉锚点') ? '需要补充视觉说明、档案或提示词锚点' : '已有视觉说明或档案', done: !record.missing.includes('缺视觉锚点'), tone: 'warning' as const },
    { label: '被使用范围明确', detail: record.usages.length > 0 ? `${record.usages.length} 个引用正在使用这个设定` : '还没有被剧本或制作使用', done: record.usages.length > 0, tone: 'warning' as const },
    { label: '状态可放行', detail: readyForLock ? '可以进入已确认或已锁定状态' : '建议先补齐缺口，再确认状态', done: readyForLock, tone: 'warning' as const },
  ]
}

function buildSettingPrepRows(data?: SettingPrepData): SettingPrepRow[] {
  if (!data) return []
  const segmentsById = new Map(data.segments.map((item) => [item.ID, item]))
  const momentsById = new Map(data.sceneMoments.map((item) => [item.ID, item]))
  const productionsById = new Map(data.productions.map((item) => [item.ID, item]))
  const contentUnitsById = new Map(data.contentUnits.map((item) => [item.ID, item]))

  return data.creativeReferences
    .slice()
    .sort((a, b) => byOrder(a, b))
    .map((record) => {
      const states = data.creativeReferenceStates.filter((state) => Number(state.creative_reference_id) === record.ID)
      const usages = data.creativeReferenceUsages.filter((usage) => Number(usage.creative_reference_id) === record.ID)
      const relatedAssetSlots = data.assetSlots.filter((slot) => Number(slot.creative_reference_id) === record.ID || states.some((state) => Number(slot.creative_reference_state_id) === state.ID))
      const relationships = data.creativeRelationships.filter((relation) => Number(relation.source_creative_reference_id) === record.ID || Number(relation.target_creative_reference_id) === record.ID)

      const linkedSegments = dedupeRecords([
        ...usages
          .filter((usage) => usage.owner_type === 'segment')
          .map((usage) => segmentsById.get(Number(usage.owner_id)))
          .filter((item): item is WorkbenchRecord => Boolean(item)),
        ...relatedAssetSlots
          .filter((slot) => slot.owner_type === 'segment')
          .map((slot) => segmentsById.get(Number(slot.owner_id)))
          .filter((item): item is WorkbenchRecord => Boolean(item)),
      ])
      const linkedSceneMoments = dedupeRecords([
        ...usages
          .filter((usage) => usage.owner_type === 'scene_moment')
          .map((usage) => momentsById.get(Number(usage.owner_id)))
          .filter((item): item is WorkbenchRecord => Boolean(item)),
        ...relatedAssetSlots
          .filter((slot) => slot.owner_type === 'scene_moment')
          .map((slot) => momentsById.get(Number(slot.owner_id)))
          .filter((item): item is WorkbenchRecord => Boolean(item)),
      ])
      const linkedContentUnits = dedupeRecords([
        ...usages
          .filter((usage) => usage.owner_type === 'content_unit')
          .map((usage) => contentUnitsById.get(Number(usage.owner_id)))
          .filter((item): item is WorkbenchRecord => Boolean(item)),
        ...relatedAssetSlots
          .filter((slot) => slot.owner_type === 'content_unit')
          .map((slot) => contentUnitsById.get(Number(slot.owner_id)))
          .filter((item): item is WorkbenchRecord => Boolean(item)),
      ])
      const linkedProductions = dedupeRecords([
        ...linkedSegments
          .map((segment) => segment.production_id ? productionsById.get(Number(segment.production_id)) : undefined)
          .filter((item): item is WorkbenchRecord => Boolean(item)),
        ...linkedSceneMoments
          .map((moment) => moment.production_id ? productionsById.get(Number(moment.production_id)) : undefined)
          .filter((item): item is WorkbenchRecord => Boolean(item)),
        ...linkedContentUnits
          .map((unit) => unit.production_id ? productionsById.get(Number(unit.production_id)) : undefined)
          .filter((item): item is WorkbenchRecord => Boolean(item)),
      ])

      const title = firstText(record.name, record.title, record.label, record.alias, `${creativeReferenceKindLabel(record.kind)} #${record.ID}`)
      const hasDescription = Boolean(firstText(record.description, record.content))
      const hasVisualAnchor = Boolean(firstText(record.visual_intent, record.visual_notes, record.profile_json))
      const hasState = states.length > 0
      const hasUsage = usages.length > 0
      const hasAsset = relatedAssetSlots.length > 0
      const missing = [
        hasDescription ? null : '缺设定正文',
        hasVisualAnchor ? null : '缺视觉锚点',
        hasState ? null : '缺状态记录',
        hasUsage ? null : '缺使用上下文',
        normalizeCreativeReferenceStatus(record.status) === 'draft' ? '待定稿' : null,
      ].filter(Boolean) as string[]
      const warnings = [
        relationships.some((relation) => String(relation.category) === 'conflict') ? '存在冲突关系' : null,
        usages.length > 0 && normalizeCreativeReferenceStatus(record.status) === 'draft' ? '下游已在使用，建议先补完再定稿' : null,
      ].filter(Boolean) as string[]
      const progress = clampProgress(
        10 +
        (hasDescription ? 18 : 0) +
        (hasVisualAnchor ? 20 : 0) +
        (hasState ? 18 : 0) +
        (hasUsage ? 18 : 0) +
        (hasAsset ? 10 : 0) +
        (normalizeCreativeReferenceStatus(record.status) === 'confirmed' ? 8 : 0) +
        (normalizeCreativeReferenceStatus(record.status) === 'locked' ? 12 : 0),
      )
      const priority: Priority = (usages.length > 0 && missing.length > 0) || warnings.length > 0
        ? 'high'
        : usages.length > 0
          ? 'medium'
          : 'low'
      const status = creativeReferenceWorkStatus(record.status)
      const readinessLabel = missing.length === 0
        ? normalizeCreativeReferenceStatus(record.status) === 'locked'
          ? '已锁定，可下游引用'
          : normalizeCreativeReferenceStatus(record.status) === 'confirmed'
            ? '已确认，可继续使用'
            : '可进入确认'
        : `${missing.length} 个缺口`
      const scopeParts = [
        linkedProductions.length > 0 ? `${linkedProductions.length} 个制作` : '未绑定制作',
        linkedSegments.length > 0 ? `${linkedSegments.length} 个编排段` : '未绑定编排段',
        linkedSceneMoments.length > 0 ? `${linkedSceneMoments.length} 个情景` : '未绑定情景',
      ]

      return {
        id: String(record.ID),
        title,
        kind: creativeReferenceKindLabel(record.kind),
        status,
        rawStatus: normalizeCreativeReferenceStatus(record.status),
        priority,
        progress,
        readinessLabel,
        scope: scopeParts.join(' / '),
        missing,
        warnings,
        record,
        states,
        usages,
        relationships,
        assetSlots: relatedAssetSlots,
        linkedSegments,
        linkedSceneMoments,
        linkedContentUnits,
        linkedProductions,
      }
    })
}

function buildSettingPrepMetrics(rows: SettingPrepRow[]): WorkbenchMetric[] {
  const completed = rows.filter((row) => row.missing.length === 0 && (row.rawStatus === 'confirmed' || row.rawStatus === 'locked'))
  const locked = rows.filter((row) => row.rawStatus === 'locked')
  const used = rows.filter((row) => row.usages.length > 0)
  const needingWork = rows.filter((row) => row.missing.length > 0 || row.rawStatus === 'draft')
  return [
    { label: '设定资料', value: String(rows.length), detail: '当前项目内的核心设定对象', icon: Sparkles, status: rows.length > 0 ? 'review' : 'blocked' },
    { label: '待完善', value: String(needingWork.length), detail: '缺口或草稿状态的设定', icon: AlertTriangle, status: needingWork.length > 0 ? 'blocked' : 'ready' },
    { label: '已可用', value: String(completed.length), detail: '可进入下游使用的设定', icon: CheckCircle2, status: completed.length > 0 ? 'ready' : 'review' },
    { label: '已锁定', value: String(locked.length), detail: '后续修改需二次确认', icon: LockKeyhole, status: locked.length > 0 ? 'ready' : 'review' },
    { label: '已使用', value: String(used.length), detail: '已经进入剧本或制作上下文', icon: GitBranch, status: used.length > 0 ? 'ready' : 'review' },
  ]
}

function buildSettingPrepAgentMessage(input: {
  projectName?: string
  row: SettingPrepRow
  evidence: string[]
  missing: string[]
}) {
  return [
    `请完善设定资料：${input.row.title}`,
    input.projectName ? `项目：${input.projectName}` : undefined,
    `类型：${input.row.kind}`,
    `状态：${creativeReferenceStatusLabel(input.row.rawStatus)}`,
    input.missing.length > 0 ? `缺口：${input.missing.join('、')}` : undefined,
    input.evidence.length > 0 ? `证据：${input.evidence.join('；')}` : undefined,
  ].filter(Boolean).join('\n')
}

function SettingPrepStateBadge({ status }: { status?: string }) {
  return <Badge variant={creativeReferenceStatusVariant(status)}>{creativeReferenceStatusLabel(status)}</Badge>
}

function SettingPrepHintCard({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-3">
      <p className="type-label text-muted-foreground">{label}</p>
      <p className="mt-2 type-body leading-6 text-foreground">{text}</p>
    </div>
  )
}

function SettingPrepTag({ children }: { children: ReactNode }) {
  return <span className="inline-flex max-w-full items-center rounded border border-border bg-muted/40 px-2 py-1 type-caption text-muted-foreground">{children}</span>
}

export function SettingPreparationWorkbench() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['workbench', 'creative', projectId],
    queryFn: () => loadSettingPrepData(projectId!),
    enabled: !!projectId,
  })
  const rows = useMemo(() => buildSettingPrepRows(data), [data])
  const [kindFilter, setKindFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedId, setSelectedId] = useState('')
  const [contextMode, setContextMode] = useState<'usage' | 'script' | 'ai'>('usage')
  const [draft, setDraft] = useState<ReturnType<typeof buildSettingPrepForm> | null>(null)

  const kindOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1)
    return Array.from(counts.entries()).map(([kind, count]) => ({ value: kind, label: creativeReferenceKindLabel(kind), count }))
  }, [rows])
  const statusOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of rows) counts.set(row.rawStatus, (counts.get(row.rawStatus) ?? 0) + 1)
    return Array.from(counts.entries()).map(([status, count]) => ({ value: status, label: creativeReferenceStatusLabel(status), count }))
  }, [rows])
  const filteredRows = useMemo(() => rows.filter((row) => {
    if (kindFilter !== 'all' && row.kind !== kindFilter) return false
    if (statusFilter !== 'all' && row.rawStatus !== statusFilter) return false
    return true
  }), [rows, kindFilter, statusFilter])
  const selected = filteredRows.find((row) => row.id === selectedId) ?? filteredRows[0] ?? rows.find((row) => row.id === selectedId) ?? rows[0] ?? null
  const metrics = buildSettingPrepMetrics(rows)
  const evidenceRows = buildSettingPrepEvidenceRows(selected)
  const contextRows = buildSettingPrepContextRows(selected)
  const checklist = buildSettingPrepChecklist(selected)

  useEffect(() => {
    if (filteredRows.length === 0) {
      if (selectedId) setSelectedId('')
      return
    }
    if (!selectedId || !filteredRows.some((row) => row.id === selectedId)) {
      setSelectedId(filteredRows[0].id)
    }
  }, [filteredRows, selectedId])

  useEffect(() => {
    if (!selected) {
      setDraft(null)
      return
    }
    setDraft(buildSettingPrepForm(selected.record))
  }, [selected?.id, selected?.record.UpdatedAt, selected?.record.status, selected?.record.name, selected?.record.content, selected?.record.profile_json, selected?.record.tags_json])

  const saveReference = useMutation({
    mutationFn: async () => {
      if (!projectId || !selected || !draft) throw new Error('请先选择设定资料')
      return updateSemanticEntity(projectId, semanticEntityConfig('creativeReferences'), selected.record.ID, {
        name: draft.name,
        alias: draft.alias,
        kind: draft.kind,
        importance: draft.importance,
        status: draft.status,
        description: draft.description,
        content: draft.content,
        profile_json: composeCreativeProfileJSON(draft.profileJson, draft.visualIntent),
        tags_json: draft.tagsJson,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workbench', 'creative', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['semantic-creative-references-page', projectId] })
      toast.success('设定资料已保存')
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '保存设定资料失败'))
    },
  })

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      if (!projectId || !selected) throw new Error('请先选择设定资料')
      return updateSemanticEntity(projectId, semanticEntityConfig('creativeReferences'), selected.record.ID, { status })
    },
    onSuccess: async (record) => {
      setDraft((current) => current ? { ...current, status: normalizeCreativeReferenceStatus(record.status) } : current)
      await queryClient.invalidateQueries({ queryKey: ['workbench', 'creative', projectId] })
      await queryClient.invalidateQueries({ queryKey: ['semantic-creative-references-page', projectId] })
      toast.success('设定状态已更新')
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, '更新设定状态失败'))
    },
  })

  function launchAICompletion() {
    if (!projectId || !selected) {
      toast.info('请先选择设定资料')
      return
    }
    const message = buildSettingPrepAgentMessage({
      projectName: project?.name,
      row: selected,
      evidence: evidenceRows,
      missing: selected.missing,
    })
    const requestId = `setting_prep_${selected.record.ID}_${Date.now().toString(36)}`
    openAgentPanelDraft({
      requestId,
      taskType: 'setting_preparation',
      message,
      title: `完善设定: ${selected.title}`,
      newConversation: true,
      autoSend: true,
      projectId,
      clientInput: buildCommandFirstClientInput({
        message: `请完善设定资料：${selected.title}`,
        labels: ['setting-prep-workbench', 'workbench', 'structured-output'],
        hints: {
          projectId,
          route: { pathname: ROUTES.project.preProduction },
          selection: {
            entityType: 'creative_reference',
            entityId: selected.record.ID,
            label: selected.title,
          },
        },
      }),
      renderMode: 'page',
    })
    toast.success('已打开 AI 设定完善任务')
  }

  return (
    <ProjectWorkbenchShell
      workbenchId="pre_production"
      projectName={project?.name}
      kicker="设定准备"
      title="设定准备工作台"
      description="围绕已经被剧本和制作使用到的设定推进完整度：先看上下文，再用 AI 补齐缺口，最后把设定状态确认或锁定。"
      badges={isFetching ? <Badge variant="outline">同步中</Badge> : null}
      onRefresh={() => { void refetch() }}
      refreshing={isFetching}
      refreshLabel="刷新上下文"
      actions={(
        <Button size="sm" className="gap-2" onClick={launchAICompletion} disabled={!selected}>
          <Wand2 size={14} />
          AI 完善当前设定
        </Button>
      )}
    >
      <main className="min-h-0 flex-1 overflow-auto p-5">
        {!projectId ? (
          <EmptyWorkbenchState title="请先选择项目" text="当前没有可用项目，无法读取设定资料和制作上下文。" />
        ) : isLoading ? (
          <Card className="rounded-lg border-border bg-card p-8 text-center type-body text-muted-foreground">正在加载设定准备数据...</Card>
        ) : isError ? (
          <EmptyWorkbenchState title="设定准备数据加载失败" text="后端语义实体接口未返回可用数据，稍后重试。" />
        ) : rows.length === 0 ? (
          <EmptyWorkbenchState title="暂无设定资料" text="先从剧本拆解、创作编排或设定资料页创建人物、地点、道具、风格等设定。" />
        ) : (
          <div className="setting-prep-workbench space-y-5">
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 type-label font-medium text-muted-foreground">
                    <Sparkles size={14} />
                    <span>{project?.name ?? '当前项目'}</span>
                    <ChevronRight size={13} />
                    <span>设定准备</span>
                    {selected ? (
                      <>
                        <ChevronRight size={13} />
                        <span className="truncate text-foreground">{selected.title}</span>
                      </>
                    ) : null}
                  </div>
                  <h1 className="mt-2 type-title-sm font-semibold text-foreground">推进被生产使用的设定完整度</h1>
                  <p className="mt-1 max-w-4xl type-label leading-5 text-muted-foreground">
                    这里按使用上下文组织设定。优先处理被制作、情景、素材需求引用但仍处于草稿或缺口状态的资料。
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <QueueMiniMetric label="制作" value={data?.productions.length ?? 0} />
                  <QueueMiniMetric label="剧本" value={(data?.scripts.length ?? 0) + (data?.scriptVersions.length ?? 0)} />
                  <QueueMiniMetric label="情景" value={data?.sceneMoments.length ?? 0} />
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[220px_220px_minmax(0,1fr)]">
                <div className="space-y-1.5">
                  <p className="type-label font-medium text-muted-foreground">类型</p>
                  <Select value={kindFilter} onValueChange={setKindFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="全部类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部类型 · {rows.length}</SelectItem>
                      {kindOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label} · {option.count}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <p className="type-label font-medium text-muted-foreground">状态</p>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="全部状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态 · {rows.length}</SelectItem>
                      {statusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label} · {option.count}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-end justify-end gap-2">
                  <Button variant="outline" className="gap-2" onClick={() => { setKindFilter('all'); setStatusFilter('all') }}>
                    <RefreshCw size={14} />
                    清空筛选
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={() => navigate(mergeSearch(ROUTES.project.preProduction, '', { tab: 'settings' }))}>
                    <ArrowRight size={14} />
                    设定资料页
                  </Button>
                  <Button className="gap-2" onClick={launchAICompletion} disabled={!selected}>
                    <Wand2 size={14} />
                    AI 完善当前设定
                  </Button>
                </div>
              </div>
            </section>

            <MetricStrip metrics={metrics} />

            <div className="grid gap-5 2xl:grid-cols-[340px_minmax(0,1fr)_380px]">
              <SpecializedQueue
                title="待完善设定"
                className="flex min-h-[720px] flex-col overflow-hidden"
                bodyClassName="min-h-0 flex-1 overflow-hidden"
                items={filteredRows.map((row) => ({
                  id: row.id,
                  title: row.title,
                  scope: row.scope,
                  status: row.status,
                  priority: row.priority,
                  progress: row.progress,
                  need: [row.readinessLabel, ...row.missing.slice(0, 2)].join(' · '),
                }))}
                selectedId={selected?.id ?? ''}
                onSelect={(id) => setSelectedId(id)}
              />

              <div className="min-w-0 space-y-5">
                <WorkbenchPanel
                  title="设定完善面板"
                  icon={Sparkles}
                  action={selected ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <SettingPrepStateBadge status={draft?.status ?? selected.rawStatus} />
                      <Badge variant="outline">准备度 {selected.progress}%</Badge>
                    </div>
                  ) : undefined}
                >
                  {!selected || !draft ? (
                    <EmptyWorkbenchState title="暂无可编辑设定" text="请选择左侧队列中的设定资料。" />
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_150px]">
                        <div className="space-y-1.5">
                          <Label className="type-label text-muted-foreground">名称</Label>
                          <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="type-label text-muted-foreground">类型</Label>
                          <Select value={draft.kind} onValueChange={(value) => setDraft({ ...draft, kind: value })}>
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {['person', 'place', 'prop', 'style', 'world_rule', 'product', 'brand', 'restriction'].map((kind) => (
                                <SelectItem key={kind} value={kind}>{creativeReferenceKindLabel(kind)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="type-label text-muted-foreground">重要性</Label>
                          <Select value={draft.importance} onValueChange={(value) => setDraft({ ...draft, importance: value })}>
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="main">主要</SelectItem>
                              <SelectItem value="supporting">辅助</SelectItem>
                              <SelectItem value="background">背景</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                        <div className="space-y-1.5">
                          <Label className="type-label text-muted-foreground">别名 / 识别词</Label>
                          <Input value={draft.alias} onChange={(event) => setDraft({ ...draft, alias: event.target.value })} placeholder="可选，用于查重和 AI 识别" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="type-label text-muted-foreground">状态</Label>
                          <Select value={draft.status} onValueChange={(value) => setDraft({ ...draft, status: value })}>
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">草稿</SelectItem>
                              <SelectItem value="confirmed">已确认</SelectItem>
                              <SelectItem value="locked">已锁定</SelectItem>
                              <SelectItem value="merged">已合并</SelectItem>
                              <SelectItem value="ignored">已忽略</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid gap-3 xl:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="type-label text-muted-foreground">设定摘要</Label>
                          <Textarea
                            value={draft.description}
                            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                            className="min-h-32 resize-none type-body leading-6"
                            placeholder="这个设定在故事和制作中是什么。"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="type-label text-muted-foreground">设定正文</Label>
                          <Textarea
                            value={draft.content}
                            onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                            className="min-h-32 resize-none type-body leading-6"
                            placeholder="稳定事实、不可改写项、剧情作用、人物关系等。"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="type-label text-muted-foreground">视觉锚点 / 生成约束</Label>
                        <Textarea
                          value={draft.visualIntent}
                          onChange={(event) => setDraft({ ...draft, visualIntent: event.target.value })}
                          className="min-h-24 resize-none type-body leading-6"
                          placeholder="外观、材质、色彩、风格、禁止项和创作约束要点。"
                        />
                      </div>

                      <div className="grid gap-3 xl:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="type-label text-muted-foreground">档案 JSON</Label>
                          <Textarea
                            value={draft.profileJson}
                            onChange={(event) => setDraft({ ...draft, profileJson: event.target.value })}
                            className="min-h-24 resize-none font-mono type-label"
                            placeholder='{"appearance":"...","rules":["..."]}'
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="type-label text-muted-foreground">标签 JSON</Label>
                          <Textarea
                            value={draft.tagsJson}
                            onChange={(event) => setDraft({ ...draft, tagsJson: event.target.value })}
                            className="min-h-24 resize-none font-mono type-label"
                            placeholder='["主角","雨夜","关键道具"]'
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                        <div className="flex flex-wrap gap-2">
                          {selected.missing.map((item) => <SettingPrepTag key={item}>{item}</SettingPrepTag>)}
                          {selected.warnings.map((item) => <SettingPrepTag key={item}>{item}</SettingPrepTag>)}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button variant="outline" size="sm" className="gap-2" onClick={launchAICompletion}>
                            <Wand2 size={14} />
                            AI 补全
                          </Button>
                          <Button size="sm" loading={saveReference.isPending} onClick={() => saveReference.mutate()}>
                            保存设定
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </WorkbenchPanel>

                <WorkbenchPanel title="完成条件" icon={ClipboardCheck} action={selected ? <Badge variant={selected.missing.length > 0 ? 'warning' : 'success'}>{selected.readinessLabel}</Badge> : undefined}>
                  <GateChecklist rows={checklist} />
                </WorkbenchPanel>
              </div>

              <div className="min-w-0 space-y-5">
                <WorkbenchPanel
                  title="上下文"
                  icon={GitBranch}
                  action={(
                    <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
                      {[
                        ['usage', '使用'],
                        ['script', '剧本'],
                        ['ai', 'AI'],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setContextMode(value as 'usage' | 'script' | 'ai')}
                          className={cn(
                            'rounded px-2 py-1 type-label transition-colors',
                            contextMode === value ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                >
                  {!selected ? (
                    <EmptyWorkbenchState title="暂无上下文" text="选择设定资料后查看使用位置、剧本证据和 AI 补全入口。" />
                  ) : contextMode === 'usage' ? (
                    <div className="space-y-4">
                      <ContextStack rows={contextRows} className="grid-cols-1" />
                      <div className="space-y-2">
                        <p className="type-label font-medium text-muted-foreground">使用位置</p>
                        {selected.usages.length === 0 ? (
                          <p className="rounded-md border border-dashed border-border px-3 py-8 text-center type-body text-muted-foreground">这个设定还没有被情景、编排段或制作项引用。</p>
                        ) : (
                          selected.usages.slice(0, 6).map((usage) => (
                            <div key={usage.ID} className="rounded-md border border-border bg-background px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="truncate type-body font-medium text-foreground">
                                  {firstText(usage.role, usage.owner_type, '引用')} · #{usage.owner_id}
                                </p>
                                <Badge variant={creativeUsageStatusVariant(usage.status)}>{creativeUsageStatusLabel(usage.status)}</Badge>
                              </div>
                              <p className="mt-2 line-clamp-2 type-label leading-5 text-muted-foreground">{firstText(usage.evidence, usage.source, '暂无证据说明')}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : contextMode === 'script' ? (
                    <div className="space-y-3">
                      {evidenceRows.map((row) => (
                        <SettingPrepHintCard key={row} label="剧本 / 编排证据" text={row} />
                      ))}
                      <div className="rounded-md border border-border bg-background px-3 py-3">
                        <p className="type-label text-muted-foreground">制作上下文</p>
                        <p className="mt-2 type-body leading-6 text-foreground">{buildSettingPrepUsageSummary(selected)}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-3">
                        <p className="type-body font-medium text-foreground">AI 完善任务</p>
                        <p className="mt-2 type-label leading-5 text-muted-foreground">
                          AI 会读取当前设定、缺口、使用位置和剧本证据，输出可复制回设定字段的补全建议。
                        </p>
                        <Button className="mt-3 w-full justify-start gap-2" onClick={launchAICompletion}>
                          <Wand2 size={15} />
                          生成完善建议
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <p className="type-label font-medium text-muted-foreground">建议 AI 优先处理</p>
                        {(selected.missing.length > 0 ? selected.missing : ['检查设定是否足够进入下游']).map((item) => (
                          <SettingPrepHintCard key={item} label="待处理" text={item} />
                        ))}
                      </div>
                      <div className="space-y-2 border-t border-border pt-4">
                        <p className="type-label font-medium text-muted-foreground">完成后设置状态</p>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            ['draft', '草稿'],
                            ['confirmed', '已确认'],
                            ['locked', '已锁定'],
                            ['merged', '已合并'],
                            ['ignored', '已忽略'],
                          ].map(([status, label]) => (
                            <Button
                              key={status}
                              variant={selected.rawStatus === status ? 'primary' : 'outline'}
                              size="sm"
                              className="justify-start gap-2"
                              loading={updateStatus.isPending && updateStatus.variables === status}
                              onClick={() => updateStatus.mutate(status)}
                            >
                              {status === 'locked' ? <LockKeyhole size={14} /> : status === 'confirmed' ? <CheckCircle2 size={14} /> : <CircleDot size={14} />}
                              {label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </WorkbenchPanel>

                <WorkbenchPanel title="下游可用性" icon={ShieldCheck} action={selected ? <Badge variant={selected.progress >= 80 ? 'success' : 'warning'}>{selected.progress}%</Badge> : undefined}>
                  {!selected ? (
                    <p className="rounded-md border border-dashed border-border px-3 py-8 text-center type-body text-muted-foreground">暂无设定。</p>
                  ) : (
                    <div className="space-y-3">
                      <SettingPrepHintCard label="分镜 / 情节" text={selected.linkedSceneMoments.length > 0 ? `${selected.linkedSceneMoments.length} 个情景会引用这个设定` : '还没有进入情景引用'} />
                      <SettingPrepHintCard label="素材准备" text={selected.assetSlots.length > 0 ? `${selected.assetSlots.length} 个素材需求依赖这个设定` : '还没有素材需求绑定'} />
                      <SettingPrepHintCard label="生成约束" text={firstText(draft?.visualIntent, selected.record.description, '补充视觉锚点后可进入提示词和审核标准')} />
                    </div>
                  )}
                </WorkbenchPanel>
              </div>
            </div>
          </div>
        )}
      </main>
    </ProjectWorkbenchShell>
  )
}
