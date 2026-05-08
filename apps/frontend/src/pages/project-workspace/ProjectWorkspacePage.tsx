import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  GitMerge,
  Layers3,
  Loader2,
  Lock,
  PackageCheck,
  PanelRightClose,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import { Badge, Button, Card, Textarea } from '@movscript/ui'

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
import { openAgentPanelDraft } from '@/lib/agentPanelBridge'
import { localAgentClient, type AgentDraft, type AgentManifest } from '@/lib/localAgentClient'
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
  const [dialog, setDialog] = useState<DialogState>(null)
  const [selectedReferenceId, setSelectedReferenceId] = useState<number | null>(null)
  const [orchestrationPrompt, setOrchestrationPrompt] = useState('')
  const [launching, setLaunching] = useState(false)
  const [applyingDraftId, setApplyingDraftId] = useState<string | null>(null)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [draggingReferenceId, setDraggingReferenceId] = useState<number | null>(null)
  const [dropTargetReferenceId, setDropTargetReferenceId] = useState<number | null>(null)
  const [mergingReferences, setMergingReferences] = useState(false)
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)

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

  const draftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['project-workspace-drafts', projectId, pageKey, activeDraftId],
    queryFn: async () => {
      if (!projectId || !pageKey) return []
      if (activeDraftId) {
        const draft = await localAgentClient.getDraft(activeDraftId)
        return draft.kind === 'project_proposal' ? [draft] : []
      }
      return []
    },
    enabled: !!projectId && !!pageKey,
    refetchInterval: activeDraftId ? 1500 : false,
    refetchIntervalInBackground: false,
  })

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

  const draftCounts = useMemo(() => {
    const drafts = draftsQuery.data ?? []
    return {
      draft: drafts.filter((item) => item.status === 'draft').length,
      applied: drafts.filter((item) => item.status === 'applied').length,
    }
  }, [draftsQuery.data])

  async function startProjectOrchestration() {
    if (!projectId || !pageKey) return
    setLaunching(true)
    try {
      const draftShell = await localAgentClient.createDraft({
        projectId,
        kind: 'project_proposal',
        title: `项目提案草稿 - ${project?.name ?? `#${projectId}`}`,
        content: JSON.stringify({
          scope: 'project_proposal',
          projectId,
          summary: '',
          proposal: {
            creative_references: [],
            asset_slots: [],
          },
          operations: [],
          reference_changes: [],
          asset_locks: [],
          impact_notes: [],
          createdAt: new Date().toISOString(),
        }, null, 2),
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
          analysisScope: 'project',
        },
      })
      setActiveDraftId(draftShell.id)

      const requestId = `project_orchestrate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      const prompt = buildProjectOrchestrationPrompt({
        projectName: project?.name ?? `项目 #${projectId}`,
        draftId: draftShell.id,
        userPrompt: orchestrationPrompt,
        data,
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
          message: prompt,
          labels: ['project-workspace', 'project-orchestration', 'draft-application'],
          hints: {
            projectId,
            draftId: draftShell.id,
            route: { pathname: '/project-workspace' },
            selection: { entityType: 'project', entityId: projectId, label: project?.name ?? `项目 #${projectId}` },
          },
        }),
        agentManifest: PROJECT_ORCHESTRATION_AGENT_MANIFEST,
        runPolicy: { maxToolCalls: 30, maxIterations: 18 },
        timeoutMs: 180_000,
        renderMode: 'page',
      })
      toast.info('已打开项目提案会话；AI 生成的草稿会回到右侧面板审阅')
      await draftsQuery.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '项目提案启动失败')
    } finally {
      setLaunching(false)
    }
  }

  async function applyDraft(draft: AgentDraft) {
    if (!projectId) return
    setApplyingDraftId(draft.id)
    try {
      const result = await localAgentClient.applyDraft(draft.id, {
        target: {
          projectId,
          entityType: 'project',
          entityId: projectId,
          field: 'proposal',
        },
        currentValue: summarizeCurrentState(data),
        proposedValue: draft.content,
      })
      const writeCount = projectProposalBackendWriteCount(result.backendApply)
      toast.success(writeCount > 0 ? `草稿已应用，写入 ${writeCount} 项变更` : '草稿已标记应用')
      await queryClient.invalidateQueries({ queryKey })
      await refetch()
      await draftsQuery.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '草稿应用失败')
    } finally {
      setApplyingDraftId(null)
    }
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

  const drafts = draftsQuery.data ?? []

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
            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={startProjectOrchestration} loading={launching} disabled={!projectId}>
              <Wand2 size={13} />
              编排到 AI 面板
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
            <div className="mx-auto flex w-full min-w-[980px] max-w-[1360px] flex-col gap-4 p-5">
              <section className="grid gap-3 sm:grid-cols-2">
                <StatCard title="项目设定" value={derived.activeReferences.length} detail={`${derived.lockedReferences} 个已确认或锁定`} icon={Sparkles} />
                <StatCard title="素材需求" value={data.assetSlots.length} detail={`${derived.lockedAssets} 个已锁定或豁免`} icon={PackageCheck} />
              </section>

              <section className="grid min-w-0 gap-4 xl:h-[560px] xl:grid-cols-[minmax(0,1fr)_320px]">
                  <Card className="flex min-h-0 flex-col overflow-hidden rounded-lg border-border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">当前设定</h2>
                        <p className="mt-1 text-xs text-muted-foreground">直接修改、删除，或处理重复设定。</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setDialog({ mode: 'create', kind: 'creativeReferences' })}>
                          <Plus size={12} />
                          新建设定
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => selectedReference && setDialog({ mode: 'edit', kind: 'creativeReferences', record: selectedReference })} disabled={!selectedReference}>
                          <Pencil size={12} />
                          修改
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" asChild>
                          <Link to="/creative-references">
                            全部设定
                            <ArrowRight size={12} />
                          </Link>
                        </Button>
                      </div>
                    </div>

                    <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
                      <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
                        {derived.activeReferences.length === 0 ? (
                          <EmptyBlock title="暂无项目设定" detail="在这里创建人物、场景、道具和风格后，制作编排只引用这些设定。" />
                        ) : derived.activeReferences.map((reference) => (
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
                            onClick={() => setSelectedReferenceId(reference.ID)}
                            className={cn(
                              'w-full rounded-md border px-3 py-2.5 text-left transition-colors',
                              selectedReference?.ID === reference.ID ? 'border-primary/50 bg-primary/5' : 'border-border bg-background hover:bg-muted/40',
                              draggingReferenceId === reference.ID && 'opacity-50',
                              dropTargetReferenceId === reference.ID && draggingReferenceId !== reference.ID && 'border-emerald-500 bg-emerald-500/10',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-medium text-foreground">{titleOf(reference, `设定 #${reference.ID}`)}</p>
                              <Badge variant={statusVariant(reference.status)} className="shrink-0 text-[10px]">{statusLabel(reference.status)}</Badge>
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {referenceKindLabel(reference.kind)} · {dropTargetReferenceId === reference.ID && draggingReferenceId !== reference.ID ? '松开合并到此设定' : bodyOf(reference)}
                            </p>
                          </button>
                        ))}
                      </div>

                      <div className="min-h-0 min-w-0 overflow-y-auto rounded-lg border border-border bg-background p-4">
                        {selectedReference ? (
                          <>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="truncate text-base font-semibold text-foreground">{titleOf(selectedReference, `设定 #${selectedReference.ID}`)}</h3>
                                  <Badge variant={statusVariant(selectedReference.status)}>{statusLabel(selectedReference.status)}</Badge>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">{referenceKindLabel(selectedReference.kind)} · ID {selectedReference.ID}</p>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setDialog({ mode: 'edit', kind: 'creativeReferences', record: selectedReference })}>
                                  <Pencil size={12} />
                                  编辑
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setDialog({ mode: 'edit', kind: 'creativeReferences', record: selectedReference })}>
                                  <Trash2 size={12} />
                                  删除
                                </Button>
                              </div>
                            </div>
                            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground">{bodyOf(selectedReference, '这个设定还没有补充说明。')}</p>
                            <div className="mt-4 grid gap-2 md:grid-cols-3">
                              <MiniMetric icon={Route} label="引用次数" value={selectedReferenceUsageCount} />
                              <MiniMetric icon={PackageCheck} label="素材需求" value={selectedReferenceAssets.length} />
                              <MiniMetric icon={Lock} label="锁定素材" value={statusCount(selectedReferenceAssets, ['locked', 'waived'])} />
                            </div>
                            <div className="mt-4">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-foreground">关联素材需求</p>
                                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setDialog({ mode: 'create', kind: 'assetSlots' })}>
                                  <Plus size={12} />
                                  锁定需求
                                </Button>
                              </div>
                              <div className="grid gap-2 md:grid-cols-2">
                                {selectedReferenceAssets.length === 0 ? (
                                  <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground md:col-span-2">这个设定还没有素材需求。</div>
                                ) : selectedReferenceAssets.slice(0, 4).map((slot) => (
                                  <button
                                    key={slot.ID}
                                    type="button"
                                    onClick={() => setDialog({ mode: 'edit', kind: 'assetSlots', record: slot })}
                                    className="rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/40"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="truncate text-xs font-medium text-foreground">{titleOf(slot, `素材需求 #${slot.ID}`)}</p>
                                      <Badge variant={statusVariant(slot.status)} className="shrink-0 text-[10px]">{statusLabel(slot.status)}</Badge>
                                    </div>
                                    <p className="mt-1 truncate text-[11px] text-muted-foreground">{bodyOf(slot)}</p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        ) : (
                          <EmptyBlock title="未选择设定" detail="选择一个设定查看引用、素材需求和治理操作。" />
                        )}
                      </div>
                    </div>
                  </Card>

                  <div className="flex h-full min-w-0 flex-col gap-4">
                    <Card className="min-h-0 flex-1 overflow-y-auto rounded-lg border-border bg-card p-4 shadow-sm">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-sm font-semibold text-foreground">合并候选</h2>
                          <p className="mt-1 text-xs text-muted-foreground">同名同类设定集中处理。</p>
                        </div>
                        <GitMerge size={16} className="text-muted-foreground" />
                      </div>
                      <div className="space-y-2">
                        {mergeCandidates.length === 0 ? (
                          <EmptyBlock title="暂无明显重复" detail="后续可以在这里承接 AI 的合并建议。" compact />
                        ) : mergeCandidates.map((items) => (
                          <div key={items.map((item) => item.ID).join('-')} className="rounded-md border border-border bg-background p-3">
                            <p className="truncate text-xs font-medium text-foreground">{titleOf(items[0], `设定 #${items[0].ID}`)}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">{items.length} 个同名设定</p>
                            <Button size="sm" variant="outline" className="mt-2 h-7 gap-1.5 text-xs" onClick={() => setDialog({ mode: 'edit', kind: 'creativeReferences', record: items[0] })}>
                              处理合并
                            </Button>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
              </section>
            </div>
          )}
        </main>

        <aside className={cn(
          'flex h-full min-h-0 shrink-0 flex-col border-l border-border bg-card transition-all duration-200',
          panelCollapsed ? 'w-[52px]' : 'w-[420px]',
        )}>
          <div className={cn(
            'flex shrink-0 items-center border-b border-border py-3',
            panelCollapsed ? 'justify-center px-0' : 'justify-between px-4',
          )}>
            {panelCollapsed ? (
              <Button
                size="icon"
                variant="ghost"
                className="relative h-8 w-8"
                title="展开编排面板"
                onClick={() => setPanelCollapsed(false)}
              >
                <Sparkles size={15} className="text-primary" />
                {draftCounts.draft > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                    {draftCounts.draft}
                  </span>
                ) : null}
              </Button>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <PanelRightClose size={15} className="text-muted-foreground" />
                  <Sparkles size={15} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">编排面板</span>
                  {draftsQuery.isFetching ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => draftsQuery.refetch()}>
                    <RefreshCw size={12} />
                    草稿
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="收起编排面板"
                    onClick={() => setPanelCollapsed(true)}
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </>
            )}
          </div>

          {!panelCollapsed ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="border-b border-border px-4 py-3">
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-semibold text-foreground">{project?.name ?? '当前项目'}</p>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  项目编排负责创建、修改、删除、合并设定，并锁定项目级素材需求；制作编排只引用这些结果。
                </p>
              </div>
              <div className="mt-3 rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-2">
                  <Wand2 size={14} className="text-primary" />
                  <p className="text-xs font-semibold text-foreground">编排要求</p>
                </div>
                <Textarea
                  className="mt-2 min-h-24 resize-none text-xs leading-relaxed"
                  placeholder="补充项目级编排要求，例如：合并重复人物设定；锁定主角素材需求；清理未被制作引用的道具设定。"
                  value={orchestrationPrompt}
                  onChange={(event) => setOrchestrationPrompt(event.target.value)}
                />
                <Button className="mt-3 h-8 w-full gap-1.5 text-xs" onClick={startProjectOrchestration} loading={launching} disabled={!projectId}>
                  <Wand2 size={13} />
                  重新发起项目编排
                </Button>
              </div>
              <div className="mt-3 rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-2">
                  <ClipboardCheck size={14} className="text-primary" />
                  <p className="text-xs font-semibold text-foreground">当前结构</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <ContextLine icon={Sparkles} label="设定" value={`${derived.activeReferences.length}`} />
                  <ContextLine icon={PackageCheck} label="素材需求" value={`${data.assetSlots.length}`} />
                  <ContextLine icon={Route} label="制作" value={`${data.productions.length}`} />
                  <ContextLine icon={GitMerge} label="合并候选" value={`${mergeCandidates.length}`} />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground">AI 草稿应用</p>
                <Badge variant="secondary" className="text-[10px]">draft {draftCounts.draft}</Badge>
              </div>
              {draftsQuery.isLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-3 text-xs text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" />
                  读取草稿…
                </div>
              ) : drafts.length === 0 ? (
                <EmptyBlock title="暂无项目编排草稿" detail="从上方发起项目编排后，AI 的治理建议会进入这里逐项审阅。" />
              ) : drafts.map((draft) => (
                <div key={draft.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">{draft.title}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{formatDate(draft.updatedAt)} · {draft.id}</p>
                    </div>
                    <Badge variant={draftStatusVariant(draft.status)} className="shrink-0 text-[10px]">{draftStatusLabel(draft.status)}</Badge>
                  </div>
                  <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-[10px] leading-4 text-muted-foreground">
                    {draft.content}
                  </pre>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" className="h-7 flex-1 gap-1.5 text-xs" onClick={() => applyDraft(draft)} loading={applyingDraftId === draft.id} disabled={draft.status === 'applied'}>
                      <CheckCircle2 size={12} />
                      应用草稿
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" asChild>
                      <Link to="/agent/drafts">
                        <FileText size={12} />
                        历史
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          ) : (
            <div className="flex-1" />
          )}
        </aside>
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

function ContextLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon size={11} />
        {label}
      </div>
      <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</p>
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function buildProjectOrchestrationPrompt(input: {
  projectName: string
  draftId: string
  userPrompt: string
  data: WorkspaceData
}) {
  const snapshot = {
    projectName: input.projectName,
    counts: summarizeCurrentState(input.data),
    references: input.data.creativeReferences.slice(0, 80).map((item) => ({
      id: item.ID,
      name: titleOf(item, `设定 #${item.ID}`),
      kind: item.kind,
      status: item.status,
      description: bodyOf(item, ''),
    })),
    assetSlots: input.data.assetSlots.slice(0, 80).map((item) => ({
      id: item.ID,
      name: titleOf(item, `素材需求 #${item.ID}`),
      kind: item.kind,
      status: item.status,
      priority: item.priority,
      creative_reference_id: item.creative_reference_id,
      description: bodyOf(item, ''),
    })),
    productions: input.data.productions.slice(0, 30).map((item) => ({
      id: item.ID,
      name: titleOf(item, `制作 #${item.ID}`),
      status: item.status,
      description: bodyOf(item, ''),
    })),
  }

  return [
    `你是项目提案助手。请基于当前项目现状，产出项目级治理草稿，并写入本地 draft：${input.draftId}。`,
    '',
    '边界：',
    '- 项目编排负责创建、修改、删除、合并设定，以及锁定项目级素材需求。',
    '- 如果当前上下文提供了 productionId 或当前制作信息，先读取当前制作和剧本，再回到项目级结论。',
    '- 制作编排只引用项目设定和素材需求，不在这里展开制作项、镜头、关键帧或 prompt。',
    '- 不要直接修改正式后端实体；只更新本地 draft，等待用户在编排面板应用。',
    '',
    '请把 draft content 更新为 JSON，结构如下：',
    JSON.stringify({
      scope: 'project_proposal',
      summary: '一句话概述项目现状',
      proposal: {
        creative_references: [
          { action: 'create|update|delete|merge', entity: 'creativeReferences', target_id: 0, payload: {} },
        ],
        asset_slots: [
          { action: 'create|update|delete|lock_asset', entity: 'assetSlots', target_id: 0, payload: {} },
        ],
      },
      operations: [],
    }, null, 2),
    '',
    input.userPrompt.trim() ? `用户补充要求：\n${input.userPrompt.trim()}\n` : '',
    '当前项目快照：',
    JSON.stringify(snapshot, null, 2),
  ].filter(Boolean).join('\n')
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

const PROJECT_ORCHESTRATION_AGENT_MANIFEST: AgentManifest = {
  schema: 'movscript.agent.current',
  id: 'project-orchestration-workbench',
  version: '1.0.0',
  name: '项目提案助手',
  description: '整理项目级设定、素材需求和跨制作引用，生成可审阅的项目提案草稿',
  soul: `你是项目级提案助手。你的目标是帮助用户治理项目设定和素材需求。

只写本地 draft，不直接改正式项目实体。
输出要围绕：创建设定、修改设定、删除设定、合并重复设定、锁定素材需求、说明对制作引用的影响。
如果当前上下文里有 productionId 或当前制作信息，可以先读取当前制作和剧本，再整理项目级结论。
不要生成制作项、关键帧、台词终稿、运镜表或 prompt。制作编排只引用项目编排的结果。`,
  permissions: ['project.read', 'draft.read', 'draft.write'],
  tools: [
    { name: 'movscript_get_context_pack', mode: 'allow', approval: 'never' },
    { name: 'movscript_list_productions', mode: 'allow', approval: 'never' },
    { name: 'movscript_read_current_production', mode: 'allow', approval: 'never' },
    { name: 'movscript_build_orchestration_diff', mode: 'allow', approval: 'never' },
    { name: 'movscript_get_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_list_drafts', mode: 'allow', approval: 'never' },
    { name: 'movscript_update_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_patch_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_validate_draft', mode: 'allow', approval: 'never' },
    { name: 'movscript_request_user_input', mode: 'allow', approval: 'never' },
  ],
}
