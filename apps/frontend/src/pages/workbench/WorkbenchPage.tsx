import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  FileText,
  Film,
  Image,
  ListChecks,
  PackageCheck,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  Timer,
  Upload,
  Users,
  Video,
  Wand2,
} from 'lucide-react'

import ReferenceRelationsPage from '@/pages/reference-relations/ReferenceRelationsPage'
import { AssetGenerationWorkspace } from '@/pages/assets/AssetsPage'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge, Button, Card, Progress } from '@movscript/ui'
import {
  acceptAssetGap,
  acceptKeyframeCandidate,
  confirmProjectPreview,
  generateProjectPreview,
  getLatestProjectPreviewDraft,
  resolveAssetGap,
  type GetLatestProjectPreviewDraftResponse,
  type ProjectPreviewAnalysisCandidates,
  type ProjectPreviewCandidateData,
  type ProjectPreviewTimelineInput,
} from '@/api/projectPreview'
import {
  getWorkbenchSurface,
  workbenchSurfaces,
  type WorkbenchCategory,
} from '@/pages/project-workspace/structure'

export type WorkbenchMode = 'free'
type WorkStatus = 'blocked' | 'review' | 'ready' | 'running'
type Priority = 'high' | 'medium' | 'low'
type ProjectPreviewStepKey = 'inventory' | 'ai_fill' | 'asset_check' | 'performance' | 'playback' | 'confirm'
type ProjectPreviewItemStatus = 'ready' | 'review' | 'blocked'
type ProjectPreviewTimelineItem = NonNullable<ProjectPreviewCandidateData['preview_timeline']>[number]
type ProjectPreviewKeyframe = NonNullable<ProjectPreviewCandidateData['keyframe_candidates']>[number]
type ProjectPreviewAssetGap = NonNullable<ProjectPreviewCandidateData['asset_gaps']>[number]
type ProjectPreviewSegment = NonNullable<ProjectPreviewAnalysisCandidates['segments']>[number]
type ProjectPreviewTimelineLike = ProjectPreviewTimelineItem | (ProjectPreviewTimelineInput & {
  storyboard_row_client_id?: string
  keyframe_candidate_client_id?: string
  label?: string
  status?: string
  confirmation_status?: string
})

interface WorkbenchContentProps {
  mode: WorkbenchMode
  initialCategory?: WorkbenchCategory
  showCategoryTabs?: boolean
  nodeId?: string | number
  embedded?: boolean
  onBack?: () => void
}

interface QueueItem {
  id: string
  title: string
  subtitle: string
  status: WorkStatus
  priority: Priority
  progress: number
}

interface DecisionRow {
  label: string
  value: string
  tone?: 'default' | 'warning' | 'success'
}

interface CategoryScenario {
  queue: QueueItem[]
  evidenceTitle: string
  evidence: string[]
  decisionTitle: string
  decisions: DecisionRow[]
  outputTitle: string
  outputs: DecisionRow[]
  actions: string[]
}

