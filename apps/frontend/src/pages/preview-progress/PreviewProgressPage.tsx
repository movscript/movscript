import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Film,
  Layers,
  ListChecks,
  PackageCheck,
  Play,
  Route,
  ScrollText,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react'

import {
  getLatestProjectPreviewDraft,
  type GetLatestProjectPreviewDraftResponse,
  type SaveProjectPreviewDraftResponse,
} from '@/api/projectPreview'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge, Button, Progress } from '@movscript/ui'

type PreviewRunStatus = 'confirmed' | 'waiting_review' | 'in_progress' | 'blocked'
type PreviewStepStatus = 'done' | 'active' | 'waiting' | 'blocked'

interface PreviewProgressRecord {
  id: string
  title: string
  sourceLabel: string
  status: PreviewRunStatus
  progress: number
  createdAt: string
  confirmedAt?: string
  savedAt: string
  summary: string
  stats: {
    segments: number
    storyboardRows: number
    keyframes: number
    timelineItems: number
    assetGaps: number
    acceptedKeyframes: number
    acceptedTimelineItems: number
    resolvedAssetGaps: number
  }
  steps: PreviewProgressStep[]
  nextActions: string[]
}

interface PreviewProgressStep {
  id: string
  title: string
  detail: string
  status: PreviewStepStatus
  progress: number
}

