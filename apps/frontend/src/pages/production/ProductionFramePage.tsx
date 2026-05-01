import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clapperboard,
  Clock3,
  Eye,
  FileVideo,
  Film,
  Image,
  LayoutDashboard,
  ListFilter,
  Lock,
  Play,
  RefreshCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Video,
  Wand2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { getLatestScriptPreviewDraft, type GetLatestScriptPreviewDraftResponse, type ScriptPreviewStoryboardRow } from '@/api/scriptPreview'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge } from '@movscript/ui'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Progress as ProgressBar } from '@movscript/ui'

type SegmentStatus = 'ready' | 'producing' | 'review' | 'revision' | 'locked' | 'blocked'
type SegmentFilter = 'all' | SegmentStatus
type ProductionMode = 'imageToVideo' | 'textToVideo' | 'shootUpload' | 'externalImport'
type RequirementStatus = 'locked' | 'ready' | 'review' | 'blocked'

interface ProductionSegment {
  id: string
  title: string
  summary: string
  timeRange: string
  duration: number
  status: SegmentStatus
  assetReady: number
  assetTotal: number
  versions: number
  keyframe: string
  intent: string
  references: string[]
  requirements: Array<{ label: string; detail: string; status: RequirementStatus }>
  assetGaps: Array<{ title: string; detail: string; status: RequirementStatus }>
  candidates: Array<{
    id: string
    title: string
    method: string
    duration: string
    status: SegmentStatus
    note: string
  }>
}