const scenarios: Record<WorkbenchCategory, CategoryScenario> = {
  script: {
    queue: [
      { id: 's3', title: '旧伞纸条滑落', subtitle: '片段 3 · 建议拆成两个情节', status: 'review', priority: 'high', progress: 62 },
      { id: 's2', title: '巷口对峙', subtitle: '片段 2 · 人物动机待确认', status: 'review', priority: 'medium', progress: 74 },
      { id: 's4', title: '顾言停步', subtitle: '片段 4 · 低置信表达', status: 'blocked', priority: 'medium', progress: 35 },
    ],
    evidenceTitle: '剧本证据',
    evidence: [
      '林夏撑着旧伞走进雨夜巷口，雨水沿着伞骨滴落。',
      '纸条从伞骨夹缝里滑出，被雨水打湿。',
      '顾言看见纸条，神色变化。林夏低声说：你还是来了。',
    ],
    decisionTitle: '理解判断',
    decisions: [
      { label: '情节', value: '旧伞纸条滑落' },
      { label: '人物', value: '林夏、顾言' },
      { label: '道具', value: '破损旧伞、纸条' },
      { label: '风险', value: '顾言动机缺上下文', tone: 'warning' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '结构', value: '新增 2 个情节候选' },
      { label: '下游', value: '生成资料候选和素材缺口' },
      { label: '状态', value: '可进入预演决策', tone: 'success' },
    ],
    actions: ['确认为情节', '拆成两个情节', '忽略候选', '生成资料候选'],
  },
  preview: {
    queue: [
      { id: 'p2', title: '林夏雨中半身', subtitle: '片段 02 · 关键帧待选', status: 'running', priority: 'high', progress: 72 },
      { id: 'p3', title: '纸条特写', subtitle: '片段 03 · 缺旧伞素材', status: 'blocked', priority: 'high', progress: 38 },
      { id: 'p5', title: '巷口背影', subtitle: '片段 05 · 时间线偏短', status: 'ready', priority: 'low', progress: 84 },
    ],
    evidenceTitle: '分镜脚本',
    evidence: [
      '01 雨夜全景 · 广角固定 · 4s',
      '02 林夏半身 · 中近景缓推 · 5s',
      '03 纸条特写 · 特写慢推 · 3s',
      '04 顾言停步 · 中景静止 · 4s',
    ],
    decisionTitle: '预演判断',
    decisions: [
      { label: '时长', value: '23s，目标 30s 仍偏短', tone: 'warning' },
      { label: '缺口', value: '片段 03 缺旧伞素材', tone: 'warning' },
      { label: '关键帧', value: '片段 02 候选 4 张' },
      { label: '建议', value: '先补素材，再确认制作预演' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '时间线', value: '第 1 版预演时间线' },
      { label: '任务', value: '2 个素材缺口，1 个关键帧选择' },
      { label: '状态', value: '部分片段可生产', tone: 'success' },
    ],
    actions: ['采用当前分镜', '生成关键帧', '补素材缺口', '确认制作预演'],
  },
  creative: {
    queue: [
      { id: 'c1', title: '林夏', subtitle: '人物 · 表演克制程度待定', status: 'review', priority: 'high', progress: 58 },
      { id: 'c2', title: '破损旧伞', subtitle: '道具 · 影响纸条特写', status: 'blocked', priority: 'high', progress: 28 },
      { id: 'c3', title: '冷雨悬疑风格', subtitle: '风格 · 已可用于提示词', status: 'ready', priority: 'medium', progress: 92 },
    ],
    evidenceTitle: '资料证据',
    evidence: [
      '林夏需要保持克制，不是惊慌逃离。',
      '旧伞必须破损，伞骨内侧可以藏纸条。',
      '老城区窄巷需要低照度、潮湿墙面和坏路灯。',
    ],
    decisionTitle: '资料判断',
    decisions: [
      { label: '人物', value: '林夏状态需锁定', tone: 'warning' },
      { label: '道具', value: '旧伞是剧情证据，不是装饰' },
      { label: '风格', value: '低饱和、强反差、克制表演' },
      { label: '影响', value: '分镜、素材位、关键帧一致性' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '资料卡', value: '人物、地点、道具、风格' },
      { label: '约束', value: '进入提示词和审核标准' },
      { label: '状态', value: '可进入素材准备', tone: 'success' },
    ],
    actions: ['确认资料', '标记缺口', '补充说明', '关联使用位置'],
  },
  assets: {
    queue: [
      { id: 'a1', title: '破损旧伞特写', subtitle: '素材位 · 道具参考', status: 'blocked', priority: 'high', progress: 24 },
      { id: 'a2', title: '林夏雨夜半身', subtitle: '人物状态 · 候选 4 张', status: 'running', priority: 'medium', progress: 72 },
      { id: 'a3', title: '老城区窄巷', subtitle: '地点 · 可用于全景', status: 'ready', priority: 'medium', progress: 88 },
    ],
    evidenceTitle: '素材标准',
    evidence: ['必须可用于关键帧', '必须和人物状态一致', '必须能解释纸条藏在伞骨里'],
    decisionTitle: '采用判断',
    decisions: [
      { label: '缺口', value: '旧伞没有可用正面和特写参考', tone: 'warning' },
      { label: '候选', value: 'AI 候选 2 张，上传参考 1 张' },
      { label: '质量', value: '人物一致性 78%，道具准确 64%', tone: 'warning' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '素材', value: '锁定素材版本' },
      { label: '资源', value: '写入资源库引用' },
      { label: '状态', value: '可生成关键帧', tone: 'success' },
    ],
    actions: ['上传参考', '生成候选', '采用素材', '请求返工'],
  },
  production: {
    queue: [
      { id: 'variant-b', title: '片段 02 人物停步', subtitle: '版本 B 待审', status: 'review', priority: 'high', progress: 61 },
      { id: 'v3', title: '纸条特写', subtitle: '缺正式视频', status: 'blocked', priority: 'high', progress: 34 },
      { id: 'v1', title: '雨夜全景', subtitle: '可采用', status: 'ready', priority: 'medium', progress: 86 },
    ],
    evidenceTitle: '候选版本',
    evidence: ['版本 A：节奏偏快，雨量过强。', '版本 B：人物停步清楚，灯光需微调。', '版本 C：构图稳定，但表情不够准确。'],
    decisionTitle: '生产判断',
    decisions: [
      { label: '推荐', value: '版本 B 可先采用' },
      { label: '返工', value: '灯光和雨量需要微调', tone: 'warning' },
      { label: '一致性', value: '人物 78%，道具 64%', tone: 'warning' },
      { label: '下游', value: '采用后进入交付检查' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '片段', value: '正式片段 02' },
      { label: '记录', value: '采用版本和返工意见' },
      { label: '状态', value: '可进入交付门禁', tone: 'success' },
    ],
    actions: ['采用版本', '请求返工', '生成新版本', '创建人工任务'],
  },
  delivery: {
    queue: [
      { id: 'd3', title: '画面完整性', subtitle: '片段 03 缺正式视频', status: 'blocked', priority: 'high', progress: 52 },
      { id: 'd2', title: '声音混音', subtitle: '雨声已生成，台词未混音', status: 'review', priority: 'medium', progress: 66 },
      { id: 'd4', title: '版权记录', subtitle: '字体授权待记录', status: 'blocked', priority: 'medium', progress: 40 },
    ],
    evidenceTitle: '交付检查',
    evidence: ['片段 03 缺正式视频。', '第 2 段字幕未确认。', '台词未混音。', '字体授权待记录。'],
    decisionTitle: '放行判断',
    decisions: [
      { label: '完整性', value: '84%' },
      { label: '声音', value: '52%', tone: 'warning' },
      { label: '字幕', value: '66%', tone: 'warning' },
      { label: '版权', value: '40%', tone: 'warning' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '版本', value: '检查版、内部评审版、交付版' },
      { label: '结果', value: '导出前通过/阻塞记录' },
      { label: '状态', value: '满足条件后可导出', tone: 'success' },
    ],
    actions: ['导出检查版', '标记阻塞', '补齐字幕', '记录版权'],
  },
  'reference-relations': {
    queue: [
      { id: 'r1', title: '林夏 ↔ 顾言', subtitle: '人物关系 · 共同秘密', status: 'review', priority: 'high', progress: 70 },
      { id: 'r2', title: '旧伞 → 纸条', subtitle: '道具关系 · 剧情证据', status: 'ready', priority: 'high', progress: 88 },
      { id: 'r3', title: '窄巷 → 对峙', subtitle: '地点关系 · 情绪压迫', status: 'review', priority: 'medium', progress: 64 },
    ],
    evidenceTitle: '关系证据',
    evidence: ['旧伞和纸条共同解释秘密暴露。', '林夏和顾言的距离影响镜头调度。', '坏路灯和雨夜共同制造低照度风格。'],
    decisionTitle: '关系判断',
    decisions: [
      { label: '人物', value: '共同秘密，不是普通重逢' },
      { label: '道具', value: '纸条推动情绪变化' },
      { label: '地点', value: '窄巷限制运动和构图' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '关系图', value: '可被分镜和提示词引用' },
      { label: '证据', value: '每条关系保留来源' },
      { label: '状态', value: '下游解释一致', tone: 'success' },
    ],
    actions: ['确认关系', '改关系类型', '补证据', '删除弱关系'],
  },
}

