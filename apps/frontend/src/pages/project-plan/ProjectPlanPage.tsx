import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Film,
  Gauge,
  Layers,
  ListChecks,
  PackageCheck,
  Play,
  Presentation,
  ShieldAlert,
  Sparkles,
  Target,
  Wand2,
} from 'lucide-react'

import { getLatestScriptPreviewDraft, type GetLatestScriptPreviewDraftResponse } from '@/api/scriptPreview'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge, Button, Progress } from '@movscript/ui'

type PrepStatus = 'ready' | 'draft' | 'missing' | 'blocked'
type Priority = 'high' | 'medium' | 'low'

interface PrepTrack {
  key: string
  title: string
  description: string
  href: string
  icon: typeof FileText
  status: PrepStatus
  metric: string
  progress: number
}

interface DecisionItem {
  title: string
  detail: string
  priority: Priority
}

const fallbackDecisions: DecisionItem[] = [
  {
    title: '确认提案 PPT 的主沟通对象',
    detail: '先确定面向平台、投资人、导演组还是内部制片，页面结构和素材密度会不同。',
    priority: 'high',
  },
  {
    title: '锁定视频版 PPT 的时长范围',
    detail: '建议先做 60-90 秒，用于验证叙事节奏、旁白和素材缺口。',
    priority: 'medium',
  },
  {
    title: '补齐高优先级素材边界',
    detail: '人物、地点、关键道具和视觉风格需要先形成可复用资料，再进入正式生产。',
    priority: 'medium',
  },
]

function formatDateTime(value?: string) {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '-'
  }
}

function statusLabel(status: PrepStatus) {
  if (status === 'ready') return '可用'
  if (status === 'draft') return '草案'
  if (status === 'blocked') return '阻塞'
  return '缺失'
}

function statusClassName(status: PrepStatus) {
  if (status === 'ready') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (status === 'draft') return 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
  if (status === 'blocked') return 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
  return 'bg-muted text-muted-foreground'
}

function priorityLabel(priority: Priority) {
  if (priority === 'high') return '高'
  if (priority === 'medium') return '中'
  return '低'
}

function priorityClassName(priority: Priority) {
  if (priority === 'high') return 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
  if (priority === 'medium') return 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
  return 'bg-muted text-muted-foreground'
}

function normalizePriority(value?: string): Priority {
  if (value === 'high') return 'high'
  if (value === 'low') return 'low'
  return 'medium'
}

function trackStatus(progress: number): PrepStatus {
  if (progress >= 90) return 'ready'
  if (progress > 0) return 'draft'
  return 'missing'
}

function totalDurationSeconds(items: Array<{ duration_seconds?: number }>) {
  return items.reduce((sum, item) => sum + Math.max(0, item.duration_seconds ?? 0), 0)
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return '-'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes <= 0) return `${rest}s`
  return `${minutes}m ${rest}s`
}

function PrepStatusPill({ status }: { status: PrepStatus }) {
  return (
    <span className={cn('inline-flex rounded-md px-2 py-1 text-xs font-medium', statusClassName(status))}>
      {statusLabel(status)}
    </span>
  )
}