const statusMeta: Record<SegmentStatus, { label: string; className: string; dot: string }> = {
  ready: { label: '可生产', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  producing: { label: '生产中', className: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  review: { label: '待选片', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  revision: { label: '需返工', className: 'bg-orange-500/10 text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
  locked: { label: '已锁定', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  blocked: { label: '缺素材', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
}

const requirementMeta: Record<RequirementStatus, { label: string; className: string; dot: string }> = {
  locked: { label: '已锁定', className: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  ready: { label: '已就绪', className: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
  review: { label: '待确认', className: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  blocked: { label: '阻塞', className: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
}

const filterItems: Array<{ key: SegmentFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'ready', label: '可生产' },
  { key: 'producing', label: '生产中' },
  { key: 'review', label: '待选片' },
  { key: 'revision', label: '需返工' },
  { key: 'locked', label: '已锁定' },
  { key: 'blocked', label: '缺素材' },
]

const productionModes: Array<{ key: ProductionMode; label: string; icon: LucideIcon; detail: string }> = [
  { key: 'imageToVideo', label: '图生视频', icon: Image, detail: '使用已确认关键帧、角色与场景资料生成正式片段。' },
  { key: 'textToVideo', label: '文生视频', icon: Wand2, detail: '继承分镜意图、风格规则和负面要求生成候选。' },
  { key: 'shootUpload', label: '实拍上传', icon: Upload, detail: '把外部拍摄或人工制作片段纳入同一套选片流程。' },
  { key: 'externalImport', label: '外部导入', icon: FileVideo, detail: '接收第三方工具输出，并保留来源与版本说明。' },
]

const fallbackSegments: ProductionSegment[] = [
  {
    id: 'P01',
    title: '雨夜巷口对峙',
    summary: '林夏攥着湿透旧伞，与顾言保持距离，伞骨里的纸条即将暴露。',
    timeRange: '00:00 - 00:08',
    duration: 8,
    status: 'locked',
    assetReady: 4,
    assetTotal: 4,
    versions: 3,
    keyframe: '林夏半身背光，雨滴打在旧伞边缘，顾言停在半步之外。',
    intent: '建立压迫关系，让观众先读到两人互相防备的情绪。',
    references: ['林夏雨夜状态', '顾言克制追问', '雨夜巷口', '冷雨低照度'],
    requirements: [
      { label: '关键帧', detail: '正面半身和对峙站位已确认', status: 'locked' },
      { label: '人物资料', detail: '林夏、顾言状态连续', status: 'locked' },
      { label: '场景资料', detail: '巷口纵深和雨夜光效可复用', status: 'locked' },
      { label: '风格规则', detail: '低照度但道具必须可读', status: 'ready' },
    ],
    assetGaps: [
      { title: '旧伞纸条特写', detail: '已补齐特写参考，可进入生成。', status: 'ready' },
      { title: '雨滴边缘光', detail: '作为风格参考继承。', status: 'locked' },
    ],
    candidates: [
      { id: 'A', title: '雨夜对峙主版本', method: '图生视频', duration: '8s', status: 'locked', note: '人物距离和伞的剧情证据最清楚。' },
      { id: 'B', title: '更强压迫版本', method: '文生视频', duration: '8s', status: 'review', note: '情绪更强，但旧伞不够可读。' },
      { id: 'C', title: '外部合成版本', method: '外部导入', duration: '8s', status: 'revision', note: '雨效自然，人物连续性需要修正。' },
    ],
  },
  {
    id: 'P02',
    title: '旧伞纸条暴露',
    summary: '伞骨夹层滑出被雨泡皱的纸条，林夏意识到旧伞与母亲线索有关。',
    timeRange: '00:08 - 00:14',
    duration: 6,
    status: 'blocked',
    assetReady: 2,
    assetTotal: 4,
    versions: 1,
    keyframe: '旧伞伞骨特写，湿纸条边角露出，人物手指停顿。',
    intent: '把道具从气氛物转成剧情证据，观众必须能一眼看懂纸条来源。',
    references: ['旧伞', '纸条文字', '林夏手部动作', '冷雨低照度'],
    requirements: [
      { label: '关键帧', detail: '特写构图已确认', status: 'ready' },
      { label: '道具资料', detail: '缺少清晰伞骨夹层结构图', status: 'blocked' },
      { label: '文字信息', detail: '纸条露出内容需要导演确认', status: 'review' },
      { label: '风格规则', detail: '反光不能盖住纸条文字', status: 'ready' },
    ],
    assetGaps: [
      { title: '旧伞结构特写', detail: '缺少可用于生成的伞骨夹层参考。', status: 'blocked' },
      { title: '纸条版式', detail: '需要确认露出的文字范围。', status: 'review' },
    ],
    candidates: [
      { id: 'A', title: '纸条滑出候选', method: '图生视频', duration: '6s', status: 'revision', note: '动作成立，但纸条文字不可读。' },
    ],
  },
  {
    id: 'P03',
    title: '顾言低声追问',
    summary: '顾言压低声音追问旧伞来历，林夏没有回答，只把纸条攥进掌心。',
    timeRange: '00:14 - 00:22',
    duration: 8,
    status: 'review',
    assetReady: 3,
    assetTotal: 3,
    versions: 2,
    keyframe: '顾言侧脸靠近但不越界，林夏低头把纸条藏入掌心。',
    intent: '用克制距离制造悬疑压力，不提前释放真相。',
    references: ['顾言克制追问', '林夏防御姿态', '雨夜巷口'],
    requirements: [
      { label: '关键帧', detail: '人物站位已确认', status: 'locked' },
      { label: '人物资料', detail: '两人动作连续', status: 'locked' },
      { label: '声音提示', detail: '低声追问可进入后期备注', status: 'ready' },
    ],
    assetGaps: [
      { title: '林夏手部特写', detail: '当前候选能覆盖，不构成阻塞。', status: 'ready' },
    ],
    candidates: [
      { id: 'A', title: '克制靠近版本', method: '图生视频', duration: '8s', status: 'review', note: '人物距离准确，雨夜氛围稳定。' },
      { id: 'B', title: '强冲突版本', method: '文生视频', duration: '8s', status: 'revision', note: '压迫感更强，但顾言动作过界。' },
    ],
  },
  {
    id: 'P04',
    title: '第三人入画打断',
    summary: '第三人从巷口右侧入画，打断两人的追问，让真相继续悬挂。',
    timeRange: '00:22 - 00:29',
    duration: 7,
    status: 'producing',
    assetReady: 3,
    assetTotal: 5,
    versions: 0,
    keyframe: '雨幕中第三人从右侧进入，林夏和顾言同时回头。',
    intent: '用外部介入切断解释，形成下一段点击理由。',
    references: ['第三人剪影', '巷口右侧动线', '冷雨低照度'],
    requirements: [
      { label: '关键帧', detail: '入画方向已确认', status: 'ready' },
      { label: '人物资料', detail: '第三人仍是剪影状态', status: 'review' },
      { label: '场景动线', detail: '巷口右侧入口可用', status: 'locked' },
    ],
    assetGaps: [
      { title: '第三人轮廓', detail: '需要避免提前暴露身份。', status: 'review' },
      { title: '巷口右侧入口', detail: '缺少更宽一点的环境参考。', status: 'blocked' },
    ],
    candidates: [],
  },
]

export default function ProductionFramePage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const navigate = useNavigate()
  const [filter, setFilter] = useState<SegmentFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(fallbackSegments[0].id)
  const [mode, setMode] = useState<ProductionMode>('imageToVideo')

  const { data: latestScriptPreviewDraft } = useQuery<GetLatestScriptPreviewDraftResponse>({
    queryKey: ['script-preview-latest-draft', projectId],
    queryFn: () => getLatestScriptPreviewDraft(projectId!),
    enabled: !!projectId,
    refetchInterval: 60_000,
  })

  const latestPreviewDraft = latestScriptPreviewDraft?.found ? latestScriptPreviewDraft.draft : undefined
  const latestPreviewStatus = latestPreviewDraft?.draft.preview_status ?? 'draft'
  const latestPreviewConfirmedAt = latestPreviewDraft?.draft.confirmed_at ?? ''
  const latestPreviewSavedAt = latestPreviewDraft?.saved_at ?? ''
  const latestPreviewTitle = latestPreviewDraft?.draft.script_version.title ?? '最近预演草稿'
  const isReadyForProduction = latestPreviewStatus === 'ready_for_production'
  const previewStatusLabel = isReadyForProduction ? '预演已确认' : latestScriptPreviewDraft?.found ? '预演待确认' : '未找到预演'

  const segments = useMemo(() => {
    const rows = latestPreviewDraft?.draft.storyboard_rows ?? []
    if (rows.length === 0) return fallbackSegments
    return mapDraftRowsToSegments(rows, latestPreviewDraft?.draft.preview_candidates?.asset_gaps)
  }, [latestPreviewDraft])

  const selectedSegment = segments.find((segment) => segment.id === selectedId) ?? segments[0] ?? fallbackSegments[0]
  const selectedMode = productionModes.find((item) => item.key === mode) ?? productionModes[0]
  const filteredSegments = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return segments.filter((segment) => {
      const matchesFilter = filter === 'all' || segment.status === filter
      const matchesQuery = !keyword || [segment.id, segment.title, segment.summary, ...segment.references].some((item) => item.toLowerCase().includes(keyword))
      return matchesFilter && matchesQuery
    })
  }, [filter, query, segments])

  const metrics = useMemo(() => {
    const locked = segments.filter((segment) => segment.status === 'locked').length
    const producing = segments.filter((segment) => segment.status === 'producing').length
    const review = segments.filter((segment) => segment.status === 'review').length
    const blocked = segments.filter((segment) => segment.status === 'blocked').length
    const ready = segments.filter((segment) => segment.status === 'ready').length
    const totalCandidates = segments.reduce((sum, segment) => sum + segment.candidates.length, 0)
    return {
      total: segments.length,
      locked,
      producing,
      review,
      blocked,
      ready,
      totalCandidates,
      lockedPercent: Math.round((locked / Math.max(segments.length, 1)) * 100),
    }
  }, [segments])

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="min-w-[1180px] space-y-5 p-5">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LayoutDashboard size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={13} />
              <span>v2 内容生产</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">内容生产</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              从已确认预演进入正式片段生产，按片段推进生成、导入、选片、返工和锁定。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => navigate('/script-preview')}>
              <Film size={15} />
              查看预演
            </Button>
            <Button className="gap-2" onClick={() => navigate(isReadyForProduction ? '/collaboration' : '/script-preview')}>
              <ArrowRight size={15} />
              {isReadyForProduction ? '进入制作任务' : '前往剧本预演'}
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-[minmax(0,1fr)_280px] gap-4">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <BadgeCheck size={15} className={isReadyForProduction ? 'text-emerald-600' : 'text-amber-600'} />
                  <span>生产入口状态</span>
                  <Badge variant="secondary" className={cn('text-[10px]', isReadyForProduction ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300')}>
                    {previewStatusLabel}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {metrics.blocked > 0 ? `${metrics.blocked} 个阻塞片段` : '无阻塞'}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {isReadyForProduction
                    ? '预演已经确认，当前页面可承接片段生产、候选选片和锁定状态。'
                    : '当前页面展示内容生产 UI 骨架；真实生产前仍需要先在剧本预演中确认当前草稿。'}
                </p>
                <p className="mt-2 truncate text-xs text-muted-foreground">{latestScriptPreviewDraft?.found ? latestPreviewTitle : '进入剧本预演后会显示最近保存的草稿状态。'}</p>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <p className="font-medium text-foreground">{isReadyForProduction ? '可进入正式生产' : '尚未进入生产前状态'}</p>
                <p className="mt-1">保存时间：{latestPreviewSavedAt ? formatDateTime(latestPreviewSavedAt) : '暂无'}</p>
                <p className="mt-1">确认时间：{latestPreviewConfirmedAt ? formatDateTime(latestPreviewConfirmedAt) : '暂无'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={15} className="text-muted-foreground" />
                  <p className="text-sm font-semibold">整片进度</p>
                </div>
                <p className="mt-2 text-2xl font-semibold text-foreground">{metrics.lockedPercent}%</p>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {metrics.locked}/{metrics.total} 已锁定
              </Badge>
            </div>
            <ProgressBar value={metrics.lockedPercent} className="mt-3 h-1.5" />
            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <MetricText label="生产中" value={metrics.producing} />
              <MetricText label="待选片" value={metrics.review} />
              <MetricText label="候选数" value={metrics.totalCandidates} />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-[300px_minmax(0,1fr)] gap-4">
          <aside className="space-y-4">
            <Panel title="片段清单" icon={Clapperboard}>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <Input className="h-9 pl-8 text-sm" placeholder="搜索片段、人物或场景" value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {filterItems.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setFilter(item.key)}
                      className={cn(
                        'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                        filter === item.key ? 'bg-foreground text-background' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  {filteredSegments.map((segment) => (
                    <SegmentCard
                      key={segment.id}
                      segment={segment}
                      active={segment.id === selectedSegment.id}
                      onSelect={() => setSelectedId(segment.id)}
                    />
                  ))}
                  {filteredSegments.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border bg-background p-4 text-center text-xs text-muted-foreground">
                      没有匹配的片段
                    </div>
                  ) : null}
                </div>
              </div>
            </Panel>
          </aside>

          <main className="space-y-4">
            <section className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{selectedSegment.id}</span>
                      <Badge variant="secondary" className={cn('text-[10px]', statusMeta[selectedSegment.status].className)}>
                        {statusMeta[selectedSegment.status].label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{selectedSegment.timeRange}</span>
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-foreground">{selectedSegment.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{selectedSegment.summary}</p>
                  </div>
                  <div className="shrink-0 rounded-md border border-border bg-background px-3 py-2 text-right">
                    <p className="text-lg font-semibold text-foreground">{selectedSegment.duration}s</p>
                    <p className="text-[11px] text-muted-foreground">目标时长</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-0">
                <div className="space-y-4 p-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_240px] gap-3">
                    <div className="canvas-flow min-h-[260px] rounded-lg border border-border bg-background p-4">
                      <div className="flex h-full min-h-[228px] flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Image size={14} />
                            <span>已确认预演参考</span>
                          </div>
                          <p className="mt-5 max-w-xl text-base leading-7 text-foreground">{selectedSegment.keyframe}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {['关键帧', '镜头意图', '风格规则'].map((item) => (
                            <span key={item} className="rounded-md bg-background/90 px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-border">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-background p-4">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <Eye size={14} />
                        <span>创作意图</span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-foreground">{selectedSegment.intent}</p>
                      <div className="mt-5 flex flex-wrap gap-2">
                        {selectedSegment.references.map((reference) => (
                          <div key={reference} className="flex max-w-full items-center gap-2 rounded-md bg-muted/70 px-2.5 py-1.5 text-xs">
                            <CircleDot size={12} className="text-muted-foreground" />
                            <span className="truncate">{reference}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-background">
                    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Wand2 size={15} className="text-muted-foreground" />
                        <h3 className="text-sm font-semibold">生产方式</h3>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">UI 方案</Badge>
                    </div>
                    <div className="p-3">
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {productionModes.map((item) => {
                          const Icon = item.icon
                          const active = mode === item.key
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => setMode(item.key)}
                              className={cn(
                                'flex min-w-[112px] items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                                active ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                              )}
                            >
                              <Icon size={15} />
                              <span className="text-xs font-medium">{item.label}</span>
                            </button>
                          )
                        })}
                      </div>
                      <div className="mt-3 border-t border-border pt-3">
                        <p className="text-sm font-medium text-foreground">{selectedMode.label}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{selectedMode.detail}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-background">
                    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Video size={15} className="text-muted-foreground" />
                        <h3 className="text-sm font-semibold">正式候选</h3>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ListFilter size={13} />
                        <span>{selectedSegment.candidates.length} 个版本</span>
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {selectedSegment.candidates.length > 0 ? selectedSegment.candidates.map((candidate) => (
                        <CandidateCard key={candidate.id} candidate={candidate} />
                      )) : (
                        <div className="p-6 text-center">
                          <Sparkles className="mx-auto text-muted-foreground" size={22} />
                          <p className="mt-3 text-sm font-medium text-foreground">暂无正式候选</p>
                          <p className="mt-1 text-xs text-muted-foreground">片段进入生产后，候选视频会在这里进行对比和选片。</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-l border-border bg-muted/20">
                  <ContextSection title="生产前提" icon={CheckCircle2}>
                    {selectedSegment.requirements.map((item) => (
                      <RequirementRow key={item.label} {...item} />
                    ))}
                  </ContextSection>

                  <ContextSection title="素材缺口" icon={AlertTriangle}>
                    {selectedSegment.assetGaps.map((item) => (
                      <RequirementRow key={item.title} label={item.title} detail={item.detail} status={item.status} />
                    ))}
                  </ContextSection>

                  <ContextSection title="质量检查" icon={SlidersHorizontal}>
                    {['剧情证据是否清楚', '人物状态是否连续', '时长是否匹配预演', '风格是否一致'].map((item, index) => (
                      <div key={item} className="flex items-center gap-2 py-1 text-xs">
                        <span className={cn('h-2 w-2 rounded-full', index < 2 ? 'bg-emerald-500' : 'bg-amber-500')} />
                        <span className="text-muted-foreground">{item}</span>
                      </div>
                    ))}
                  </ContextSection>

                  <div className="space-y-2 p-4">
                    <Button className="w-full justify-start gap-2" disabled={!isReadyForProduction}>
                      <Sparkles size={15} />
                      生成候选
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" className="justify-start gap-2">
                        <RefreshCcw size={15} />
                        返工
                      </Button>
                      <Button variant="outline" className="justify-start gap-2">
                        <Lock size={15} />
                        锁定
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </main>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Clock3 size={15} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold">成片时间线</h2>
            </div>
            <p className="text-xs text-muted-foreground">按正式片段状态检查整片生产进度</p>
          </div>
          <div className="flex gap-2 overflow-x-auto p-4">
            {segments.map((segment) => (
              <button
                key={segment.id}
                type="button"
                onClick={() => setSelectedId(segment.id)}
                className={cn(
                  'min-w-[180px] rounded-md border bg-background p-3 text-left transition-colors hover:bg-muted/50',
                  selectedSegment.id === segment.id ? 'border-foreground' : 'border-border',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{segment.id}</span>
                  <span className={cn('h-2.5 w-2.5 rounded-full', statusMeta[segment.status].dot)} />
                </div>
                <p className="mt-2 truncate text-sm font-medium">{segment.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{segment.timeRange}</p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Icon size={15} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

function SegmentCard({ segment, active, onSelect }: { segment: ProductionSegment; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors',
        active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:bg-muted/50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn('font-mono text-[11px]', active ? 'text-background/70' : 'text-muted-foreground')}>{segment.id}</p>
          <h3 className="mt-1 truncate text-sm font-semibold">{segment.title}</h3>
        </div>
        <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', statusMeta[segment.status].dot)} />
      </div>
      <p className={cn('mt-2 line-clamp-2 text-xs leading-5', active ? 'text-background/75' : 'text-muted-foreground')}>{segment.summary}</p>
      <div className={cn('mt-3 flex items-center justify-between text-[11px]', active ? 'text-background/70' : 'text-muted-foreground')}>
        <span>{segment.timeRange}</span>
        <span>素材 {segment.assetReady}/{segment.assetTotal}</span>
        <span>{segment.versions} 候选</span>
      </div>
    </button>
  )
}

function CandidateCard({ candidate }: { candidate: ProductionSegment['candidates'][number] }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)_132px] items-center gap-3 px-3 py-3">
      <div className="flex aspect-video items-center justify-center rounded-md bg-muted/60">
        <Play size={17} className="text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-mono text-[11px] text-muted-foreground">候选 {candidate.id}</p>
          <Badge variant="secondary" className={cn('text-[10px]', statusMeta[candidate.status].className)}>
            {statusMeta[candidate.status].label}
          </Badge>
        </div>
        <h4 className="mt-1 truncate text-sm font-semibold">{candidate.title}</h4>
        <p className="mt-1 text-xs text-muted-foreground">{candidate.method} · {candidate.duration} · {candidate.note}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="h-8 w-16 gap-1.5 px-2">
          <Eye size={13} />
          预览
        </Button>
        <Button variant="outline" size="sm" className="h-8 w-16 gap-1.5 px-2">
          <BadgeCheck size={13} />
          选片
        </Button>
      </div>
    </div>
  )
}

function RequirementRow({ label, detail, status }: { label: string; detail: string; status: RequirementStatus }) {
  const meta = requirementMeta[status]
  return (
    <div className="py-2">
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.dot)} />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{label}</p>
        <span className={cn('shrink-0 text-[11px] font-medium', meta.className)}>{meta.label}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  )
}

function ContextSection({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="border-b border-border p-4 last:border-b-0">
      <div className="mb-2 flex items-center gap-2">
        <Icon size={15} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="divide-y divide-border/70">{children}</div>
    </section>
  )
}

function MetricText({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-mono text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-muted-foreground">{label}</p>
    </div>
  )
}

function mapDraftRowsToSegments(rows: ScriptPreviewStoryboardRow[], assetGaps?: Array<{ storyboard_row_client_id: string; name: string; description: string; status: string }>): ProductionSegment[] {
  let cursor = 0
  return rows.map((row, index) => {
    const start = cursor
    const end = cursor + row.duration_seconds
    cursor = end
    const gaps = assetGaps?.filter((gap) => gap.storyboard_row_client_id === row.client_id) ?? []
    const blocked = gaps.some((gap) => gap.status === 'missing' || gap.status === 'accepted')
    const status: SegmentStatus = blocked ? 'blocked' : index === 0 ? 'review' : index === 1 ? 'producing' : 'ready'
    return {
      id: `P${String(index + 1).padStart(2, '0')}`,
      title: row.title || `片段 ${index + 1}`,
      summary: row.body || '从剧本预演继承的正式生产片段。',
      timeRange: `${formatTime(start)} - ${formatTime(end)}`,
      duration: row.duration_seconds,
      status,
      assetReady: blocked ? 2 : 3,
      assetTotal: blocked ? 4 : 3,
      versions: status === 'ready' ? 0 : 1,
      keyframe: row.body || '沿用已确认关键帧作为正式生产参考。',
      intent: '继承预演中的分镜意图、人物状态和视觉约束，进入正式候选生产。',
      references: ['已确认关键帧', '人物资料', '场景资料', '风格规则'],
      requirements: [
        { label: '关键帧', detail: '来自剧本预演确认结果', status: 'ready' },
        { label: '创作资料', detail: '人物、场景和风格资料随片段继承', status: 'ready' },
        { label: '素材缺口', detail: blocked ? '仍有未解决素材缺口' : '未发现阻塞项', status: blocked ? 'blocked' : 'ready' },
      ],
      assetGaps: gaps.length > 0
        ? gaps.map((gap) => ({ title: gap.name, detail: gap.description, status: mapRequirementStatus(gap.status) }))
        : [{ title: '素材检查', detail: '当前片段没有阻塞素材缺口。', status: 'ready' }],
      candidates: status === 'ready'
        ? []
        : [{ id: 'A', title: `${row.title || `片段 ${index + 1}`}候选`, method: '图生视频', duration: `${row.duration_seconds}s`, status: status === 'blocked' ? 'revision' : 'review', note: '用于 UI 预览的正式候选占位。' }],
    }
  })
}

function mapRequirementStatus(status: string): RequirementStatus {
  if (status === 'resolved') return 'ready'
  if (status === 'rejected') return 'review'
  if (status === 'missing' || status === 'accepted') return 'blocked'
  return 'review'
}

function formatTime(seconds: number) {
  const minute = Math.floor(seconds / 60)
  const second = seconds % 60
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
