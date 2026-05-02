import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Film,
  History,
  ListChecks,
  Lock,
  MessageSquareText,
  Play,
  Radio,
  ShieldCheck,
  Timer,
  Video,
  XCircle,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge, Button, Progress as ProgressBar } from '@movscript/ui'

type CheckStatus = 'passed' | 'warning' | 'blocked'
type TimelineStatus = 'locked' | 'needs-review' | 'missing'
type VersionStatus = 'approved' | 'review' | 'draft'

interface DeliveryCheck {
  id: string
  label: string
  description: string
  status: CheckStatus
  count: string
}

interface DeliverySegment {
  id: string
  order: string
  title: string
  preview: string
  final: string
  duration: string
  status: TimelineStatus
  note: string
}

interface DeliveryVersion {
  id: string
  label: string
  status: VersionStatus
  createdAt: string
  owner: string
  summary: string
}

interface ReviewRecord {
  id: string
  role: string
  owner: string
  state: 'done' | 'pending'
  comment: string
  time: string
}

const deliveryChecks: DeliveryCheck[] = [
  {
    id: 'timeline',
    label: '时间线完整性',
    description: '全部内容单元都有成片片段，片段顺序与预演一致。',
    status: 'passed',
    count: '12/12',
  },
  {
    id: 'missing',
    label: '缺失项检查',
    description: '旧伞特写仍使用候选素材，导出前需要人工确认。',
    status: 'warning',
    count: '1 项',
  },
  {
    id: 'review',
    label: '审核记录',
    description: '导演审核已通过，品牌审核还未完成。',
    status: 'warning',
    count: '2/3',
  },
  {
    id: 'export',
    label: '导出条件',
    description: '母版规格、字幕、音频电平和封面均已生成。',
    status: 'passed',
    count: '可导出',
  },
]

const deliverySegments: DeliverySegment[] = [
  {
    id: 'cu-01',
    order: '01',
    title: '冷开场钩子',
    preview: '电梯压迫特写 -> 手机转账提醒',
    final: 'final_cu01_v03.mp4',
    duration: '00:18',
    status: 'locked',
    note: '镜头节奏已锁定',
  },
  {
    id: 'cu-02',
    order: '02',
    title: '误会扩大',
    preview: '男主解释被第三人打断',
    final: 'final_cu02_v02.mp4',
    duration: '00:26',
    status: 'locked',
    note: '声音与字幕已通过',
  },
  {
    id: 'cu-03',
    order: '03',
    title: '旧伞纸条暴露',
    preview: '纸条特写与女主反应',
    final: 'candidate_cu03_v04.mp4',
    duration: '00:21',
    status: 'needs-review',
    note: '道具特写仍需审核',
  },
  {
    id: 'cu-04',
    order: '04',
    title: '反转留钩',
    preview: '戒指盒入画，硬切黑场',
    final: 'final_cu04_v01.mp4',
    duration: '00:15',
    status: 'locked',
    note: '结尾钩子已确认',
  },
  {
    id: 'cu-05',
    order: '05',
    title: '平台包装',
    preview: '片尾 Logo 与 CTA',
    final: '待补充平台版包装',
    duration: '00:06',
    status: 'missing',
    note: '缺少竖版封面尾帧',
  },
]

const deliveryVersions: DeliveryVersion[] = [
  {
    id: 'dv-007',
    label: 'Delivery v0.7',
    status: 'review',
    createdAt: '今天 16:42',
    owner: '制片审核',
    summary: '当前候选版本，等待品牌审核与尾帧包装。',
  },
  {
    id: 'dv-006',
    label: 'Delivery v0.6',
    status: 'approved',
    createdAt: '昨天 21:18',
    owner: '导演组',
    summary: '结构完整，但旧伞特写读秒不足。',
  },
  {
    id: 'dv-005',
    label: 'Delivery v0.5',
    status: 'draft',
    createdAt: '昨天 13:05',
    owner: '后期组',
    summary: '首次合成成片时间线，音频未混。',
  },
]

