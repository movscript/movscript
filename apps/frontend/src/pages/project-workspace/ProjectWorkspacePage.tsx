import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileText,
  GitBranch,
  Layers3,
  Loader2,
  Lock,
  PackageCheck,
  RefreshCw,
  Route,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { Badge, Button, Card } from '@movscript/ui'

import {
  listSemanticEntities,
  semanticEntityConfig,
  updateSemanticEntity,
  type SemanticEntityKind,
  type SemanticEntityPayload,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import { SemanticEntityCrudDialog } from '@/components/shared/SemanticEntityCrudDialog'
import { buildCommandFirstClientInput, buildPageKey } from '@/lib/agentCommandInput'
import { openAgentPanelDraft, registerAgentPanelPageTool } from '@/lib/agentPanelBridge'
import { selectLatestDraftArtifact } from '@/lib/agentArtifacts'
import { buildEmptyProjectProposalDraftContent } from '@/lib/projectProposalDraft'
import { localAgentClient, type AgentDraft } from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { toast } from '@/store/toastStore'

type WorkspaceRecord = SemanticEntityRecord & {
  description?: string
  summary?: string
  content?: string
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

interface ProjectProposalDraftEntry {
  key: string
  kind: 'creative_references' | 'asset_slots'
  index: number
  changeType: 'added' | 'modified'
  applied: boolean
  label: string
  detail: string
  target?: string
  ownerKey?: string
  raw: Record<string, unknown>
}

interface ProjectProposalAssetGroup {
  ownerKey: string
  ownerLabel: string
  items: ProjectProposalDraftEntry[]
}

interface ProjectProposalDraftView {
  summary: string
  creativeReferences: ProjectProposalDraftEntry[]
  assetSlots: ProjectProposalDraftEntry[]
  assetSlotGroups: ProjectProposalAssetGroup[]
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

type ProjectProposalEntryDecision = 'rejected' | 'submitted'
type ProjectProposalEntryDecisions = Record<string, ProjectProposalEntryDecision>

interface ProjectProposalDiffRow {
  label: string
  before?: string
  after: string
  tone: 'added' | 'modified'
}

interface StatCardProps {
  title: string
  value: string | number
  detail: string
  icon: LucideIcon
}

type DialogState =
  | { mode: 'create'; kind: 'creativeReferences' | 'assetSlots'; record?: undefined }
  | { mode: 'edit'; kind: 'creativeReferences' | 'assetSlots'; record: WorkspaceRecord }
  | null

const emptyData: WorkspaceData = {
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

function textOf(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function numberOf(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function titleOf(record: WorkspaceRecord, fallback: string) {
  return textOf(record.title, textOf(record.name, textOf(record.label, fallback)))
}

function bodyOf(record: WorkspaceRecord, fallback = '暂无说明') {
  return textOf(record.description, textOf(record.summary, textOf(record.content, fallback)))
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

function asKey(value: unknown, fallback = '') {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return asString(value, fallback)
}

function nestedFields(item: Record<string, unknown>): Record<string, unknown> {
  return isRecord(item.fields) ? item.fields : {}
}

function proposalField(item: Record<string, unknown>, keys: string[]): unknown {
  const fields = nestedFields(item)
  for (const key of keys) {
    if (item[key] !== undefined) return item[key]
    if (fields[key] !== undefined) return fields[key]
  }
  return undefined
}

function draftAppliedEntryKeySet(draft: AgentDraft) {
  const metadata = isRecord(draft.metadata) ? draft.metadata : {}
  const appliedEntryKeys = Array.isArray(metadata.appliedEntryKeys) ? metadata.appliedEntryKeys : []
  return new Set(appliedEntryKeys.map((value) => asKey(value, '')).filter(Boolean))
}

function isProjectProposalHelperDraft(draft: AgentDraft) {
  if (draft.kind !== 'project_proposal') return false
  const metadata = isRecord(draft.metadata) ? draft.metadata : {}
  return typeof metadata.sourceDraftId === 'string' && metadata.sourceDraftId.trim().length > 0
}

function parseProjectProposalDraft(draft: AgentDraft, pageKey?: string): ProjectProposalDraftView | null {
  try {
    const content = JSON.parse(draft.content) as Record<string, unknown>
    const proposal = isRecord(content.proposal) ? content.proposal : undefined
    const appliedEntryKeys = draftAppliedEntryKeySet(draft)
    const creativeReferences = asRecordArray(proposal?.creative_references).map((item, index) => ({
      key: `${draft.id}:creative_references:${index}`,
      kind: 'creative_references' as const,
      index,
      changeType: typeof item.id === 'number' ? 'modified' as const : 'added' as const,
      applied: appliedEntryKeys.has(`${draft.id}:creative_references:${index}`),
      label: asString(proposalField(item, ['title', 'name', 'label', 'kind']), `设定建议 #${index + 1}`),
      detail: asString(proposalField(item, ['description', 'note', 'reason', 'summary', 'content', 'rationale']), '暂无说明'),
      target: (() => {
        const value = item.id
        return typeof value === 'number' ? `合并到 #${value}` : '新增候选'
      })(),
      raw: item,
    }))
    const creativeReferenceLabelByKey = new Map<string, string>()
    asRecordArray(proposal?.creative_references).forEach((item, index) => {
      const key = asKey(item.client_id ?? item.id, '')
      if (!key) return
      creativeReferenceLabelByKey.set(key, asString(proposalField(item, ['title', 'name', 'label', 'kind']), `设定建议 #${index + 1}`))
    })

    const assetSlots = asRecordArray(proposal?.asset_slots).map((item, index) => ({
      key: `${draft.id}:asset_slots:${index}`,
      kind: 'asset_slots' as const,
      index,
      changeType: typeof item.id === 'number' ? 'modified' as const : 'added' as const,
      applied: appliedEntryKeys.has(`${draft.id}:asset_slots:${index}`),
      label: asString(proposalField(item, ['title', 'name', 'label', 'kind']), `素材建议 #${index + 1}`),
      detail: asString(proposalField(item, ['description', 'note', 'reason', 'summary', 'content', 'rationale']), '暂无说明'),
      target: (() => {
        const value = item.id
        return typeof value === 'number' ? `调整 #${value}` : '新增候选'
      })(),
      ownerKey: asKey(isRecord(item.owner) ? item.owner.client_id ?? item.owner.id : proposalField(item, ['owner_client_id', 'owner_id', 'creative_reference_id', 'reference_id']), ''),
      raw: item,
    }))
    const assetSlotGroupsMap = new Map<string, ProjectProposalAssetGroup>()
    asRecordArray(proposal?.asset_slots).forEach((item, index) => {
      const ownerKey = asKey(
        isRecord(item.owner) ? item.owner.client_id ?? item.owner.id : proposalField(item, ['owner_client_id', 'owner_id', 'creative_reference_id', 'reference_id']),
        '',
      )
      const groupKey = ownerKey || 'ungrouped'
      const ownerLabel = ownerKey
        ? creativeReferenceLabelByKey.get(ownerKey)
        ?? asString(proposalField(item, ['owner_name', 'source_label', 'name', 'label']), `关联设定 ${ownerKey}`)
        : '未绑定设定'
      const entry = assetSlots[index]
      if (!entry) return
      const existing = assetSlotGroupsMap.get(groupKey)
      if (existing) {
        existing.items.push(entry)
      } else {
        assetSlotGroupsMap.set(groupKey, {
          ownerKey: groupKey,
          ownerLabel,
          items: [entry],
        })
      }
    })
    const impactNotes = [
      ...asRecordArray(content.impact_notes).map((item) => asString(item.note ?? item.text ?? item.content ?? item.summary)),
      ...asRecordArray(content.impactNotes).map((item) => asString(item.note ?? item.text ?? item.content ?? item.summary)),
      ...(Array.isArray(content.impact_notes) ? content.impact_notes.map((item) => asString(item)).filter(Boolean) : []),
      ...(Array.isArray(content.impactNotes) ? content.impactNotes.map((item) => asString(item)).filter(Boolean) : []),
    ].filter(Boolean)

    return {
      summary: asString(content.summary, '暂无摘要'),
      creativeReferences,
      assetSlots,
      assetSlotGroups: Array.from(assetSlotGroupsMap.values()),
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

function formatDraftEntry(entry: ProjectProposalDraftEntry) {
  const parts = [entry.label]
  if (entry.target) parts.push(entry.target)
  return parts.join(' · ')
}

function projectProposalEntryKey(draftId: string, kind: 'creative_references' | 'asset_slots', index: number) {
  return `${draftId}:${kind}:${index}`
}

function buildDraftContentForEntryKeys(
  draft: AgentDraft,
  entries: ProjectProposalDraftEntry[],
  summary?: string,
) {
  const content = JSON.parse(draft.content) as Record<string, unknown>
  const proposal = isRecord(content.proposal) ? { ...content.proposal } : {}
  const allowedKeys = new Set(entries.map((entry) => entry.key))
  const filterItems = (kind: 'creative_references' | 'asset_slots') => asRecordArray(proposal[kind]).flatMap((item, index) => {
    const key = projectProposalEntryKey(draft.id, kind, index)
    if (!allowedKeys.has(key)) return []
    return [item]
  })

  return JSON.stringify({
    ...content,
    ...(summary ? { summary } : {}),
    proposal: {
      ...proposal,
      creative_references: filterItems('creative_references'),
      asset_slots: filterItems('asset_slots'),
    },
  }, null, 2)
}

function draftEntryLabel(entry: ProjectProposalDraftEntry) {
  return entry.kind === 'creative_references' ? '设定资料' : '素材需求'
}

function draftEntryChangeLabel(entry: ProjectProposalDraftEntry) {
  return entry.changeType === 'added' ? '新增' : '修改'
}

function draftEntryCurrentRecord(entry: ProjectProposalDraftEntry, data: WorkspaceData) {
  const id = numberOf(entry.raw.id)
  if (id <= 0) return null
  if (entry.kind === 'creative_references') {
    return data.creativeReferences.find((record) => record.ID === id) ?? null
  }
  return data.assetSlots.find((record) => record.ID === id) ?? null
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

function draftEntryOwnerLabel(entry: ProjectProposalDraftEntry, referenceLabels: Map<string, string>, rawOwnerValue?: string) {
  if (rawOwnerValue) return referenceLabels.get(rawOwnerValue) ?? rawOwnerValue
  if (entry.ownerKey) return referenceLabels.get(entry.ownerKey) ?? entry.ownerKey
  return '未绑定设定'
}

function buildProjectProposalEntryDiffRows(
  entry: ProjectProposalDraftEntry,
  data: WorkspaceData,
  referenceLabels: Map<string, string>,
): ProjectProposalDiffRow[] {
  const current = draftEntryCurrentRecord(entry, data)
  const rows: ProjectProposalDiffRow[] = []

  const pushField = (label: string, beforeValue: unknown, afterValue: unknown) => {
    const afterText = draftEntryFieldText(afterValue)
    const beforeText = draftEntryFieldText(beforeValue)
    const changed = entry.changeType === 'added' || beforeText !== afterText
    if (!changed) return
    rows.push({
      label,
      before: entry.changeType === 'added' ? '' : beforeText,
      after: afterText || '未填写',
      tone: entry.changeType === 'added' ? 'added' : 'modified',
    })
  }

  const currentFields = current ? { ...current } as Record<string, unknown> : {}
  const currentNestedFields = current ? nestedFields(current as Record<string, unknown>) : {}
  const currentField = (keys: string[]) => {
    for (const key of keys) {
      if (currentFields[key] !== undefined) return currentFields[key]
      if (currentNestedFields[key] !== undefined) return currentNestedFields[key]
    }
    return undefined
  }

  const item = entry.raw
  const proposedField = (keys: string[]) => proposalField(item, keys)

  if (entry.kind === 'creative_references') {
    pushField('名称', currentField(['name', 'title', 'label']), proposedField(['name', 'title', 'label']))
    pushField('类型', currentField(['kind']), proposedField(['kind']))
    pushField('说明', currentField(['description', 'summary', 'content', 'rationale']), proposedField(['description', 'summary', 'content', 'rationale']))
    pushField('别名', currentField(['alias']), proposedField(['alias']))
    pushField('重要度', currentField(['importance']), proposedField(['importance']))
    pushField('状态', currentField(['status']), proposedField(['status']))
    pushField('画像', currentField(['profile_json']), proposedField(['profile_json']))
    pushField('标签', currentField(['tags_json']), proposedField(['tags_json']))
    const mergeCandidates = Array.isArray(item.merge_candidates) ? item.merge_candidates.filter(isRecord) : []
    for (const [index, candidate] of mergeCandidates.entries()) {
      const sourceId = draftEntryFieldText(candidate.source_id)
      const reason = draftEntryFieldText(candidate.reason)
      rows.push({
        label: `合并候选 #${index + 1}`,
        before: '',
        after: [sourceId ? `来源 #${sourceId}` : '来源未标注', reason ? `原因：${reason}` : ''].filter(Boolean).join(' · '),
        tone: 'added',
      })
    }
  } else {
    pushField('名称', currentField(['name', 'title', 'label']), proposedField(['name', 'title', 'label']))
    pushField('类型', currentField(['kind']), proposedField(['kind']))
    pushField('说明', currentField(['description', 'summary', 'content', 'rationale']), proposedField(['description', 'summary', 'content', 'rationale']))
    pushField('用途', currentField(['usage', 'prompt_hint']), proposedField(['usage', 'prompt_hint']))
    pushField('优先级', currentField(['priority']), proposedField(['priority']))
    pushField('状态', currentField(['status']), proposedField(['status']))
    pushField('资源 ID', currentField(['resource_id']), proposedField(['resource_id']))
    pushField('锁定素材', currentField(['locked_asset_slot_id']), proposedField(['locked_asset_slot_id']))

    const currentOwnerId = current
      ? asKey(isRecord(current.owner) ? current.owner.client_id ?? current.owner.id : proposalField(current, ['owner_client_id', 'owner_id', 'creative_reference_id', 'reference_id']), '')
      : ''
    const currentOwnerLabel = draftEntryOwnerLabel(entry, referenceLabels, currentOwnerId)
    const proposedOwnerId = asKey(isRecord(item.owner) ? item.owner.client_id ?? item.owner.id : proposalField(item, ['owner_client_id', 'owner_id', 'creative_reference_id', 'reference_id']), '')
    const proposedOwnerLabel = draftEntryOwnerLabel(entry, referenceLabels, proposedOwnerId)
    if (entry.changeType === 'added' || currentOwnerLabel !== proposedOwnerLabel) {
      rows.push({
        label: '归属',
        before: entry.changeType === 'added' ? '' : currentOwnerLabel,
        after: proposedOwnerLabel,
        tone: entry.changeType === 'added' ? 'added' : 'modified',
      })
    }

    const currentMetadata = currentField(['metadata_json'])
    const proposedMetadata = proposedField(['metadata_json'])
    pushField('元数据', currentMetadata, proposedMetadata)
  }

  return rows
}

function statusCount(records: WorkspaceRecord[], statuses: string[]) {
  return records.filter((record) => statuses.includes(String(record.status ?? ''))).length
}

function statusVariant(status?: unknown) {
  const value = String(status ?? '')
  if (['locked', 'confirmed', 'active', 'selected'].includes(value)) return 'success' as const
  if (['missing', 'blocked', 'review', 'draft'].includes(value)) return 'warning' as const
  if (['candidate', 'planning', 'previewing'].includes(value)) return 'secondary' as const
  return 'outline' as const
}

function statusLabel(status?: unknown) {
  const value = String(status ?? '')
  const labels: Record<string, string> = {
    planning: '筹备',
    previewing: '预演',
    producing: '制作中',
    delivered: '已交付',
    archived: '归档',
    draft: '草稿',
    confirmed: '确认',
    locked: '锁定',
    merged: '已合并',
    ignored: '忽略',
    missing: '缺口',
    candidate: '候选',
    waived: '豁免',
  }
  return labels[value] ?? (value || '未设置')
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

export default function ProjectOrchestrationPage() {
  const queryClient = useQueryClient()
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const orchestrationToolCleanupRef = useRef<(() => void) | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [selectedReferenceId, setSelectedReferenceId] = useState<number | null>(null)
  const [selectedAssetSlotId, setSelectedAssetSlotId] = useState<number | null>(null)
  const [orchestrationPrompt, setOrchestrationPrompt] = useState('')
  const [launching, setLaunching] = useState(false)
  const [workspaceView, setWorkspaceView] = useState<'structure' | 'review'>('structure')
  const [applyingDraftId, setApplyingDraftId] = useState<string | null>(null)
  const [draftEntryDecisions, setDraftEntryDecisions] = useState<ProjectProposalEntryDecisions>({})
  const [draggingReferenceId, setDraggingReferenceId] = useState<number | null>(null)
  const [dropTargetReferenceId, setDropTargetReferenceId] = useState<number | null>(null)
  const [mergingReferences, setMergingReferences] = useState(false)
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
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
      route: { pathname: '/project-workspace' },
      projectId,
      selection: { entityType: 'project', entityId: projectId, label: project?.name ?? `项目 #${projectId}` },
      labels: ['project-workspace', 'project-orchestration'],
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
        return draft.kind === 'project_proposal' ? [draft] : []
      }
      const { drafts } = await localAgentClient.listDrafts({ projectId, kind: 'project_proposal', pageKey, limit: 20 })
      return drafts
    },
    enabled: !!projectId && !!pageKey,
    refetchInterval: (openedDraftId || activeDraftId) ? 1500 : false,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    if (openedDraftId || activeDraftId) return
    const firstProjectProposalDraft = draftsQuery.data?.find((draft) => draft.kind === 'project_proposal')
    if (!firstProjectProposalDraft) return
    setActiveDraftId(firstProjectProposalDraft.id)
    setWorkspaceView('review')
  }, [activeDraftId, draftsQuery.data, openedDraftId])

  const derived = useMemo(() => {
    const activeReferences = data.creativeReferences.filter((item) => !['ignored', 'merged'].includes(String(item.status ?? '')))
    const lockedReferences = statusCount(activeReferences, ['confirmed', 'locked'])
    const missingAssets = data.assetSlots.filter((item) => String(item.status ?? '') === 'missing')
    const lockedAssets = statusCount(data.assetSlots, ['locked', 'waived'])
    const sharedAssetSlots = data.assetSlots.filter((item) => !item.production_id)
    const productionAssetSlots = data.assetSlots.filter((item) => item.production_id)
    const activeProductions = data.productions.filter((item) => !['delivered', 'archived'].includes(String(item.status ?? '')))

    return {
      activeReferences,
      lockedReferences,
      missingAssets,
      lockedAssets,
      sharedAssetSlots,
      productionAssetSlots,
      activeProductions,
    }
  }, [data])

  const selectedReference = useMemo(() => {
    return derived.activeReferences.find((item) => item.ID === selectedReferenceId) ?? derived.activeReferences[0] ?? null
  }, [derived.activeReferences, selectedReferenceId])

  const selectedReferenceAssets = useMemo(() => {
    if (!selectedReference) return []
    return data.assetSlots.filter((item) => numberOf(item.creative_reference_id) === selectedReference.ID)
  }, [data.assetSlots, selectedReference])

  const selectedAssetSlot = useMemo(() => {
    if (!selectedAssetSlotId) return null
    return data.assetSlots.find((item) => item.ID === selectedAssetSlotId) ?? null
  }, [data.assetSlots, selectedAssetSlotId])

  useEffect(() => {
    if (!selectedAssetSlot) return
    const ownerId = numberOf(selectedAssetSlot.creative_reference_id)
    if (ownerId > 0 && selectedReference?.ID !== ownerId) {
      setSelectedAssetSlotId(null)
    }
  }, [selectedAssetSlot, selectedReference?.ID])

  const selectedReferenceUsageCount = useMemo(() => {
    if (!selectedReference) return 0
    return data.creativeReferenceUsages.filter((usage) => numberOf(usage.creative_reference_id) === selectedReference.ID).length
  }, [data.creativeReferenceUsages, selectedReference])

  const mergeCandidates = useMemo(() => {
    const groups = new Map<string, WorkspaceRecord[]>()
    for (const record of derived.activeReferences) {
      const key = `${String(record.kind ?? '')}:${titleOf(record, '').toLowerCase().replace(/\s+/g, '')}`
      if (!key.endsWith(':')) groups.set(key, [...(groups.get(key) ?? []), record])
    }
    return Array.from(groups.values()).filter((items) => items.length > 1).slice(0, 4)
  }, [derived.activeReferences])

  const assetGroups = useMemo(() => {
    const references = new Map<number, WorkspaceRecord>()
    for (const reference of derived.activeReferences) references.set(reference.ID, reference)

    const grouped = new Map<number, WorkspaceRecord[]>()
    const unbound: WorkspaceRecord[] = []

    for (const slot of data.assetSlots) {
      const referenceId = numberOf(slot.creative_reference_id)
      if (referenceId > 0 && references.has(referenceId)) {
        const current = grouped.get(referenceId) ?? []
        current.push(slot)
        grouped.set(referenceId, current)
      } else {
        unbound.push(slot)
      }
    }

    return {
      grouped,
      unbound,
      total: data.assetSlots.length,
    }
  }, [data.assetSlots, derived.activeReferences])

  const draftCounts = useMemo(() => {
    const drafts = (draftsQuery.data ?? []).filter((draft) => !isProjectProposalHelperDraft(draft))
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
        kind: 'project_proposal',
        title: `项目提案草稿 - ${project?.name ?? `#${projectId}`}`,
        content: JSON.stringify(buildEmptyProjectProposalDraftContent({
          projectId,
          createdAt: new Date().toISOString(),
        }), null, 2),
        source: {
          entityType: 'project',
          entityId: projectId,
          pageKey,
          pageType: 'project_proposal',
          pageRoute: '/project-workspace',
        },
        target: {
          projectId,
          entityType: 'project',
          entityId: projectId,
          field: 'proposal',
        },
        metadata: {
          pageOwned: true,
          proposalScope: 'project',
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
      const userMessage = requestedPrompt || `请执行项目提案：${project?.name ?? `#${projectId}`}`

      orchestrationToolCleanupRef.current?.()
      orchestrationToolCleanupRef.current = registerAgentPanelPageTool(requestId, async (payload) => {
        if (payload.run?.status === 'failed' || payload.run?.status === 'cancelled') {
          await draftsQuery.refetch()
          return
        }
        const latestDraftArtifact = selectLatestDraftArtifact(payload.artifacts, 'project_proposal')
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
        taskType: 'project_orchestration',
        message: `请执行项目提案：${project?.name ?? `#${projectId}`}`,
        title: `项目提案: ${project?.name ?? `#${projectId}`}`,
        mode: 'create',
        newConversation: true,
        autoSend: true,
        projectId,
        clientInput: buildCommandFirstClientInput({
          message: userMessage,
          mode: 'project-orchestration',
          labels: ['project-workspace', 'project-orchestration', 'draft-application'],
          hints: {
            projectId,
            draftId: draftShell.id,
            route: { pathname: '/project-workspace' },
            selection: { entityType: 'project', entityId: projectId, label: project?.name ?? `项目 #${projectId}` },
          },
        }),
        runPolicy: { maxToolCalls: 30, maxIterations: 18 },
        timeoutMs: 180_000,
        renderMode: 'page',
      })
      toast.info('已打开项目提案会话；AI 生成的草稿会回到提案审阅区')
      await draftsQuery.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '项目提案启动失败')
    } finally {
      setLaunching(false)
    }
  }

  function draftMetadataWithAppliedEntries(draft: AgentDraft, entryKeys: string[]) {
    const metadata = isRecord(draft.metadata) ? draft.metadata : {}
    const appliedEntryKeys = new Set([
      ...draftAppliedEntryKeySet(draft),
      ...entryKeys,
    ])
    return {
      ...metadata,
      reviewedFrom: 'project-workspace',
      reviewedAt: new Date().toISOString(),
      appliedEntryKeys: Array.from(appliedEntryKeys),
    }
  }

  async function applyDraftEntries(
    draft: AgentDraft,
    entries: ProjectProposalDraftEntry[],
    lockId: string = draft.id,
    proposedValueOverride?: string,
  ): Promise<boolean> {
    if (!projectId || entries.length === 0) return false
    setApplyingDraftId(lockId)
    try {
      const proposedValue = proposedValueOverride ?? buildDraftContentForEntryKeys(draft, entries, entries.length === 1
        ? `单项提交：${formatDraftEntry(entries[0])}`
        : `批量提交：${entries.length} 项`)
      const result = await localAgentClient.applyDraft(draft.id, {
        target: {
          projectId,
          entityType: 'project',
          entityId: projectId,
          field: 'proposal',
        },
        currentValue: summarizeCurrentState(data),
        proposedValue,
      })
      const writeCount = projectProposalBackendWriteCount(result.backendApply)
      await localAgentClient.updateDraft(draft.id, {
        metadata: draftMetadataWithAppliedEntries(draft, entries.map((entry) => entry.key)),
      })
      toast.success(writeCount > 0
        ? entries.length === 1
          ? `已提交此项，写入 ${writeCount} 项变更`
          : `草稿已应用，写入 ${writeCount} 项变更`
        : entries.length === 1
          ? '已提交此项'
          : '草稿已标记应用')
      await queryClient.invalidateQueries({ queryKey })
      await refetch()
      await draftsQuery.refetch()
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '草稿应用失败')
      return false
    } finally {
      setApplyingDraftId(null)
    }
  }

  async function applyDraftEntry(draft: AgentDraft, entry: ProjectProposalDraftEntry, proposalView?: ProjectProposalDraftView | null) {
    const view = proposalView ?? parseProjectProposalDraft(draft, pageKey)
    if (entry.kind === 'asset_slots') {
      const ownerKey = entry.ownerKey
      const ownerLooksNumeric = typeof ownerKey === 'string' && /^[0-9]+$/.test(ownerKey)
      const referencedCreative = view?.creativeReferences.find((item) => item.raw.client_id && asKey(item.raw.client_id, '') === ownerKey)
      if (ownerKey && !ownerLooksNumeric && referencedCreative) {
        toast.error('这条素材需求依赖草稿里的新设定，先批量提交或改成已有设定后再单项提交')
        return
      }
    }

    try {
      const proposedValue = buildDraftContentForEntryKeys(draft, [entry], `单项提交：${formatDraftEntry(entry)}`)
      const helperDraft = await localAgentClient.createDraft({
        projectId,
        kind: 'project_proposal',
        title: `单项提交 - ${formatDraftEntry(entry)}`,
        content: proposedValue,
        source: {
          ...(isRecord(draft.source) ? draft.source : {}),
          sourceDraftId: draft.id,
          sourceEntryKey: entry.key,
          sourceEntryLabel: entry.label,
        },
        target: {
          projectId,
          entityType: 'project',
          entityId: projectId,
          field: 'proposal',
        },
        metadata: {
          helperDraft: true,
          sourceDraftId: draft.id,
          sourceEntryKey: entry.key,
        },
      })
      const applied = await applyDraftEntries(helperDraft, [entry], draft.id, proposedValue)
      if (!applied) return
      await localAgentClient.updateDraft(draft.id, {
        metadata: draftMetadataWithAppliedEntries(draft, [entry.key]),
      })
      setDraftEntryDecision(entry.key, 'submitted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '草稿应用失败')
    }
  }

  async function applyDraft(draft: AgentDraft) {
    if (!projectId) return
    const proposalView = parseProjectProposalDraft(draft, pageKey)
    const allEntries = [
      ...(proposalView?.creativeReferences ?? []),
      ...(proposalView?.assetSlots ?? []),
    ]
    const pendingEntries = allEntries.filter((entry) => draftEntryDecisions[entry.key] !== 'rejected' && !entry.applied)
    if (pendingEntries.length === 0) {
      toast.error('没有可提交的变更')
      return
    }
    const applied = await applyDraftEntries(draft, pendingEntries)
    if (!applied) return
  }

  function refreshAll() {
    void refetch()
    void draftsQuery.refetch()
  }

  async function mergeReferences(sourceId: number, targetId: number) {
    if (!projectId || sourceId === targetId) return
    const source = derived.activeReferences.find((item) => item.ID === sourceId)
    const target = derived.activeReferences.find((item) => item.ID === targetId)
    if (!source || !target) return

    const sourceTitle = titleOf(source, `设定 #${source.ID}`)
    const targetTitle = titleOf(target, `设定 #${target.ID}`)
    const sourceUsages = data.creativeReferenceUsages.filter((item) => numberOf(item.creative_reference_id) === source.ID)
    const sourceRelationships = data.creativeRelationships.filter((item) =>
      numberOf(item.source_creative_reference_id) === source.ID || numberOf(item.target_creative_reference_id) === source.ID,
    )
    const sourceAssetSlots = data.assetSlots.filter((item) => numberOf(item.creative_reference_id) === source.ID)

    const message = [
      `确定把「${sourceTitle}」合并到「${targetTitle}」吗？`,
      `会迁移 ${sourceUsages.length} 条引用、${sourceRelationships.length} 条关系、${sourceAssetSlots.length} 个素材需求。`,
      '来源设定会标记为已合并，不会直接删除。',
    ].join('\n')
    if (!window.confirm(message)) return

    setMergingReferences(true)
    try {
      const usageConfig = semanticEntityConfig('creativeReferenceUsages')
      const relationshipConfig = semanticEntityConfig('creativeRelationships')
      const assetSlotConfig = semanticEntityConfig('assetSlots')
      const referenceConfig = semanticEntityConfig('creativeReferences')
      let changed = 0

      for (const usage of sourceUsages) {
        await updateSemanticEntity(projectId, usageConfig, usage.ID, {
          owner_type: String(usage.owner_type ?? ''),
          owner_id: numberOf(usage.owner_id),
          creative_reference_id: target.ID,
          creative_reference_state_id: nullableNumber(usage.creative_reference_state_id),
          role: String(usage.role ?? ''),
          order: numberOf(usage.order),
          evidence: String(usage.evidence ?? ''),
          source: String(usage.source ?? ''),
          status: String(usage.status ?? ''),
          metadata_json: String(usage.metadata_json ?? ''),
        })
        changed += 1
      }

      for (const relationship of sourceRelationships) {
        const sourceReferenceId = numberOf(relationship.source_creative_reference_id) === source.ID
          ? target.ID
          : numberOf(relationship.source_creative_reference_id)
        const targetReferenceId = numberOf(relationship.target_creative_reference_id) === source.ID
          ? target.ID
          : numberOf(relationship.target_creative_reference_id)
        const payload: SemanticEntityPayload = {
          source_creative_reference_id: sourceReferenceId,
          target_creative_reference_id: targetReferenceId,
          scope_type: String(relationship.scope_type ?? ''),
          scope_id: nullableNumber(relationship.scope_id),
          category: String(relationship.category ?? ''),
          type: String(relationship.type ?? ''),
          label: String(relationship.label ?? ''),
          description: String(relationship.description ?? ''),
          source: String(relationship.source ?? ''),
          status: String(relationship.status ?? ''),
          evidence: String(relationship.evidence ?? ''),
          metadata_json: String(relationship.metadata_json ?? ''),
        }
        if (numberOf(payload.source_creative_reference_id) === numberOf(payload.target_creative_reference_id)) {
          payload.status = 'ignored'
        }
        await updateSemanticEntity(projectId, relationshipConfig, relationship.ID, payload)
        changed += 1
      }

      const targetSlots = data.assetSlots.filter((item) => numberOf(item.creative_reference_id) === target.ID)
      for (const slot of sourceAssetSlots) {
        const duplicate = targetSlots.find((candidate) => assetSlotMergeKey(candidate) === assetSlotMergeKey(slot))
        await updateSemanticEntity(projectId, assetSlotConfig, slot.ID, duplicate
          ? { creative_reference_id: target.ID, status: 'waived', locked_asset_slot_id: duplicate.ID }
          : { creative_reference_id: target.ID })
        changed += 1
      }

      await updateSemanticEntity(projectId, referenceConfig, source.ID, creativeReferencePatchPayload(source, {
        status: 'merged',
        metadata_json: JSON.stringify({
          merged_into: target.ID,
          merged_into_title: targetTitle,
          merged_at: new Date().toISOString(),
        }),
      }))
      changed += 1

      setSelectedReferenceId(target.ID)
      await queryClient.invalidateQueries({ queryKey })
      await refetch()
      toast.success(`已合并「${sourceTitle}」，迁移 ${changed} 项关联`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '设定合并失败')
    } finally {
      setMergingReferences(false)
      setDraggingReferenceId(null)
      setDropTargetReferenceId(null)
    }
  }

  const drafts = (draftsQuery.data ?? []).filter((draft) => !isProjectProposalHelperDraft(draft))

  function setDraftEntryDecision(key: string, decision: ProjectProposalEntryDecision) {
    setDraftEntryDecisions((current) => ({ ...current, [key]: decision }))
  }

  function clearDraftEntryDecision(key: string) {
    setDraftEntryDecisions((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function draftReferenceOptions(view: ProjectProposalDraftView) {
    return [
      ...derived.activeReferences.map((reference) => ({
        value: String(reference.ID),
        label: titleOf(reference, `设定 #${reference.ID}`),
        numericId: reference.ID,
      })),
      ...view.creativeReferences.map((reference) => ({
        value: reference.raw.client_id ? String(reference.raw.client_id) : reference.key,
        label: reference.label,
        numericId: undefined,
      })),
    ]
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
              <span>项目编排</span>
              <Badge variant={derived.missingAssets.length > 0 ? 'warning' : 'success'} className="h-6 rounded-full px-2 text-[10px]">
                {derived.missingAssets.length > 0 ? `${derived.missingAssets.length} 个素材需求缺口` : '素材需求已收敛'}
              </Badge>
              {isFetching ? <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px]">同步中</Badge> : null}
            </div>
            <h1 className="mt-1 truncate text-xl font-semibold tracking-normal text-foreground">项目编排</h1>
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
              <section className="grid gap-3 sm:grid-cols-2">
                <StatCard title="项目设定" value={derived.activeReferences.length} detail={`${derived.lockedReferences} 个已确认或锁定`} icon={Sparkles} />
                <StatCard title="素材需求" value={assetGroups.total} detail={`${derived.lockedAssets} 个已锁定或豁免`} icon={PackageCheck} />
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
                      结构
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
                      {workspaceView === 'review' ? '提案审阅' : '项目结构'}
                    </Badge>
                    <span>{workspaceView === 'review' ? '先看设定和素材的 Git diff 决策' : '先整理设定，再进入提案审阅'}</span>
                  </div>
                </div>
              </div>

              {workspaceView === 'structure' && (
                <>
                  <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
                    <Card className="min-h-0 overflow-hidden rounded-lg border-border bg-card p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-sm font-semibold text-foreground">项目结构树</h2>
                          <p className="mt-1 text-xs text-muted-foreground">树形结构负责浏览和选择，整理与补齐交给右侧 AI 助手。</p>
                        </div>
                        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => startProjectOrchestration('请帮我梳理当前项目的设定树和素材缩略卡片，找出重复项、归属不清和缺失项，并给出整理建议。')}>
                          <Wand2 size={12} />
                          让 AI 整理
                        </Button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {derived.activeReferences.length === 0 ? (
                          <EmptyBlock title="暂无项目设定" detail="在这里创建人物、场景、道具和风格后，项目编排就能按树形结构展开。" />
                        ) : derived.activeReferences.map((reference) => {
                          const slots = assetGroups.grouped.get(reference.ID) ?? []
                          const selected = selectedReference?.ID === reference.ID
                          return (
                            <button
                              key={reference.ID}
                              type="button"
                              draggable={!mergingReferences}
                              onDragStart={(event) => {
                                setDraggingReferenceId(reference.ID)
                                event.dataTransfer.effectAllowed = 'move'
                                event.dataTransfer.setData('text/plain', String(reference.ID))
                              }}
                              onDragEnd={() => {
                                setDraggingReferenceId(null)
                                setDropTargetReferenceId(null)
                              }}
                              onDragOver={(event) => {
                                if (!draggingReferenceId || draggingReferenceId === reference.ID) return
                                event.preventDefault()
                                event.dataTransfer.dropEffect = 'move'
                                setDropTargetReferenceId(reference.ID)
                              }}
                              onDragLeave={() => {
                                setDropTargetReferenceId((current) => current === reference.ID ? null : current)
                              }}
                              onDrop={(event) => {
                                event.preventDefault()
                                const sourceId = numberOf(event.dataTransfer.getData('text/plain')) || draggingReferenceId
                                if (!sourceId) return
                                void mergeReferences(sourceId, reference.ID)
                              }}
                              onClick={() => {
                                setSelectedReferenceId(reference.ID)
                                setSelectedAssetSlotId(null)
                              }}
                              className={cn(
                                'w-full rounded-lg border p-3 text-left transition-colors',
                                selected ? 'border-primary/50 bg-primary/5' : 'border-border bg-background hover:bg-muted/40',
                                draggingReferenceId === reference.ID && 'opacity-50',
                                dropTargetReferenceId === reference.ID && draggingReferenceId !== reference.ID && 'border-emerald-500 bg-emerald-500/10',
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-foreground">{titleOf(reference, `设定 #${reference.ID}`)}</p>
                                  <p className="mt-1 truncate text-xs text-muted-foreground">{referenceKindLabel(reference.kind)} · {bodyOf(reference)}</p>
                                </div>
                                <Badge variant={statusVariant(reference.status)} className="shrink-0 text-[10px]">{statusLabel(reference.status)}</Badge>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                                <span className="rounded-full bg-muted px-2 py-0.5">{slots.length} 个素材缩略卡片</span>
                                <span className="rounded-full bg-muted px-2 py-0.5">{data.creativeReferenceUsages.filter((usage) => numberOf(usage.creative_reference_id) === reference.ID).length} 次引用</span>
                                <span className="rounded-full bg-muted px-2 py-0.5">拖动可合并</span>
                              </div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {slots.slice(0, 3).map((slot) => (
                                  <button
                                    key={slot.ID}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      setSelectedReferenceId(reference.ID)
                                      setSelectedAssetSlotId(slot.ID)
                                    }}
                                    className="rounded-md border border-border/70 bg-card p-2 text-left hover:bg-muted/40"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="truncate text-[11px] font-medium text-foreground">{titleOf(slot, `素材需求 #${slot.ID}`)}</p>
                                      <Badge variant={statusVariant(slot.status)} className="shrink-0 text-[9px]">{statusLabel(slot.status)}</Badge>
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{bodyOf(slot)}</p>
                                  </button>
                                ))}
                                {slots.length > 3 ? (
                                  <div className="rounded-md border border-dashed border-border bg-background p-2 text-[10px] text-muted-foreground">
                                    +{slots.length - 3} 个缩略卡片
                                  </div>
                                ) : null}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </Card>

                    <div className="min-h-0 space-y-4">
                      <Card className="min-h-0 overflow-hidden rounded-lg border-border bg-card p-4 shadow-sm">
                        {selectedAssetSlot ? (
                          <>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="truncate text-base font-semibold text-foreground">{titleOf(selectedAssetSlot, `素材需求 #${selectedAssetSlot.ID}`)}</h3>
                                  <Badge variant={statusVariant(selectedAssetSlot.status)}>{statusLabel(selectedAssetSlot.status)}</Badge>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">{selectedReference ? titleOf(selectedReference, `设定 #${selectedReference.ID}`) : '未绑定设定'} · 详情预览</p>
                              </div>
                              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => startProjectOrchestration(`请根据当前选中的素材需求「${titleOf(selectedAssetSlot, `素材需求 #${selectedAssetSlot.ID}`)}」补齐说明、关联和执行建议。`)}>
                                <Wand2 size={12} />
                                让 AI 补齐
                              </Button>
                            </div>
                            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground">{bodyOf(selectedAssetSlot, '这个素材需求还没有补充说明。')}</p>
                            <div className="mt-4 grid gap-2 md:grid-cols-3">
                              <MiniMetric icon={PackageCheck} label="所属设定" value={selectedReference ? titleOf(selectedReference, `设定 #${selectedReference.ID}`) : '未绑定'} />
                              <MiniMetric icon={Lock} label="状态" value={statusLabel(selectedAssetSlot.status)} />
                              <MiniMetric icon={Route} label="优先级" value={String(selectedAssetSlot.priority ?? 'normal')} />
                            </div>
                          </>
                        ) : selectedReference ? (
                          <>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="truncate text-base font-semibold text-foreground">{titleOf(selectedReference, `设定 #${selectedReference.ID}`)}</h3>
                                  <Badge variant={statusVariant(selectedReference.status)}>{statusLabel(selectedReference.status)}</Badge>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">{referenceKindLabel(selectedReference.kind)} · 详情预览</p>
                              </div>
                              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => startProjectOrchestration(`请以当前选中的设定「${titleOf(selectedReference, `设定 #${selectedReference.ID}`)}」为中心，判断重复、边界和素材缺口，并给出整理建议。`)}>
                                <Wand2 size={12} />
                                让 AI 整理
                              </Button>
                            </div>
                            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground">{bodyOf(selectedReference, '这个设定还没有补充说明。')}</p>
                            <div className="mt-4 grid gap-2 md:grid-cols-3">
                              <MiniMetric icon={Route} label="引用次数" value={selectedReferenceUsageCount} />
                              <MiniMetric icon={PackageCheck} label="素材需求" value={selectedReferenceAssets.length} />
                              <MiniMetric icon={Lock} label="锁定素材" value={statusCount(selectedReferenceAssets, ['locked', 'waived'])} />
                            </div>
                          </>
                        ) : (
                          <EmptyBlock title="未选择设定" detail="先点左侧树节点或缩略卡片，右侧会显示当前选择的详情预览。" />
                        )}
                      </Card>

                      <Card className="min-h-0 overflow-hidden rounded-lg border-border bg-card p-4 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="text-sm font-semibold text-foreground">缩略卡片</h2>
                            <p className="mt-1 text-xs text-muted-foreground">点击缩略卡片切换详情预览，整理动作仍然由 AI 助手处理。</p>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">{selectedReference ? `${selectedReferenceAssets.length} 项` : '全局视图'}</Badge>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {(selectedReference ? selectedReferenceAssets : assetGroups.unbound).slice(0, 6).map((slot) => (
                            <button
                              key={slot.ID}
                              type="button"
                              onClick={() => {
                                const nextReferenceId = numberOf(slot.creative_reference_id) || selectedReference?.ID || null
                                setSelectedReferenceId(nextReferenceId)
                                setSelectedAssetSlotId(slot.ID)
                              }}
                              className={cn(
                                'rounded-lg border p-2 text-left transition-colors',
                                selectedAssetSlot?.ID === slot.ID ? 'border-primary/50 bg-primary/5' : 'border-border bg-background hover:bg-muted/40',
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="truncate text-[11px] font-medium text-foreground">{titleOf(slot, `素材需求 #${slot.ID}`)}</p>
                                <Badge variant={statusVariant(slot.status)} className="shrink-0 text-[9px]">{statusLabel(slot.status)}</Badge>
                              </div>
                              <p className="mt-1 line-clamp-3 text-[10px] leading-4 text-muted-foreground">{bodyOf(slot)}</p>
                            </button>
                          ))}
                          {selectedReference ? (
                            <button
                              type="button"
                              onClick={() => startProjectOrchestration(`请围绕「${titleOf(selectedReference, `设定 #${selectedReference.ID}`)}」下的素材缩略卡片，补齐缺失素材、调整归属并给出执行建议。`)}
                              className="rounded-lg border border-dashed border-border bg-background p-2 text-left transition-colors hover:bg-muted/40"
                            >
                              <p className="text-[11px] font-medium text-foreground">交给 AI 助手</p>
                              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">把当前选择和上下文一起发给右侧 AI。</p>
                            </button>
                          ) : null}
                        </div>
                      </Card>
                    </div>
                  </section>
                </>
              )}

              {workspaceView === 'review' && (
                <section className="min-w-0 space-y-4">
                  <Card className="min-h-0 overflow-hidden rounded-lg border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">提案审阅</h2>
                        <p className="mt-1 text-xs text-muted-foreground">这里只显示增量，不展开整份草稿；每个条目都可以单独提交。</p>
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
                        <EmptyBlock title="暂无项目编排草稿" detail="从上方发起项目编排后，AI 对设定资料和素材需求的局部修改会进入这里逐项审阅。" />
                      ) : drafts.map((draft) => {
                        const proposalView = parseProjectProposalDraft(draft, pageKey)
                        const referenceEntries = proposalView?.creativeReferences ?? []
                        const assetEntries = proposalView?.assetSlots ?? []
                        const allEntries = [...referenceEntries, ...assetEntries]
                        const referenceOptions = proposalView ? draftReferenceOptions(proposalView) : []
                        const referenceLabels = new Map(referenceOptions.map((option) => [option.value, option.label]))
                        const pendingEntries = allEntries.filter((entry) => draftEntryDecisions[entry.key] !== 'rejected' && !entry.applied)
                        const submittedEntries = allEntries.filter((entry) => draftEntryDecisions[entry.key] === 'submitted' || entry.applied)
                        const rejectedEntries = allEntries.filter((entry) => draftEntryDecisions[entry.key] === 'rejected')
                        const addedEntries = allEntries.filter((entry) => entry.changeType === 'added')
                        const modifiedEntries = allEntries.filter((entry) => entry.changeType === 'modified')

                        return (
                          <div key={draft.id} className="rounded-lg border border-border bg-background p-3 last:mb-0">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-foreground">{draft.title}</p>
                                <p className="mt-1 text-[10px] text-muted-foreground">{formatDate(draft.updatedAt)} · {draft.id}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={draftStatusVariant(draft.status)} className="shrink-0 text-[10px]">{draftStatusLabel(draft.status)}</Badge>
                                <Badge variant="outline" className="text-[10px]">{allEntries.length} 条变更</Badge>
                              </div>
                            </div>

                            {proposalView ? (
                              <div className="mt-3 space-y-3">
                                <div className="rounded-md border border-sky-500/20 bg-sky-500/5 p-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-[10px] font-medium text-foreground">项目提案差异</p>
                                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{proposalView.summary}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                      <Badge variant="secondary" className="h-5 rounded-full px-1.5">{addedEntries.length} 新增</Badge>
                                      <Badge variant="outline" className="h-5 rounded-full px-1.5">{modifiedEntries.length} 修改</Badge>
                                      <Badge variant="success" className="h-5 rounded-full px-1.5">{submittedEntries.length} 已提交</Badge>
                                      {rejectedEntries.length > 0 ? <Badge variant="destructive" className="h-5 rounded-full px-1.5">{rejectedEntries.length} 已忽略</Badge> : null}
                                    </div>
                                  </div>
                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <p className="text-[10px] text-muted-foreground">条目只显示字段差异，不展开全量内容。</p>
                                    <div className="flex gap-1.5">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 px-2 text-[10px]"
                                        onClick={() => setDraftEntryDecisions((current) => {
                                          const next = { ...current }
                                          for (const entry of allEntries) delete next[entry.key]
                                          return next
                                        })}
                                      >
                                        重置状态
                                      </Button>
                                      <Button
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        onClick={() => applyDraft(draft)}
                                        loading={applyingDraftId === draft.id}
                                        disabled={draft.status === 'applied' || pendingEntries.length === 0}
                                      >
                                        <CheckCircle2 size={12} />
                                        提交剩余
                                      </Button>
                                    </div>
                                  </div>
                                </div>

                                {allEntries.length > 0 ? (
                                  <div className="space-y-2">
                                    {allEntries.map((entry) => {
                                      const isSubmitted = entry.applied || draftEntryDecisions[entry.key] === 'submitted'
                                      const isRejected = draftEntryDecisions[entry.key] === 'rejected'
                                      const rows = buildProjectProposalEntryDiffRows(entry, data, referenceLabels)
                                      return (
                                        <div key={entry.key} className="rounded-md border border-border/70 bg-card px-2.5 py-2">
                                          <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div className="min-w-0">
                                              <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="text-[10px] font-medium text-foreground">{formatDraftEntry(entry)}</span>
                                                <Badge variant={entry.changeType === 'added' ? 'secondary' : 'outline'} className="h-5 rounded-full px-1.5 text-[9px]">
                                                  {draftEntryChangeLabel(entry)}
                                                </Badge>
                                                <Badge variant="outline" className="h-5 rounded-full px-1.5 text-[9px]">{draftEntryLabel(entry)}</Badge>
                                                {isSubmitted ? <Badge variant="success" className="h-5 rounded-full px-1.5 text-[9px]">已提交</Badge> : null}
                                                {isRejected ? <Badge variant="destructive" className="h-5 rounded-full px-1.5 text-[9px]">已忽略</Badge> : null}
                                              </div>
                                              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{entry.detail}</p>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1.5">
                                              {isSubmitted ? null : (
                                                <Button
                                                  size="sm"
                                                  className="h-6 px-2 text-[10px]"
                                                  loading={applyingDraftId === draft.id}
                                                  disabled={draft.status === 'applied'}
                                                  onClick={() => void applyDraftEntry(draft, entry, proposalView)}
                                                >
                                                  提交此项
                                                </Button>
                                              )}
                                              {isRejected ? (
                                                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => clearDraftEntryDecision(entry.key)}>
                                                  恢复
                                                </Button>
                                              ) : (
                                                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setDraftEntryDecision(entry.key, 'rejected')}>
                                                  忽略
                                                </Button>
                                              )}
                                            </div>
                                          </div>

                                          {rows.length > 0 ? (
                                            <div className="mt-2 space-y-1 rounded border border-dashed border-border/60 bg-muted/20 px-2 py-1">
                                              {rows.map((row, index) => (
                                                <div key={`${entry.key}-${row.label}-${index}`} className="flex items-start gap-1.5 text-[10px] leading-4">
                                                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-muted-foreground">{row.label}</span>
                                                  <span className={cn('min-w-0 flex-1 truncate', row.before ? 'line-through text-muted-foreground' : 'text-muted-foreground')}>
                                                    {row.before || '新增'}
                                                  </span>
                                                  <ArrowRight size={9} className="mt-0.5 shrink-0 text-muted-foreground" />
                                                  <span className={cn('min-w-0 flex-1 truncate', row.tone === 'added' ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground')}>
                                                    {row.after || '未填写'}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <div className="mt-2 rounded border border-dashed border-border/60 bg-muted/20 px-2 py-1 text-[10px] text-muted-foreground">
                                              没有可展示的字段差异。
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}
                                  </div>
                                ) : (
                                  <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-[10px] text-muted-foreground">
                                    这份草稿没有可展示的 diff。
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
                                      <Link to="/agent/drafts">
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

      {dialog ? (
        <SemanticEntityCrudDialog
          open
          mode={dialog.mode}
          projectId={projectId}
          config={semanticEntityConfig(dialog.kind)}
          record={dialog.mode === 'edit' ? dialog.record : undefined}
          defaults={dialog.mode === 'create' && dialog.kind === 'assetSlots'
            ? {
              status: 'missing',
              priority: 'normal',
              owner_type: 'creative_reference',
              creative_reference_id: selectedReference?.ID ?? null,
            }
            : undefined}
          queryKey={queryKey}
          title={dialog.mode === 'create'
            ? dialog.kind === 'creativeReferences' ? '新建项目设定' : '新建素材需求'
            : dialog.kind === 'creativeReferences' ? '治理项目设定' : '编辑素材需求'}
          onOpenChange={(open) => { if (!open) setDialog(null) }}
          onSaved={(record) => {
            if (dialog.kind === 'creativeReferences') setSelectedReferenceId(record.ID)
            void queryClient.invalidateQueries({ queryKey })
          }}
          onDeleted={() => {
            if (dialog.kind === 'creativeReferences') setSelectedReferenceId(null)
            void queryClient.invalidateQueries({ queryKey })
          }}
        />
      ) : null}
    </div>
  )
}

function MiniMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon size={12} />
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
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

function referenceKindLabel(kind?: unknown) {
  const labels: Record<string, string> = {
    person: '人物',
    place: '场景',
    prop: '道具',
    product: '产品',
    brand: '品牌',
    style: '风格',
    world_rule: '世界规则',
    time_period: '时间段',
    restriction: '限制',
  }
  return labels[String(kind ?? '')] ?? String(kind ?? '设定')
}

function assetSlotMergeKey(slot: WorkspaceRecord) {
  return [
    String(slot.kind ?? '').trim().toLowerCase(),
    titleOf(slot, '').trim().toLowerCase().replace(/\s+/g, ''),
    String(slot.owner_type ?? '').trim().toLowerCase(),
    String(slot.owner_id ?? ''),
  ].join(':')
}

function creativeReferencePatchPayload(record: Partial<WorkspaceRecord>, patch: SemanticEntityPayload = {}): SemanticEntityPayload {
  return {
    source_script_id: nullableNumber(record.source_script_id),
    source_analysis_id: nullableNumber(record.source_analysis_id),
    kind: String(patch.kind ?? record.kind ?? ''),
    name: String(patch.name ?? record.name ?? record.title ?? record.label ?? ''),
    alias: String(patch.alias ?? record.alias ?? ''),
    description: String(patch.description ?? record.description ?? ''),
    content: String(patch.content ?? record.content ?? ''),
    importance: String(patch.importance ?? record.importance ?? ''),
    status: String(patch.status ?? record.status ?? ''),
    profile_json: String(patch.profile_json ?? record.profile_json ?? ''),
    tags_json: String(patch.tags_json ?? record.tags_json ?? ''),
    ...patch,
  }
}

function summarizeCurrentState(data: WorkspaceData) {
  return {
    creativeReferences: data.creativeReferences.length,
    assetSlots: data.assetSlots.length,
    productions: data.productions.length,
    relationships: data.creativeRelationships.length,
    usages: data.creativeReferenceUsages.length,
  }
}

function projectProposalBackendWriteCount(backendApply: Record<string, unknown> | undefined): number {
  if (!isRecord(backendApply)) return 0
  const response = isRecord(backendApply.response) ? backendApply.response : null
  const counts = response && isRecord(response.counts) ? response.counts : null
  if (!counts) return 0
  return Object.values(counts).reduce<number>((sum, value) => sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0), 0)
}

function nullableNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function dedupeDrafts(drafts: AgentDraft[]) {
  const seen = new Set<string>()
  const result: AgentDraft[] = []
  for (const draft of drafts) {
    if (seen.has(draft.id)) continue
    seen.add(draft.id)
    result.push(draft)
  }
  return result
}