function statusLabel(status: WorkStatus) {
  if (status === 'blocked') return '阻塞'
  if (status === 'ready') return '可推进'
  if (status === 'running') return '运行中'
  return '待确认'
}

function statusVariant(status: WorkStatus) {
  if (status === 'blocked') return 'warning' as const
  if (status === 'ready') return 'success' as const
  if (status === 'running') return 'secondary' as const
  return 'outline' as const
}

function priorityLabel(priority: Priority) {
  if (priority === 'high') return '高'
  if (priority === 'medium') return '中'
  return '低'
}

function decisionVariant(tone?: DecisionRow['tone']) {
  if (tone === 'success') return 'success' as const
  if (tone === 'warning') return 'warning' as const
  return 'outline' as const
}

function QueueList({
  items,
  selectedId,
  onSelect,
}: {
  items: QueueItem[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <Card className="rounded-lg border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">待处理队列</h2>
        <Badge variant="secondary">{items.length}</Badge>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              'w-full rounded-md border px-3 py-3 text-left transition-colors',
              selectedId === item.id ? 'border-primary/60 bg-primary/5' : 'border-border bg-background hover:bg-muted/30',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-foreground">{item.title}</span>
              <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{item.subtitle}</p>
            <div className="mt-3 flex items-center gap-2">
              <Badge variant={item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'outline'} className="shrink-0">
                {priorityLabel(item.priority)}
              </Badge>
              <Progress value={item.progress} className="h-1.5" />
            </div>
          </button>
        ))}
      </div>
    </Card>
  )
}

function InfoPanel({ title, rows, icon: Icon }: { title: string; rows: string[]; icon: typeof FileText }) {
  return (
    <Card className="rounded-lg border-border bg-card p-4">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon size={17} />
        </span>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row} className="rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground">
            {row}
          </div>
        ))}
      </div>
    </Card>
  )
}