function PrepTrackCard({ track }: { track: PrepTrack }) {
  const Icon = track.icon
  return (
    <Link
      to={track.href}
      className="group flex min-h-[178px] flex-col rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/45 hover:bg-muted/20"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
          <Icon size={17} />
        </span>
        <PrepStatusPill status={track.status} />
      </div>
      <div className="mt-4 min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-foreground">{track.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{track.description}</p>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate text-muted-foreground">{track.metric}</span>
          <span className="shrink-0 font-medium tabular-nums text-foreground">{track.progress}%</span>
        </div>
        <Progress value={track.progress} className="h-1.5" />
      </div>
    </Link>
  )
}

function MetricTile({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string | number
  hint: string
  icon: typeof FileText
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon size={16} />
        </span>
      </div>
    </div>
  )
}

export default function ProjectPlanPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID

  const { data: latestDraft, isLoading } = useQuery<GetLatestScriptPreviewDraftResponse>({
    queryKey: ['script-preview-draft', projectId],
    queryFn: () => getLatestScriptPreviewDraft(projectId!),
    enabled: !!projectId,
  })

  const savedDraft = latestDraft?.found ? latestDraft.draft : undefined
  const draft = savedDraft?.draft
  const storyboardRows = draft?.storyboard_rows ?? []
  const generatedPreview = draft?.preview_candidates
  const keyframes = generatedPreview?.keyframe_candidates ?? []
  const assetGaps = generatedPreview?.asset_gaps ?? []
  const generatedTimeline = generatedPreview?.preview_timeline ?? []
  const timeline = generatedTimeline.length > 0 ? generatedTimeline : (draft?.preview_timeline ?? [])
  const timelineItems = timeline.map((item, index) => {
    const withPreviewFields = item as { label?: unknown; status?: unknown }
    return {
      clientId: item.client_id,
      title: typeof withPreviewFields.label === 'string' && withPreviewFields.label.trim()
        ? withPreviewFields.label
        : `预演片段 ${index + 1}`,
      status: typeof withPreviewFields.status === 'string' && withPreviewFields.status.trim()
        ? withPreviewFields.status
        : '草稿时间线',
      durationSeconds: item.duration_seconds ?? 0,
    }
  })
  const analysis = draft?.analysis_candidates

  const missingGaps = assetGaps.filter((item) => item.status === 'missing')
  const highPriorityMissing = missingGaps.filter((item) => item.priority === 'high')
  const resolvedGaps = assetGaps.filter((item) => item.status === 'accepted' || item.status === 'resolved')
  const readyStoryboardRows = storyboardRows.filter((item) => item.status === '可预演')
  const confirmedPreview = Boolean(draft?.confirmed_at || draft?.preview_status === 'confirmed')

  const prepTracks = useMemo<PrepTrack[]>(() => {
    const sourceProgress = draft?.source_text?.trim() ? 100 : 0
    const structureProgress = storyboardRows.length > 0
      ? Math.round((readyStoryboardRows.length / storyboardRows.length) * 100)
      : 0
    const proposalProgress = analysis?.sections?.length
      ? Math.min(100, Math.round((analysis.sections.length / 6) * 100))
      : storyboardRows.length > 0 ? 50 : 0
    const previewProgress = timeline.length > 0
      ? confirmedPreview ? 100 : 70
      : keyframes.length > 0 ? 45 : 0
    const assetProgress = assetGaps.length > 0
      ? Math.round((resolvedGaps.length / assetGaps.length) * 100)
      : storyboardRows.length > 0 ? 35 : 0

    return [
      {
        key: 'source',
        title: '剧本来源',
        description: '确认筹备草稿来自哪一版剧本，并保留正文证据。',
        href: '/production-preview',
        icon: FileText,
        status: trackStatus(sourceProgress),
        metric: draft?.script_version?.title || '未选择剧本版本',
        progress: sourceProgress,
      },
      {
        key: 'proposal',
        title: '提案结构',
        description: '把剧本拆成可对外沟通的项目概览、故事、人物、视觉和风险页。',
        href: '/production-preview',
        icon: Presentation,
        status: trackStatus(proposalProgress),
        metric: `${analysis?.sections?.length ?? 0} 个理解段落`,
        progress: proposalProgress,
      },
      {
        key: 'storyboard',
        title: '分镜脚本',
        description: '将情境和内容单元整理成可编辑、可确认、可进入预演的片段。',
        href: '/production-preview',
        icon: Layers,
        status: trackStatus(structureProgress),
        metric: `${storyboardRows.length} 个片段`,
        progress: structureProgress,
      },
      {
        key: 'preview',
        title: '视频版 PPT',
        description: '形成可播放的预演时间线，检查旁白、字幕、节奏和关键画面。',
        href: '/production-preview',
        icon: Play,
        status: trackStatus(previewProgress),
        metric: `${timeline.length} 段 · ${formatDuration(totalDurationSeconds(timeline))}`,
        progress: previewProgress,
      },
      {
        key: 'assets',
        title: '素材位',
        description: '从预演结果沉淀人物、地点、道具、风格和关键帧素材缺口。',
        href: '/assets',
        icon: PackageCheck,
        status: highPriorityMissing.length > 0 ? 'blocked' : trackStatus(assetProgress),
        metric: `${missingGaps.length} 项待补`,
        progress: assetProgress,
      },
    ]
  }, [
    analysis?.sections?.length,
    assetGaps.length,
    confirmedPreview,
    draft?.script_version?.title,
    draft?.source_text,
    highPriorityMissing.length,
    keyframes.length,
    missingGaps.length,
    readyStoryboardRows.length,
    resolvedGaps.length,
    storyboardRows.length,
    timeline,
  ])

  const readiness = useMemo(() => {
    if (prepTracks.length === 0) return 0
    const weighted = prepTracks.reduce((sum, track) => {
      const penalty = track.status === 'blocked' ? 15 : 0
      return sum + Math.max(0, track.progress - penalty)
    }, 0)
    return Math.round(weighted / prepTracks.length)
  }, [prepTracks])

  const nextDecisions = useMemo<DecisionItem[]>(() => {
    if (analysis?.confirm_questions?.length) {
      return analysis.confirm_questions.slice(0, 4).map((question, index) => ({
        title: question,
        detail: '来自制作预演分析，需要在筹备包进入生产前确认。',
        priority: index === 0 ? 'high' : 'medium',
      }))
    }
    if (highPriorityMissing.length > 0) {
      return highPriorityMissing.slice(0, 4).map((gap) => ({
        title: `补齐 ${gap.name}`,
        detail: gap.description || '高优先级素材缺口会阻塞视频版 PPT 和内容生产。',
        priority: normalizePriority(gap.priority),
      }))
    }
    return fallbackDecisions
  }, [analysis?.confirm_questions, highPriorityMissing])

  const productionReady = readiness >= 80 && highPriorityMissing.length === 0 && timeline.length > 0

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 p-6">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <ClipboardCheck size={17} />
                  </span>
                  <Badge variant="outline">V2 筹备总览</Badge>
                  {savedDraft?.saved_at ? <Badge variant="secondary">最近保存 {formatDateTime(savedDraft.saved_at)}</Badge> : null}
                  {confirmedPreview ? <Badge variant="success">已确认预演</Badge> : null}
                </div>
                <h1 className="mt-4 truncate text-2xl font-semibold text-foreground">{project?.name ?? '筹备总览'}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  汇总制作预演沉淀出的提案 PPT、视频版 PPT、分镜脚本、素材缺口和待确认决策，判断当前筹备包是否可以进入正式生产。
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="outline" className="gap-2" asChild>
                  <Link to="/production-preview">
                    <Film size={15} />
                    回到制作预演
                  </Link>
                </Button>
                <Button variant="outline" className="gap-2" asChild>
                  <Link to="/assets">
                    <Boxes size={15} />
                    素材准备
                  </Link>
                </Button>
                <Button className="gap-2" asChild>
                  <Link to={productionReady ? '/production' : '/production-preview'}>
                    {productionReady ? '进入内容生产' : '补齐筹备包'}
                    <ArrowRight size={15} />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <MetricTile label="筹备完整度" value={`${readiness}%`} hint={isLoading ? '正在读取草稿' : '来自制作预演草稿'} icon={Gauge} />
              <MetricTile label="分镜片段" value={storyboardRows.length} hint={`${readyStoryboardRows.length} 个可预演`} icon={Layers} />
              <MetricTile label="素材缺口" value={missingGaps.length} hint={`${highPriorityMissing.length} 个高优先级`} icon={AlertTriangle} />
              <MetricTile label="预演时长" value={formatDuration(totalDurationSeconds(timeline))} hint={`${timeline.length} 个时间线片段`} icon={Clock3} />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles size={17} className="text-primary" />
              <h2 className="text-base font-semibold text-foreground">筹备到生产</h2>
            </div>
            <div className="mt-5 space-y-3">
              {[
                { icon: Film, title: '制作预演', detail: '输入剧本，生成筹备草稿', active: Boolean(draft) },
                { icon: ClipboardCheck, title: '筹备总览', detail: '确认提案、预演、缺口和决策', active: true },
                { icon: PackageCheck, title: '素材准备', detail: '处理高优先素材缺口', active: highPriorityMissing.length === 0 && assetGaps.length > 0 },
                { icon: Wand2, title: '内容生产', detail: '基于确认片段生成视频候选', active: productionReady },
              ].map((item, index) => {
                const Icon = item.icon
                return (
                  <div key={item.title} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-md',
                        item.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                      )}>
                        <Icon size={15} />
                      </span>
                      {index < 3 && <span className="my-1 h-6 w-px bg-border" />}
                    </div>
                    <div className="min-w-0 pb-2">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {!draft ? (
          <section className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Film size={20} />
            </span>
            <h2 className="mt-4 text-base font-semibold text-foreground">还没有可汇总的筹备草稿</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              先进入制作预演，选择剧本版本并保存筹备草稿。这里会自动汇总提案结构、视频版 PPT、素材缺口和下一步决策。
            </p>
            <Button asChild className="mt-5 gap-2">
              <Link to="/production-preview">
                进入制作预演 <ArrowRight size={15} />
              </Link>
            </Button>
          </section>
        ) : (
          <>
            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">筹备包组成</h2>
                  <p className="mt-1 text-sm text-muted-foreground">按 V2 用户路径检查每个交付物是否足够进入下一阶段。</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {prepTracks.map((track) => <PrepTrackCard key={track.key} track={track} />)}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ListChecks size={17} className="text-muted-foreground" />
                      <h2 className="text-base font-semibold text-foreground">待确认决策</h2>
                    </div>
                    <Badge variant={productionReady ? 'success' : 'warning'}>
                      {productionReady ? '可进入生产' : '仍需确认'}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {nextDecisions.map((item) => (
                      <div key={item.title} className="rounded-md border border-border bg-background p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{item.title}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                          </div>
                          <span className={cn('shrink-0 rounded-md px-2 py-1 text-xs font-medium', priorityClassName(item.priority))}>
                            {priorityLabel(item.priority)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <Play size={17} className="text-muted-foreground" />
                    <h2 className="text-base font-semibold text-foreground">视频版 PPT 时间线</h2>
                  </div>
                  {timelineItems.length > 0 ? (
                    <div className="space-y-2">
                      {timelineItems.slice(0, 6).map((item, index) => (
                        <div key={item.clientId} className="grid grid-cols-[56px_minmax(0,1fr)_72px] items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
                          <span className="text-xs font-medium tabular-nums text-muted-foreground">#{index + 1}</span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.status}</p>
                          </div>
                          <span className="text-right text-xs tabular-nums text-muted-foreground">{formatDuration(item.durationSeconds)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">还没有生成可播放时间线。</p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <ShieldAlert size={17} className="text-muted-foreground" />
                    <h2 className="text-base font-semibold text-foreground">素材缺口</h2>
                  </div>
                  {assetGaps.length > 0 ? (
                    <div className="space-y-1">
                      {assetGaps.slice(0, 8).map((gap) => (
                        <div key={gap.client_id} className="border-b border-border py-3 last:border-b-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="min-w-0 truncate text-sm font-medium text-foreground">{gap.name}</p>
                            <span className={cn('shrink-0 rounded-md px-2 py-1 text-xs font-medium', priorityClassName(normalizePriority(gap.priority)))}>
                              {priorityLabel(normalizePriority(gap.priority))}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{gap.description}</p>
                          <p className="mt-1 text-xs text-muted-foreground">状态：{gap.status}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">保存预演后会在这里汇总素材位。</p>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <BookOpenCheck size={17} className="text-muted-foreground" />
                    <h2 className="text-base font-semibold text-foreground">创作资料包</h2>
                  </div>
                  <div className="space-y-2">
                    {[
                      { icon: Target, title: '项目表达', detail: draft.script_version?.title || '来自当前制作预演草稿', status: draft.source_text ? 'ready' : 'missing' as PrepStatus },
                      { icon: FileText, title: '故事证据', detail: `${storyboardRows.length} 个分镜片段保留正文依据`, status: storyboardRows.length > 0 ? 'draft' : 'missing' as PrepStatus },
                      { icon: Gauge, title: '关键画面', detail: `${keyframes.length} 个关键帧候选`, status: keyframes.length > 0 ? 'draft' : 'missing' as PrepStatus },
                      { icon: CheckCircle2, title: '生产门槛', detail: productionReady ? '筹备包已达到进入内容生产的原型标准' : '仍需补齐确认项或高优先素材', status: productionReady ? 'ready' : 'blocked' as PrepStatus },
                    ].map((item) => {
                      const Icon = item.icon
                      return (
                        <div key={item.title} className="flex gap-3 rounded-md border border-border bg-background p-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <Icon size={15} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                              <PrepStatusPill status={item.status as PrepStatus} />
                            </div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