const reviewRecords: ReviewRecord[] = [
  {
    id: 'director',
    role: '导演审核',
    owner: '陈导',
    state: 'done',
    comment: '节奏通过，保留第三人入画前的 8 帧停顿。',
    time: '16:18',
  },
  {
    id: 'producer',
    role: '制片审核',
    owner: 'Mia',
    state: 'done',
    comment: '导出规格和时长符合投放要求。',
    time: '16:26',
  },
  {
    id: 'brand',
    role: '品牌审核',
    owner: '品牌方',
    state: 'pending',
    comment: '等待确认手机 UI 与片尾包装。',
    time: '待处理',
  },
]

const statusMeta: Record<TimelineStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  locked: { label: '已锁定', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', icon: Lock },
  'needs-review': { label: '待审核', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', icon: AlertTriangle },
  missing: { label: '缺失', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', icon: XCircle },
}

const checkMeta: Record<CheckStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  passed: { label: '通过', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
  warning: { label: '待处理', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', icon: AlertTriangle },
  blocked: { label: '阻塞', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', icon: XCircle },
}

const versionMeta: Record<VersionStatus, { label: string; className: string }> = {
  approved: { label: '已通过', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  review: { label: '审核中', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  draft: { label: '草稿', className: 'bg-muted text-muted-foreground' },
}

export default function DeliveryPage() {
  const project = useProjectStore((s) => s.current)
  const [selectedVersionId, setSelectedVersionId] = useState(deliveryVersions[0].id)

  const selectedVersion = deliveryVersions.find((version) => version.id === selectedVersionId) ?? deliveryVersions[0]
  const lockedSegments = deliverySegments.filter((segment) => segment.status === 'locked').length
  const warningChecks = deliveryChecks.filter((check) => check.status !== 'passed').length
  const completion = Math.round((lockedSegments / deliverySegments.length) * 100)
  const totalDuration = useMemo(() => {
    const totalSeconds = deliverySegments.reduce((sum, segment) => {
      const [minutes, seconds] = segment.duration.split(':').map(Number)
      return sum + minutes * 60 + seconds
    }, 0)
    return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`
  }, [])

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="min-w-[1180px] p-5 space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Archive size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={13} />
              <span>交付</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">交付版本检查台</h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              对照预演时间线检查成片完整性、审核记录和导出条件，只记录交付结果，不回写剧本结构、创作资料或素材事实。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2">
              <Eye size={15} />
              预览全片
            </Button>
            <Button className="gap-2" disabled={warningChecks > 0}>
              <Download size={15} />
              导出版本
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-[minmax(0,1fr)_340px] gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <BadgeCheck size={16} className={warningChecks > 0 ? 'text-amber-600' : 'text-emerald-600'} />
                  <h2 className="text-sm font-semibold text-foreground">{selectedVersion.label}</h2>
                  <Badge className={cn('text-[10px]', versionMeta[selectedVersion.status].className)}>
                    {versionMeta[selectedVersion.status].label}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{selectedVersion.summary}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-right">
                <Metric label="完成度" value={`${completion}%`} />
                <Metric label="总时长" value={totalDuration} />
                <Metric label="待处理" value={`${warningChecks}`} tone={warningChecks > 0 ? 'text-amber-600' : 'text-emerald-600'} />
              </div>
            </div>
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>成片片段锁定进度</span>
                <span>{lockedSegments}/{deliverySegments.length}</span>
              </div>
              <ProgressBar value={completion} className="h-1.5" />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-600" />
                <h2 className="text-sm font-semibold text-foreground">导出门禁</h2>
              </div>
              <Badge variant="secondary" className="text-[10px]">需处理 {warningChecks} 项</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {deliveryChecks.map((check) => {
                const meta = checkMeta[check.status]
                const Icon = meta.icon
                return (
                  <div key={check.id} className="flex items-start gap-3 rounded-md border border-border bg-background p-3">
                    <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md', meta.className)}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{check.label}</p>
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">{check.count}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{check.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-[minmax(0,1fr)_340px] gap-4">
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Film size={16} className="text-sky-600" />
                <h2 className="text-sm font-semibold text-foreground">预演时间线 / 成片时间线</h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Radio size={13} />
                <span>按内容单元对齐</span>
              </div>
            </div>
            <div className="divide-y divide-border">
              {deliverySegments.map((segment) => (
                <TimelineRow key={segment.id} segment={segment} />
              ))}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <History size={16} className="text-violet-600" />
                <h2 className="text-sm font-semibold text-foreground">版本记录</h2>
              </div>
              <div className="mt-4 space-y-2">
                {deliveryVersions.map((version) => {
                  const meta = versionMeta[version.status]
                  const selected = version.id === selectedVersionId
                  return (
                    <button
                      key={version.id}
                      onClick={() => setSelectedVersionId(version.id)}
                      className={cn(
                        'w-full rounded-md border p-3 text-left transition-colors',
                        selected ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted/50',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{version.label}</p>
                        <Badge className={cn('text-[10px]', meta.className)}>{meta.label}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{version.createdAt} · {version.owner}</p>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{version.summary}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <ListChecks size={16} className="text-teal-600" />
                <h2 className="text-sm font-semibold text-foreground">审核记录</h2>
              </div>
              <div className="mt-4 space-y-3">
                {reviewRecords.map((record) => (
                  <div key={record.id} className="rounded-md border border-border bg-background p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {record.state === 'done'
                          ? <CheckCircle2 size={14} className="text-emerald-600" />
                          : <Clock3 size={14} className="text-amber-600" />}
                        <p className="text-sm font-medium text-foreground">{record.role}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{record.time}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{record.owner}</p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{record.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="grid grid-cols-4 gap-3">
          <DeliveryAction icon={Play} title="播放检查" text="从预演顺序播放当前成片候选，确认节奏和断点。" />
          <DeliveryAction icon={FileCheck2} title="保存交付版本" text="把当前检查结果保存为一个可回溯的交付版本。" />
          <DeliveryAction icon={MessageSquareText} title="记录审核意见" text="只写入交付审核，不改变生产任务或素材采用状态。" />
          <DeliveryAction icon={Download} title="导出母版" text="在全部门禁通过后生成平台规格和归档文件。" />
        </section>
      </div>
    </div>
  )
}

function Metric({ label, value, tone = 'text-foreground' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className={cn('text-xl font-semibold tabular-nums', tone)}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function TimelineRow({ segment }: { segment: DeliverySegment }) {
  const meta = statusMeta[segment.status]
  const Icon = meta.icon
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_112px] items-stretch">
      <div className="flex items-center justify-center border-r border-border bg-muted/20">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-xs font-semibold text-muted-foreground">
          {segment.order}
        </div>
      </div>
      <div className="min-w-0 border-r border-border p-4">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-muted-foreground" />
          <p className="truncate text-sm font-medium text-foreground">{segment.title}</p>
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{segment.preview}</p>
      </div>
      <div className="min-w-0 border-r border-border p-4">
        <div className="flex items-center gap-2">
          <Video size={14} className="text-muted-foreground" />
          <p className="truncate text-sm font-medium text-foreground">{segment.final}</p>
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{segment.note}</p>
      </div>
      <div className="flex flex-col justify-center gap-2 p-4">
        <Badge className={cn('w-fit text-[10px]', meta.className)}>
          <Icon size={11} className="mr-1" />
          {meta.label}
        </Badge>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Timer size={12} />
          <span>{segment.duration}</span>
        </div>
      </div>
    </div>
  )
}

function DeliveryAction({ icon: Icon, title, text }: { icon: typeof Play; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon size={15} />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}