function DecisionPanel({ title, rows }: { title: string; rows: DecisionRow[] }) {
  return (
    <Card className="rounded-lg border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={`${row.label}:${row.value}`} className="rounded-md border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{row.label}</p>
              <Badge variant={decisionVariant(row.tone)}>{row.tone === 'warning' ? '需处理' : row.tone === 'success' ? '可用' : '信息'}</Badge>
            </div>
            <p className="mt-2 text-sm font-medium leading-6 text-foreground">{row.value}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ActionRail({ actions, outputTitle, outputs }: { actions: string[]; outputTitle: string; outputs: DecisionRow[] }) {
  return (
    <aside className="w-80 shrink-0 overflow-auto border-l border-border bg-muted/20 p-4">
      <section className="mb-5">
        <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">可执行动作</h3>
        <div className="space-y-2">
          {actions.map((action, index) => (
            <button
              key={action}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                index === 0 ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border bg-background text-foreground hover:bg-muted/40',
              )}
            >
              {index === 0 ? <CheckCircle2 size={14} className="shrink-0 text-primary" /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" />}
              <span>{action}</span>
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{outputTitle}</h3>
        <div className="space-y-2">
          {outputs.map((row) => (
            <div key={`${row.label}:${row.value}`} className="rounded-md border border-border bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <Badge variant={decisionVariant(row.tone)}>{row.tone === 'success' ? '输出' : '记录'}</Badge>
              </div>
              <p className="mt-1 text-sm leading-5 text-foreground">{row.value}</p>
            </div>
          ))}
        </div>
      </section>
    </aside>
  )
}

function ProjectPreviewWorkspace() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const [activeStep, setActiveStep] = useState<ProjectPreviewStepKey>('inventory')
  const [selectedTimelineId, setSelectedTimelineId] = useState('')
  const [message, setMessage] = useState('读取制作编排后，可以检查项目预演所需资料、素材、情节、片段和内容单元。')

  const { data, isLoading, isError, refetch } = useQuery<GetLatestProjectPreviewDraftResponse>({
    queryKey: ['project-preview-workbench', projectId],
    queryFn: () => getLatestProjectPreviewDraft(projectId!),
    enabled: !!projectId,
  })

  const draftResponse = data?.found ? data.draft : null
  const draft = draftResponse?.draft
  const analysis = draft?.analysis_candidates ?? null
  const preview = draft?.preview_candidates ?? null
  const segments = analysis?.segments ?? []
  const timeline = useMemo(
    () => normalizeProjectPreviewTimeline(preview?.preview_timeline ?? draft?.preview_timeline ?? []),
    [draft?.preview_timeline, preview?.preview_timeline],
  )
  const keyframes = preview?.keyframe_candidates ?? []
  const assetGaps = preview?.asset_gaps ?? []
  const storyboardRows = draft?.storyboard_rows ?? []
  const selectedTimeline = timeline.find((item) => item.client_id === selectedTimelineId) ?? timeline[0] ?? null

  useEffect(() => {
    if (!selectedTimelineId && timeline[0]) setSelectedTimelineId(timeline[0].client_id)
    if (selectedTimelineId && !timeline.some((item) => item.client_id === selectedTimelineId)) setSelectedTimelineId(timeline[0]?.client_id ?? '')
  }, [selectedTimelineId, timeline])

  const stats = useMemo(() => {
    const acceptedKeyframes = keyframes.filter((item) => item.decision_status === 'accepted').length
    const resolvedGaps = assetGaps.filter((item) => item.status === 'resolved' || item.status === 'accepted').length
    const blockingGaps = assetGaps.filter((item) => item.status !== 'resolved' && item.status !== 'rejected').length
    const confirmed = draft?.preview_status === 'ready_for_production' || Boolean(draft?.confirmed_at)
    const readinessItems = [
      segments.length > 0,
      storyboardRows.length > 0,
      timeline.length > 0,
      keyframes.length === 0 || acceptedKeyframes > 0,
      blockingGaps === 0,
      confirmed,
    ]
    return {
      acceptedKeyframes,
      resolvedGaps,
      blockingGaps,
      confirmed,
      readiness: Math.round((readinessItems.filter(Boolean).length / readinessItems.length) * 100),
    }
  }, [assetGaps, draft?.confirmed_at, draft?.preview_status, keyframes, segments.length, storyboardRows.length, timeline.length])

  const generatePreviewMutation = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error('请先选择项目')
      if (!draftResponse?.draft_id) throw new Error('请先在内容区保存制作编排')
      if (storyboardRows.length === 0) throw new Error('请先在内容区采纳内容单元候选')
      return generateProjectPreview(projectId, { draft_id: draftResponse.draft_id, storyboard_rows: storyboardRows })
    },
    onMutate: () => setMessage('AI 正在补充预演时间线、关键帧和素材缺口'),
    onSuccess: () => {
      setMessage('AI 补充已完成，请检查关键帧和素材缺口')
      refetch()
      setActiveStep('asset_check')
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : '生成项目预演失败'),
  })

  const acceptKeyframeMutation = useMutation({
    mutationFn: (id: string) => {
      if (!projectId || !draftResponse?.draft_id) throw new Error('请先保存制作编排')
      return acceptKeyframeCandidate(projectId, { draft_id: draftResponse.draft_id, keyframe_candidate_client_id: id })
    },
    onSuccess: () => {
      setMessage('关键帧已确认')
      refetch()
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : '确认关键帧失败'),
  })

  const resolveGapMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'resolve' }) => {
      if (!projectId || !draftResponse?.draft_id) throw new Error('请先保存制作编排')
      return action === 'accept'
        ? acceptAssetGap(projectId, { draft_id: draftResponse.draft_id, asset_gap_client_id: id })
        : resolveAssetGap(projectId, { draft_id: draftResponse.draft_id, asset_gap_client_id: id })
    },
    onSuccess: () => {
      setMessage('素材缺口状态已更新')
      refetch()
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : '更新素材缺口失败'),
  })

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (!projectId || !draftResponse?.draft_id) throw new Error('请先保存制作编排')
      return confirmProjectPreview(projectId, { draft_id: draftResponse.draft_id })
    },
    onMutate: () => setMessage('正在确认当前项目预演'),
    onSuccess: () => {
      setMessage('项目预演已确认，可以继续后续内容制作')
      refetch()
      setActiveStep('confirm')
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : '确认项目预演失败'),
  })

  const steps = buildProjectPreviewSteps({
    segments,
    storyboardRows: storyboardRows.length,
    timeline,
    keyframes,
    assetGaps,
    confirmed: stats.confirmed,
  })

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Film size={14} />
            <span>{project?.name ?? '当前项目'}</span>
            <ArrowRight size={13} />
            <span>工作台</span>
            <ArrowRight size={13} />
            <span>项目预演</span>
            <Badge variant="outline">预演与确认</Badge>
          </div>
          <h1 className="mt-2 text-xl font-semibold text-foreground">项目预演</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            基于内容区的制作编排，检查 AI 补充、资料与素材状态、情节和片段覆盖、内容单元表现，并播放预演后确认。
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} loading={isLoading}>
            <RefreshCw size={14} />
            刷新
          </Button>
          <Button size="sm" loading={confirmMutation.isPending} disabled={!draftResponse || stats.blockingGaps > 0 || timeline.length === 0} onClick={() => confirmMutation.mutate()}>
            <CheckCircle2 size={14} />
            确认预演
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_360px] gap-4 overflow-hidden p-4">
        <aside className="min-h-0 space-y-4 overflow-y-auto">
          <Card className="rounded-lg border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">预演完整度</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{stats.readiness}%</p>
              </div>
              <Badge variant={stats.confirmed ? 'success' : stats.blockingGaps > 0 ? 'warning' : 'secondary'}>{stats.confirmed ? '已确认' : stats.blockingGaps > 0 ? '需处理' : '待确认'}</Badge>
            </div>
            <Progress value={stats.readiness} className="mt-4 h-2" />
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{message}</p>
          </Card>

          <Card className="rounded-lg border-border bg-card p-3">
            <h2 className="px-1 pb-2 text-sm font-semibold text-foreground">交互过程</h2>
            <div className="space-y-2">
              {steps.map((step) => (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setActiveStep(step.key)}
                  className={cn(
                    'w-full rounded-md border px-3 py-3 text-left transition-colors',
                    activeStep === step.key ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted/40',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{step.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                    </div>
                    <PreviewItemBadge status={step.status} />
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </aside>

        <main className="min-h-0 overflow-y-auto">
          {isError ? (
            <EmptyWorkbenchState title="无法读取项目预演" text="请确认后端服务可用，并刷新页面。" />
          ) : !draftResponse && !isLoading ? (
            <EmptyWorkbenchState title="暂无制作编排草稿" text="先到内容区制作编排保存剧本来源、片段、情节和内容单元。" />
          ) : (
            <div className="space-y-4">
              <ProjectPreviewStage
                activeStep={activeStep}
                segments={segments}
                timeline={timeline}
                keyframes={keyframes}
                assetGaps={assetGaps}
                selectedTimeline={selectedTimeline}
                storyboardRows={storyboardRows.length}
                generateBusy={generatePreviewMutation.isPending}
                onGenerate={() => generatePreviewMutation.mutate()}
                onAcceptKeyframe={(id) => acceptKeyframeMutation.mutate(id)}
                onResolveGap={(id, action) => resolveGapMutation.mutate({ id, action })}
              />
            </div>
          )}
        </main>

        <aside className="min-h-0 space-y-4 overflow-y-auto">
          <Card className="rounded-lg border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">预演资料状态</h2>
            <div className="mt-4 grid gap-3">
              <PreviewMetric icon={FileText} label="片段" value={segments.length} status={segments.length > 0 ? 'ready' : 'blocked'} />
              <PreviewMetric icon={Target} label="情节" value={segments.length} status={segments.length > 0 ? 'ready' : 'review'} />
              <PreviewMetric icon={Database} label="资料" value={Math.max(1, segments.length)} status={segments.length > 0 ? 'review' : 'blocked'} />
              <PreviewMetric icon={PackageCheck} label="素材缺口" value={assetGaps.length} status={stats.blockingGaps > 0 ? 'blocked' : 'ready'} />
              <PreviewMetric icon={Video} label="内容单元" value={storyboardRows.length} status={storyboardRows.length > 0 ? 'ready' : 'blocked'} />
            </div>
          </Card>

          <Card className="rounded-lg border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">播放预演</h2>
              <Badge variant={timeline.length > 0 ? 'success' : 'secondary'}>{timeline.length} 段</Badge>
            </div>
            <div className="mt-4 aspect-video rounded-md border border-border bg-background p-3">
              {selectedTimeline ? (
                <div className="flex h-full flex-col justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{selectedTimeline.start_seconds}s - {selectedTimeline.end_seconds}s</p>
                    <p className="mt-2 text-base font-semibold text-foreground">{selectedTimeline.label}</p>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{selectedTimeline.status}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="gap-2" disabled>
                      <Play size={14} />
                      播放
                    </Button>
                    <Progress value={Math.min(100, Math.round(((selectedTimeline.end_seconds || 1) / Math.max(1, timeline[timeline.length - 1]?.end_seconds || 1)) * 100))} className="h-1.5" />
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">生成预演时间线后可播放</div>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {timeline.slice(0, 5).map((item) => (
                <button
                  key={item.client_id}
                  type="button"
                  onClick={() => setSelectedTimelineId(item.client_id)}
                  className={cn('w-full rounded-md border px-3 py-2 text-left text-sm', selectedTimeline?.client_id === item.client_id ? 'border-primary bg-primary/5' : 'border-border bg-background')}
                >
                  <span className="block truncate text-foreground">{item.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.start_seconds}s - {item.end_seconds}s</span>
                </button>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function ProjectPreviewStage({
  activeStep,
  segments,
  timeline,
  keyframes,
  assetGaps,
  selectedTimeline,
  storyboardRows,
  generateBusy,
  onGenerate,
  onAcceptKeyframe,
  onResolveGap,
}: {
  activeStep: ProjectPreviewStepKey
  segments: ProjectPreviewSegment[]
  timeline: ProjectPreviewTimelineItem[]
  keyframes: ProjectPreviewKeyframe[]
  assetGaps: ProjectPreviewAssetGap[]
  selectedTimeline: ProjectPreviewTimelineItem | null
  storyboardRows: number
  generateBusy: boolean
  onGenerate: () => void
  onAcceptKeyframe: (id: string) => void
  onResolveGap: (id: string, action: 'accept' | 'resolve') => void
}) {
  if (activeStep === 'inventory') {
    return (
      <>
        <StageHeader icon={ListChecks} title="预演清单" text="确认内容区制作编排是否已经提供预演所需的片段、情节、内容单元和来源证据。" />
        <div className="grid gap-4 lg:grid-cols-2">
          {segments.length === 0 ? (
            <EmptyWorkbenchState title="暂无片段" text="需要先在内容区解析理解并确认片段。" />
          ) : segments.map((segment) => (
            <Card key={segment.client_id} className="rounded-lg border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge variant="outline">片段 {segment.order}</Badge>
                  <h3 className="mt-2 text-sm font-semibold text-foreground">{segment.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{segment.summary}</p>
                </div>
                <Badge variant={segment.confidence >= 0.8 ? 'success' : 'warning'}>{Math.round(segment.confidence * 100)}%</Badge>
              </div>
            </Card>
          ))}
        </div>
      </>
    )
  }

  if (activeStep === 'ai_fill') {
    return (
      <>
        <StageHeader icon={Sparkles} title="AI 补充制作" text="基于已采纳的内容单元生成预演时间线、关键帧候选和素材缺口；生成结果仍需人工确认。" />
        <Card className="rounded-lg border-border bg-card p-4">
          <div className="grid gap-4 md:grid-cols-4">
            <PreviewMetric icon={Video} label="内容单元" value={storyboardRows} status={storyboardRows > 0 ? 'ready' : 'blocked'} />
            <PreviewMetric icon={Timer} label="时间线" value={timeline.length} status={timeline.length > 0 ? 'ready' : 'review'} />
            <PreviewMetric icon={Image} label="关键帧" value={keyframes.length} status={keyframes.length > 0 ? 'review' : 'blocked'} />
            <PreviewMetric icon={PackageCheck} label="素材缺口" value={assetGaps.length} status={assetGaps.length > 0 ? 'blocked' : 'ready'} />
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-md border border-border bg-background px-4 py-3">
            <p className="text-sm leading-6 text-muted-foreground">AI 会补齐预演所需结构，但不会直接覆盖内容区已确认的制作事实。</p>
            <Button loading={generateBusy} disabled={storyboardRows === 0} onClick={onGenerate}>
              <Wand2 size={14} />
              生成/刷新预演
            </Button>
          </div>
        </Card>
      </>
    )
  }

  if (activeStep === 'asset_check') {
    return (
      <>
        <StageHeader icon={PackageCheck} title="资料与素材状态" text="检查每个预演片段是否还有素材缺口，以及缺口是立即解决、保留到素材准备，还是阻塞确认。" />
        <div className="space-y-3">
          {assetGaps.length === 0 ? (
            <EmptyWorkbenchState title="没有素材缺口" text="当前预演没有阻塞素材项。" />
          ) : assetGaps.map((gap) => (
            <Card key={gap.client_id} className="rounded-lg border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{gap.name}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{gap.description}</p>
                </div>
                <AssetGapPreviewBadge status={gap.status} />
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" variant="outline" disabled={gap.status === 'resolved'} onClick={() => onResolveGap(gap.client_id, 'accept')}>保留到素材准备</Button>
                <Button size="sm" disabled={gap.status === 'resolved'} onClick={() => onResolveGap(gap.client_id, 'resolve')}>标记已解决</Button>
              </div>
            </Card>
          ))}
        </div>
      </>
    )
  }

  if (activeStep === 'performance') {
    return (
      <>
        <StageHeader icon={Image} title="内容单元表现" text="确认每个内容单元的视觉锚点、关键帧和节奏是否能支撑预演播放。" />
        <div className="grid gap-4 lg:grid-cols-2">
          {keyframes.length === 0 ? (
            <EmptyWorkbenchState title="暂无关键帧候选" text="生成项目预演后，这里会出现关键帧候选。" />
          ) : keyframes.map((keyframe) => (
            <Card key={keyframe.client_id} className="rounded-lg border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{keyframe.visual_anchor}</h3>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{keyframe.prompt}</p>
                </div>
                <PreviewDecisionBadge status={keyframe.decision_status ?? 'pending'} />
              </div>
              <Button size="sm" className="mt-4 w-full justify-center" disabled={keyframe.decision_status === 'accepted'} onClick={() => onAcceptKeyframe(keyframe.client_id)}>
                确认关键帧
              </Button>
            </Card>
          ))}
        </div>
      </>
    )
  }

  if (activeStep === 'playback') {
    return (
      <>
        <StageHeader icon={Play} title="播放预演" text="按照预演时间线检查顺序、时长、节奏和可播放状态。" />
        <Card className="rounded-lg border-border bg-card p-4">
          {selectedTimeline ? (
            <div>
              <div className="rounded-md border border-border bg-background p-5">
                <p className="text-xs text-muted-foreground">{selectedTimeline.start_seconds}s - {selectedTimeline.end_seconds}s</p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">{selectedTimeline.label}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedTimeline.status}</p>
              </div>
              <div className="mt-4 space-y-2">
                {timeline.map((item) => (
                  <div key={item.client_id} className="grid grid-cols-[88px_minmax(0,1fr)_84px] items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{item.start_seconds}s - {item.end_seconds}s</span>
                    <span className="truncate text-sm text-foreground">{item.label}</span>
                    <PreviewDecisionBadge status={item.confirmation_status ?? 'pending'} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyWorkbenchState title="暂无预演时间线" text="先生成项目预演时间线。" />
          )}
        </Card>
      </>
    )
  }

  return (
    <>
      <StageHeader icon={CheckCircle2} title="确认项目预演" text="确认前需要没有阻塞素材，且时间线和关键帧已经足够支撑后续生产。" />
      <Card className="rounded-lg border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <GateRow label="片段已覆盖" done={segments.length > 0} />
          <GateRow label="内容单元已形成" done={storyboardRows > 0} />
          <GateRow label="时间线可播放" done={timeline.length > 0} />
          <GateRow label="关键帧已确认" done={keyframes.length === 0 || keyframes.some((item) => item.decision_status === 'accepted')} />
          <GateRow label="素材缺口可控" done={assetGaps.every((item) => item.status === 'resolved' || item.status === 'rejected' || item.status === 'accepted')} />
        </div>
      </Card>
    </>
  )
}

function normalizeProjectPreviewTimeline(items: ProjectPreviewTimelineLike[]): ProjectPreviewTimelineItem[] {
  return items.map((item, index) => ({
    client_id: item.client_id,
    storyboard_row_client_id: item.storyboard_row_client_id ?? '',
    keyframe_candidate_client_id: item.keyframe_candidate_client_id,
    order: item.order,
    start_seconds: item.start_seconds,
    duration_seconds: item.duration_seconds,
    end_seconds: item.end_seconds,
    label: item.label ?? `预演片段 ${index + 1}`,
    status: item.status ?? '待确认',
    confirmation_status: item.confirmation_status ?? 'pending',
  }))
}

function buildProjectPreviewSteps({
  segments,
  storyboardRows,
  timeline,
  keyframes,
  assetGaps,
  confirmed,
}: {
  segments: ProjectPreviewSegment[]
  storyboardRows: number
  timeline: ProjectPreviewTimelineItem[]
  keyframes: ProjectPreviewKeyframe[]
  assetGaps: ProjectPreviewAssetGap[]
  confirmed: boolean
}) {
  const blockingGaps = assetGaps.filter((item) => item.status !== 'resolved' && item.status !== 'rejected').length
  const acceptedKeyframes = keyframes.filter((item) => item.decision_status === 'accepted').length
  return [
    {
      key: 'inventory' as const,
      title: '确认预演清单',
      detail: `${segments.length} 个片段，${storyboardRows} 个内容单元`,
      status: segments.length > 0 && storyboardRows > 0 ? 'ready' as const : 'blocked' as const,
    },
    {
      key: 'ai_fill' as const,
      title: 'AI 补充制作',
      detail: timeline.length > 0 ? `已生成 ${timeline.length} 个时间线片段` : '等待生成时间线、关键帧和素材缺口',
      status: timeline.length > 0 ? 'ready' as const : storyboardRows > 0 ? 'review' as const : 'blocked' as const,
    },
    {
      key: 'asset_check' as const,
      title: '检查资料素材',
      detail: blockingGaps > 0 ? `${blockingGaps} 个素材缺口待处理` : '素材缺口可控',
      status: blockingGaps > 0 ? 'blocked' as const : 'ready' as const,
    },
    {
      key: 'performance' as const,
      title: '确认内容表现',
      detail: keyframes.length > 0 ? `关键帧 ${acceptedKeyframes}/${keyframes.length}` : '等待关键帧候选',
      status: keyframes.length === 0 ? 'review' as const : acceptedKeyframes > 0 ? 'ready' as const : 'blocked' as const,
    },
    {
      key: 'playback' as const,
      title: '播放预演',
      detail: timeline.length > 0 ? '可检查时长、顺序和节奏' : '等待预演时间线',
      status: timeline.length > 0 ? 'ready' as const : 'blocked' as const,
    },
    {
      key: 'confirm' as const,
      title: '确认预演结果',
      detail: confirmed ? '项目预演已确认' : '等待最终确认',
      status: confirmed ? 'ready' as const : 'review' as const,
    },
  ]
}

function StageHeader({ icon: Icon, title, text }: { icon: typeof FileText; title: string; text: string }) {
  return (
    <Card className="rounded-lg border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
        </div>
      </div>
    </Card>
  )
}

function PreviewMetric({ icon: Icon, label, value, status }: { icon: typeof FileText; label: string; value: string | number; status: ProjectPreviewItemStatus }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon size={14} />
          <span>{label}</span>
        </div>
        <PreviewItemBadge status={status} />
      </div>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}

function PreviewItemBadge({ status }: { status: ProjectPreviewItemStatus }) {
  if (status === 'ready') return <Badge variant="success">可用</Badge>
  if (status === 'blocked') return <Badge variant="danger">阻塞</Badge>
  return <Badge variant="warning">待确认</Badge>
}

function AssetGapPreviewBadge({ status }: { status: string }) {
  if (status === 'resolved') return <Badge variant="success">已解决</Badge>
  if (status === 'accepted') return <Badge variant="warning">已保留</Badge>
  if (status === 'rejected') return <Badge variant="secondary">已忽略</Badge>
  return <Badge variant="danger">阻塞</Badge>
}

function PreviewDecisionBadge({ status }: { status: string }) {
  if (status === 'accepted') return <Badge variant="success">已确认</Badge>
  if (status === 'rejected') return <Badge variant="danger">已拒绝</Badge>
  return <Badge variant="secondary">待确认</Badge>
}

function GateRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      {done ? <Badge variant="success">通过</Badge> : <Badge variant="warning">待处理</Badge>}
    </div>
  )
}

function EmptyWorkbenchState({ title, text }: { title: string; text: string }) {
  return (
    <Card className="rounded-lg border-dashed border-border bg-card p-8 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{text}</p>
    </Card>
  )
}

function ScenarioWorkspace({ category }: { category: WorkbenchCategory }) {
  if (category === 'preview') return <ProjectPreviewWorkspace />

  const surface = getWorkbenchSurface(category)
  const scenario = scenarios[category]
  const [selectedId, setSelectedId] = useState(scenario.queue[0]?.id ?? '')
  const selected = scenario.queue.find((item) => item.id === selectedId) ?? scenario.queue[0]
  const evidenceIcon = category === 'production' ? Play : category === 'delivery' ? Film : category === 'creative' ? Users : category === 'assets' ? Upload : FileText

  useEffect(() => {
    setSelectedId(scenario.queue[0]?.id ?? '')
  }, [category, scenario.queue])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <surface.icon size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-foreground">{surface.title}</h1>
              <Badge variant="outline">{surface.shortTitle}</Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{surface.purpose}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm"><RefreshCw size={14} />刷新建议</Button>
          <Button size="sm"><CheckCircle2 size={14} />确认当前决策</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-auto p-5">
          <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <QueueList items={scenario.queue} selectedId={selected?.id ?? ''} onSelect={setSelectedId} />
            <div className="min-w-0 space-y-5">
              {selected ? (
                <Card className="rounded-lg border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">当前对象</p>
                      <h2 className="mt-1 truncate text-lg font-semibold text-foreground">{selected.title}</h2>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{selected.subtitle}</p>
                    </div>
                    <Badge variant={statusVariant(selected.status)}>{statusLabel(selected.status)}</Badge>
                  </div>
                  <Progress value={selected.progress} className="mt-4 h-1.5" />
                </Card>
              ) : null}

              <div className="grid gap-5 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <InfoPanel title={scenario.evidenceTitle} rows={scenario.evidence} icon={evidenceIcon} />
                <DecisionPanel title={scenario.decisionTitle} rows={scenario.decisions} />
              </div>

              <Card className="rounded-lg border-border bg-card p-4">
                <h2 className="text-sm font-semibold text-foreground">工作台定位</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[
                    ['目的', surface.purpose, Target],
                    ['决策', surface.decision, ListChecks],
                    ['产出', surface.output, CheckCircle2],
                  ].map(([label, text, Icon]) => (
                    <div key={label as string} className="rounded-md border border-border bg-background p-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Icon size={14} />
                        <span>{label as string}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-foreground">{text as string}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </main>
        <ActionRail actions={scenario.actions} outputTitle={scenario.outputTitle} outputs={scenario.outputs} />
      </div>
    </div>
  )
}

function CategoryContent({ category }: { category: WorkbenchCategory }) {
  if (category === 'assets') return <AssetGenerationWorkspace />
  if (category === 'reference-relations') return <ReferenceRelationsPage embedded initialView="graph" />
  return <ScenarioWorkspace category={category} />
}

export function WorkbenchContent({ initialCategory = 'script', showCategoryTabs = true }: WorkbenchContentProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [category, setCategory] = useState<WorkbenchCategory>(() => {
    const tab = searchParams.get('tab')
    return showCategoryTabs && workbenchSurfaces.some((item) => item.value === tab) ? (tab as WorkbenchCategory) : initialCategory
  })

  useEffect(() => {
    const tab = searchParams.get('tab')
    setCategory(showCategoryTabs && workbenchSurfaces.some((item) => item.value === tab) ? (tab as WorkbenchCategory) : initialCategory)
  }, [searchParams, initialCategory, showCategoryTabs])

  const activeCategory = showCategoryTabs ? category : initialCategory
  const summary = useMemo(() => {
    const scenario = scenarios[activeCategory]
    const blocked = scenario.queue.filter((item) => item.status === 'blocked').length
    const review = scenario.queue.filter((item) => item.status === 'review').length
    const running = scenario.queue.filter((item) => item.status === 'running').length
    return `${review} 个待确认 · ${blocked} 个阻塞 · ${running} 个运行中`
  }, [activeCategory])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {showCategoryTabs && (
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-md bg-muted p-0.5">
            {workbenchSurfaces.map((item) => {
              const Icon = item.icon
              const active = category === item.value
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setCategory(item.value)
                    const next = new URLSearchParams(searchParams)
                    next.set('tab', item.value)
                    setSearchParams(next, { replace: true })
                  }}
                  className={cn(
                    'flex h-9 min-w-[104px] items-center justify-center gap-1.5 rounded px-3 text-sm font-medium transition-colors',
                    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon size={15} />
                  <span className="truncate">{item.shortTitle}</span>
                </button>
              )
            })}
          </div>
          <div className="ml-3 hidden shrink-0 items-center gap-2 text-xs text-muted-foreground xl:flex">
            <Clock3 size={14} />
            <span>{summary}</span>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <CategoryContent category={activeCategory} />
      </div>
    </div>
  )
}

interface WorkbenchPageProps {
  mode: WorkbenchMode
  initialCategory?: WorkbenchCategory
  showCategoryTabs?: boolean
}

export default function WorkbenchPage({ mode, initialCategory, showCategoryTabs }: WorkbenchPageProps) {
  return <WorkbenchContent mode={mode} initialCategory={initialCategory} showCategoryTabs={showCategoryTabs} />
}