export default function PreviewProgressPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const [selectedRecordId, setSelectedRecordId] = useState<string>('')

  const { data, isLoading, isError, error } = useQuery<GetLatestProjectPreviewDraftResponse>({
    queryKey: ['project-preview-progress', projectId],
    queryFn: () => getLatestProjectPreviewDraft(projectId!),
    enabled: !!projectId,
  })

  const records = useMemo(() => buildPreviewProgressRecords(data), [data])
  const selectedRecord = records.find((item) => item.id === selectedRecordId) ?? records[0] ?? null

  useEffect(() => {
    if (selectedRecordId && !records.some((item) => item.id === selectedRecordId)) {
      setSelectedRecordId('')
    }
  }, [records, selectedRecordId])

  const aggregate = useMemo(() => {
    const confirmed = records.filter((item) => item.status === 'confirmed').length
    const active = records.filter((item) => item.status === 'waiting_review' || item.status === 'in_progress').length
    const blocked = records.filter((item) => item.status === 'blocked').length
    const average = records.length ? Math.round(records.reduce((sum, item) => sum + item.progress, 0) / records.length) : 0
    return { confirmed, active, blocked, average }
  }, [records])

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="flex h-full min-w-[1180px] flex-col">
        <header className="border-b border-border bg-card px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <ListChecks size={14} />
                <span>{project?.name ?? '当前项目'}</span>
                <ArrowRight size={13} />
                <span>预演进度</span>
                <Badge variant="outline">确认记录 / 生产门禁</Badge>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">预演进度</h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                查看每次制作预演从草稿、结构解析、关键帧候选到最终确认的推进状态。当前版本先展示最近一条预演草稿，后续可直接接入多条确认记录。
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/project-preview">
                  <Film size={15} />
                  打开制作编排
                </Link>
              </Button>
              <Button className="gap-2" asChild>
                <Link to="/workbench/preview">
                  <Play size={15} />
                  进入项目预演
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_330px] gap-4 overflow-hidden p-4">
          <aside className="min-h-0 space-y-4 overflow-y-auto">
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="已确认" value={aggregate.confirmed} />
                <Metric label="进行中" value={aggregate.active} />
                <Metric label="阻塞" value={aggregate.blocked} />
                <Metric label="平均进度" value={`${aggregate.average}%`} />
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <ScrollText size={16} className="text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">预演记录</h2>
                </div>
                <Badge variant="outline">{records.length}</Badge>
              </div>
              <div className="space-y-2 p-3">
                {isLoading ? (
                  <StatusBlock icon={Clock3} title="正在读取预演记录" text="正在从当前项目读取最近保存的制作预演草稿。" />
                ) : isError ? (
                  <StatusBlock icon={XCircle} title="读取失败" text={error instanceof Error ? error.message : '无法读取预演记录'} tone="danger" />
                ) : records.length === 0 ? (
                  <StatusBlock icon={Film} title="暂无预演记录" text="在制作编排保存并到项目预演确认后，这里会出现一条记录。" />
                ) : (
                  records.map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => setSelectedRecordId(record.id)}
                      className={cn(
                        'w-full rounded-md border px-3 py-3 text-left transition-colors',
                        selectedRecord?.id === record.id ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{record.title}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{record.sourceLabel}</p>
                        </div>
                        <RunStatusBadge status={record.status} />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Progress value={record.progress} className="h-1.5 flex-1" />
                        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{record.progress}%</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">最近保存 {formatDateTime(record.savedAt)}</p>
                    </button>
                  ))
                )}
              </div>
            </section>
          </aside>

          <main className="min-h-0 overflow-y-auto">
            {selectedRecord ? (
              <div className="space-y-4">
                <section className="rounded-lg border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <RunStatusBadge status={selectedRecord.status} />
                        <Badge variant="outline">{selectedRecord.id}</Badge>
                      </div>
                      <h2 className="mt-3 text-xl font-semibold text-foreground">{selectedRecord.title}</h2>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{selectedRecord.summary}</p>
                    </div>
                    <div className="w-40 shrink-0 rounded-md border border-border bg-background p-3">
                      <p className="text-xs text-muted-foreground">总体进度</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{selectedRecord.progress}%</p>
                      <Progress value={selectedRecord.progress} className="mt-3 h-2" />
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-4">
                    <StatCard icon={Layers} label="片段" value={selectedRecord.stats.segments} />
                    <StatCard icon={Route} label="时间线" value={selectedRecord.stats.timelineItems} />
                    <StatCard icon={Sparkles} label="关键帧" value={`${selectedRecord.stats.acceptedKeyframes}/${selectedRecord.stats.keyframes}`} />
                    <StatCard icon={PackageCheck} label="素材缺口" value={selectedRecord.stats.assetGaps} />
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-foreground">预演推进轨道</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">每一条确认记录都保留独立的阶段进度和阻塞原因。</p>
                    </div>
                    <Badge variant="outline">{selectedRecord.steps.filter((step) => step.status === 'done').length}/{selectedRecord.steps.length}</Badge>
                  </div>
                  <div className="p-4">
                    <div className="space-y-3">
                      {selectedRecord.steps.map((step, index) => (
                        <div key={step.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                          <StepMarker status={step.status} index={index + 1} />
                          <div className="rounded-md border border-border bg-background p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">{step.title}</p>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                              </div>
                              <StepStatusBadge status={step.status} />
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <Progress value={step.progress} className="h-1.5 flex-1" />
                              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{step.progress}%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <StatusBlock icon={Film} title="等待预演记录" text="确认预演后，可以在这里检查每条记录的进度、门禁和下一步动作。" />
              </div>
            )}
          </main>

          <aside className="min-h-0 space-y-4 overflow-y-auto">
            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <ShieldCheck size={16} className="text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">确认门禁</h2>
              </div>
              <div className="space-y-2 p-4">
                {selectedRecord ? (
                  <>
                    <GateItem label="结构已解析" done={selectedRecord.stats.segments > 0} />
                    <GateItem label="预演时间线" done={selectedRecord.stats.timelineItems > 0} />
                    <GateItem label="关键帧已确认" done={selectedRecord.stats.acceptedKeyframes > 0 || selectedRecord.stats.keyframes === 0} />
                    <GateItem label="素材缺口可控" done={selectedRecord.stats.assetGaps === 0 || selectedRecord.stats.resolvedAssetGaps > 0} />
                    <GateItem label="预演已确认" done={selectedRecord.status === 'confirmed'} />
                  </>
                ) : (
                  <StatusBlock icon={Clock3} title="暂无门禁状态" text="选择一条预演记录查看确认条件。" />
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <ListChecks size={16} className="text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">下一步</h2>
              </div>
              <div className="space-y-2 p-4">
                {selectedRecord?.nextActions.length ? selectedRecord.nextActions.map((action) => (
                  <div key={action} className="rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground">
                    {action}
                  </div>
                )) : (
                  <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm leading-6 text-muted-foreground">暂无建议动作。</p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <FileText size={16} className="text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">记录说明</h2>
              </div>
              <div className="space-y-3 p-4 text-sm leading-6 text-muted-foreground">
                <p>一条预演记录对应一次被确认的制作预演。记录保留版本来源、时间线、候选关键帧、素材缺口和确认门禁。</p>
                <p>当前后端只暴露最近草稿；页面已经按多记录列表设计，后续增加 records API 后可直接扩展为完整历史。</p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

function buildPreviewProgressRecords(data?: GetLatestProjectPreviewDraftResponse): PreviewProgressRecord[] {
  if (!data?.found || !data.draft) return []
  return [mapDraftToRecord(data.draft)]
}

function mapDraftToRecord(response: SaveProjectPreviewDraftResponse): PreviewProgressRecord {
  const draft = response.draft
  const analysis = draft.analysis_candidates
  const preview = draft.preview_candidates
  const segments = analysis?.segments.length ?? 0
  const storyboardRows = draft.storyboard_rows.length
  const keyframes = preview?.keyframe_candidates.length ?? 0
  const timelineItems = preview?.preview_timeline.length || draft.preview_timeline.length
  const assetGaps = preview?.asset_gaps.length ?? 0
  const acceptedKeyframes = preview?.keyframe_candidates.filter((item) => item.decision_status === 'accepted').length ?? 0
  const acceptedTimelineItems = preview?.preview_timeline.filter((item) => item.confirmation_status === 'accepted').length ?? 0
  const resolvedAssetGaps = preview?.asset_gaps.filter((item) => item.status === 'resolved' || item.status === 'accepted').length ?? 0
  const confirmed = draft.preview_status === 'ready_for_production' || !!draft.confirmed_at
  const blocked = assetGaps > 0 && resolvedAssetGaps === 0 && keyframes > 0
  const status: PreviewRunStatus = confirmed
    ? 'confirmed'
    : blocked
      ? 'blocked'
      : timelineItems > 0 || keyframes > 0
        ? 'waiting_review'
        : 'in_progress'

  const steps: PreviewProgressStep[] = [
    {
      id: 'source',
      title: '剧本版本已载入',
      detail: draft.script_version.title || '已保存剧本来源和正文证据。',
      status: 'done',
      progress: 100,
    },
    {
      id: 'analysis',
      title: '结构解析',
      detail: segments > 0 ? `已生成 ${segments} 个片段和 ${analysis?.storyboard_suggestions.length ?? 0} 条分镜建议。` : '等待解析片段、情节和分镜建议。',
      status: segments > 0 ? 'done' : 'active',
      progress: segments > 0 ? 100 : 35,
    },
    {
      id: 'preview',
      title: '预演候选生成',
      detail: timelineItems > 0 ? `已生成 ${timelineItems} 个时间线片段和 ${keyframes} 个关键帧候选。` : '等待生成可播放的预演时间线。',
      status: timelineItems > 0 ? 'done' : segments > 0 ? 'active' : 'waiting',
      progress: timelineItems > 0 ? 100 : segments > 0 ? 55 : 0,
    },
    {
      id: 'review',
      title: '候选审查',
      detail: keyframes > 0 ? `关键帧确认 ${acceptedKeyframes}/${keyframes}，时间线确认 ${acceptedTimelineItems}/${timelineItems}。` : '等待用户审查关键帧、时间线和素材缺口。',
      status: acceptedKeyframes > 0 || acceptedTimelineItems > 0 ? 'done' : keyframes > 0 ? 'active' : 'waiting',
      progress: keyframes > 0 ? Math.round(((acceptedKeyframes + acceptedTimelineItems) / Math.max(1, keyframes + timelineItems)) * 100) : 0,
    },
    {
      id: 'gate',
      title: '确认进入生产',
      detail: confirmed ? `已于 ${formatDateTime(draft.confirmed_at || response.saved_at)} 确认预演。` : blocked ? '仍有素材缺口或候选未确认，暂不建议进入生产。' : '等待在工作台确认预演。',
      status: confirmed ? 'done' : blocked ? 'blocked' : 'waiting',
      progress: confirmed ? 100 : 0,
    },
  ]

  const progress = Math.round(steps.reduce((sum, step) => sum + step.progress, 0) / steps.length)
  const nextActions = response.next_actions.length > 0 ? response.next_actions : deriveNextActions({ segments, timelineItems, keyframes, acceptedKeyframes, assetGaps, resolvedAssetGaps, confirmed })

  return {
    id: response.draft_id,
    title: draft.script_version.title || '未命名预演',
    sourceLabel: draft.script_version.source_type === 'storyboard_script' ? '分镜脚本来源' : draft.script_version.source_type === 'brief' ? 'Brief 来源' : '剧本版本来源',
    status,
    progress: confirmed ? 100 : progress,
    createdAt: response.saved_at,
    confirmedAt: draft.confirmed_at || undefined,
    savedAt: response.saved_at,
    summary: confirmed ? '这条预演已经确认，可作为后续内容生产和交付门禁的来源。' : '这条预演仍处在确认流程中，需要继续处理结构、候选、素材缺口或最终确认。',
    stats: {
      segments,
      storyboardRows,
      keyframes,
      timelineItems,
      assetGaps,
      acceptedKeyframes,
      acceptedTimelineItems,
      resolvedAssetGaps,
    },
    steps,
    nextActions,
  }
}

function deriveNextActions(input: {
  segments: number
  timelineItems: number
  keyframes: number
  acceptedKeyframes: number
  assetGaps: number
  resolvedAssetGaps: number
  confirmed: boolean
}) {
  if (input.confirmed) return ['进入内容生产，基于已确认预演拆分生产任务。']
  if (input.segments === 0) return ['返回制作编排，先解析剧本结构。']
  if (input.timelineItems === 0) return ['生成预演时间线和关键帧候选。']
  if (input.keyframes > 0 && input.acceptedKeyframes === 0) return ['在项目预演工作台确认关键帧候选。']
  if (input.assetGaps > 0 && input.resolvedAssetGaps === 0) return ['补齐或接受高优先素材缺口。']
  return ['在项目预演工作台确认当前预演，生成正式预演记录。']
}

function formatDateTime(value: string) {
  if (!value) return '未记录'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function RunStatusBadge({ status }: { status: PreviewRunStatus }) {
  const config = {
    confirmed: { label: '已确认', variant: 'success' as const, icon: CheckCircle2 },
    waiting_review: { label: '待确认', variant: 'warning' as const, icon: Clock3 },
    in_progress: { label: '生成中', variant: 'secondary' as const, icon: Sparkles },
    blocked: { label: '阻塞', variant: 'danger' as const, icon: AlertTriangle },
  }[status]
  const Icon = config.icon
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon size={12} />
      {config.label}
    </Badge>
  )
}

function StepStatusBadge({ status }: { status: PreviewStepStatus }) {
  const config = {
    done: { label: '完成', variant: 'success' as const },
    active: { label: '处理中', variant: 'warning' as const },
    waiting: { label: '等待', variant: 'secondary' as const },
    blocked: { label: '阻塞', variant: 'danger' as const },
  }[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

function StepMarker({ status, index }: { status: PreviewStepStatus; index: number }) {
  const Icon = status === 'done' ? CheckCircle2 : status === 'blocked' ? AlertTriangle : Clock3
  return (
    <div className="flex flex-col items-center">
      <div className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold',
        status === 'done' && 'border-emerald-500 bg-emerald-500 text-white',
        status === 'active' && 'border-amber-500 bg-amber-50 text-amber-700',
        status === 'waiting' && 'border-border bg-muted text-muted-foreground',
        status === 'blocked' && 'border-red-500 bg-red-50 text-red-700',
      )}>
        {status === 'waiting' ? index : <Icon size={14} />}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function GateItem({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
      <span className="min-w-0 truncate text-sm text-foreground">{label}</span>
      <Badge variant={done ? 'success' : 'secondary'}>{done ? '通过' : '待处理'}</Badge>
    </div>
  )
}

function StatusBlock({
  icon: Icon,
  title,
  text,
  tone = 'neutral',
}: {
  icon: LucideIcon
  title: string
  text: string
  tone?: 'neutral' | 'danger'
}) {
  return (
    <div className={cn(
      'rounded-md border px-3 py-5 text-center',
      tone === 'danger' ? 'border-red-200 bg-red-50 text-red-700' : 'border-dashed border-border bg-background',
    )}>
      <Icon size={18} className="mx-auto text-muted-foreground" />
      <p className="mt-2 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
    </div>
  )
}
