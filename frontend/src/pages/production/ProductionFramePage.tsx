import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  FileText,
  Film,
  Gauge,
  Image,
  LayoutDashboard,
  Lock,
  MessageSquareText,
  Play,
  Sparkles,
  Split,
  Target,
  Wand2,
} from 'lucide-react'

import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import type { Asset, Episode, Progress, Scene, Script, Shot, Storyboard, Task } from '@/types'
import { Badge } from '@movscript/ui'
import { Button } from '@movscript/ui'
import { Progress as ProgressBar } from '@movscript/ui'

type WorkbenchView = 'overview' | 'beats' | 'shots'

const stageFlow = [
  { key: 'structure', label: '结构化内容', icon: BookOpen, tone: 'text-sky-600', bg: 'bg-sky-500/10' },
  { key: 'intent', label: '创作意图', icon: Target, tone: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  { key: 'shot', label: '镜头任务', icon: Camera, tone: 'text-orange-600', bg: 'bg-orange-500/10' },
  { key: 'tools', label: '生成工具', icon: Wand2, tone: 'text-fuchsia-600', bg: 'bg-fuchsia-500/10' },
  { key: 'approval', label: '审批锁定', icon: BadgeCheck, tone: 'text-rose-600', bg: 'bg-rose-500/10' },
]

const beatRows = [
  {
    id: 'B01',
    title: '冷开场钩子',
    story: '女主在电梯里发现男主手机弹出陌生转账提醒。',
    hook: '信息差 / 关系危机',
    emotion: '不安升高',
    camera: '窄景别、低角度、缓慢推近手机屏幕',
    gate: '观众能在 5 秒内理解危险信号',
  },
  {
    id: 'B02',
    title: '误会扩大',
    story: '男主试图解释，但电梯门打开，第三人出现打断对话。',
    hook: '打断 / 新人物介入',
    emotion: '压迫转为愤怒',
    camera: '手持跟拍、交叉特写、停顿留白',
    gate: '冲突升级明确，不能提前释放真相',
  },
  {
    id: 'B03',
    title: '反转留钩',
    story: '第三人递出同款戒指盒，女主误以为自己被替代。',
    hook: '物件反转 / 误读',
    emotion: '爽点前置',
    camera: '戒指盒特写、女主瞳孔反应、硬切黑场',
    gate: '结尾必须形成下一场点击理由',
  },
]

const shotCards = [
  { id: 'S01', title: '电梯压迫特写', status: '待批阅', tool: '参考生图', intent: '让观众先看见风险，制造替女主着急的信息差。' },
  { id: 'S02', title: '手机屏幕推近', status: '需修改', tool: '画布', intent: '把转账提醒做成剧情证据，避免只是气氛镜头。' },
  { id: 'S03', title: '第三人入画', status: '可生成', tool: '生视频', intent: '用遮挡和开门动作打断解释，让冲突继续悬挂。' },
]

const toolNodes = [
  { label: '参考图', value: '角色 / 场景 / 道具', icon: Image },
  { label: 'Prompt', value: '继承节拍与资产卡', icon: MessageSquareText },
  { label: '画布', value: '多方案对比与回填', icon: Split },
  { label: '生成记录', value: '版本、成本、结果追踪', icon: Sparkles },
]

function pct(done: number, total: number) {
  if (!total) return 0
  return Math.round((done / total) * 100)
}

function safeCount<T>(data?: T[]) {
  return data?.length ?? 0
}

export default function ProductionFramePage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const [view, setView] = useState<WorkbenchView>('overview')

  const { data: progress } = useQuery<Progress>({
    queryKey: ['progress', projectId],
    queryFn: () => api.get(`/projects/${projectId}/progress`).then((r) => r.data),
    enabled: !!projectId,
  })

  const { data: scripts } = useQuery<Script[]>({
    queryKey: ['scripts', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scripts`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: episodes } = useQuery<Episode[]>({
    queryKey: ['episodes-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/episodes`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: scenes } = useQuery<Scene[]>({
    queryKey: ['scenes', projectId],
    queryFn: () => api.get(`/projects/${projectId}/scenes`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: storyboards } = useQuery<Storyboard[]>({
    queryKey: ['storyboards-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/storyboards`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: shots } = useQuery<Shot[]>({
    queryKey: ['shots-project', projectId],
    queryFn: () => api.get(`/projects/${projectId}/shots`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: assets } = useQuery<Asset[]>({
    queryKey: ['assets', projectId],
    queryFn: () => api.get(`/projects/${projectId}/assets`).then((r) => r.data),
    enabled: !!projectId,
  })
  const { data: tasks } = useQuery<Task[]>({
    queryKey: ['tasks', projectId],
    queryFn: () => api.get(`/projects/${projectId}/tasks`).then((r) => r.data),
    enabled: !!projectId,
  })

  const metrics = useMemo(() => {
    const storyboardTotal = progress?.storyboards.total ?? safeCount(storyboards)
    const storyboardApproved = progress?.storyboards.approved ?? (storyboards?.filter((x) => x.status === 'approved').length ?? 0)
    const shotTotal = progress?.shots.total ?? safeCount(shots)
    const shotApproved = progress?.shots.is_approved ?? (shots?.filter((x) => x.is_approved).length ?? 0)
    const reviewTasks = tasks?.filter((x) => x.status === 'review').length ?? 0
    const openTasks = tasks?.filter((x) => x.status !== 'done').length ?? 0

    return {
      scripts: progress?.scripts ?? safeCount(scripts),
      episodes: progress?.episodes ?? safeCount(episodes),
      scenes: progress?.scenes ?? safeCount(scenes),
      assets: progress?.assets ?? safeCount(assets),
      storyboardTotal,
      storyboardApproved,
      shotTotal,
      shotApproved,
      reviewTasks,
      openTasks,
      storyboardPct: pct(storyboardApproved, storyboardTotal),
      shotPct: pct(shotApproved, shotTotal),
    }
  }, [assets, episodes, progress, scenes, scripts, shots, storyboards, tasks])

  const firstEpisode = episodes?.[0]
  const firstScene = scenes?.[0]
  const firstScript = scripts?.[0]

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="min-w-[1180px] p-5 space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LayoutDashboard size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={13} />
              <span>AI 创作生产中台</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">从内容意图到镜头资产的生产总览</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              把结构化内容、生成工具和项目管理放到同一条可审批的生产链路中。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2">
              <Gauge size={15} />
              查看进度
            </Button>
            <Button className="gap-2">
              <Play size={15} />
              开始生产
            </Button>
          </div>
        </header>

        <section className="grid grid-cols-5 gap-3">
          {stageFlow.map((stage, index) => {
            const Icon = stage.icon
            return (
              <div key={stage.key} className="relative border border-border bg-card rounded-lg p-3">
                {index < stageFlow.length - 1 && (
                  <ArrowRight className="absolute -right-4 top-1/2 z-10 text-muted-foreground bg-background" size={18} />
                )}
                <div className="flex items-center gap-2">
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-md', stage.bg)}>
                    <Icon size={16} className={stage.tone} />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{stage.label}</p>
                    <p className="text-xs text-muted-foreground">第 {index + 1} 阶段</p>
                  </div>
                </div>
              </div>
            )
          })}
        </section>

        <section className="grid grid-cols-[270px_minmax(0,1fr)_300px] gap-4">
          <aside className="space-y-4">
            <Panel title="内容结构" icon={BookOpen}>
              <StructureRow icon={FileText} label="剧本" value={metrics.scripts} caption={firstScript?.title ?? '主线设定与完整文本'} />
              <StructureRow icon={Film} label="分集" value={metrics.episodes} caption={firstEpisode ? `EP${String(firstEpisode.number).padStart(2, '0')} ${firstEpisode.title}` : '按集管理目标与钩子'} />
              <StructureRow icon={Clapperboard} label="分场" value={metrics.scenes} caption={firstScene ? `${firstScene.number}. ${firstScene.title}` : '场景、地点、时间'} />
              <StructureRow icon={Target} label="节拍" value={beatRows.length} caption="钩子、情绪、剧情功能" />
              <StructureRow icon={Camera} label="镜头" value={metrics.shotTotal} caption="可生成、可审批的任务卡" />
            </Panel>

            <Panel title="完成度" icon={CheckCircle2}>
              <ProgressMetric label="分镜确认" value={metrics.storyboardPct} detail={`${metrics.storyboardApproved}/${metrics.storyboardTotal}`} />
              <ProgressMetric label="镜头锁定" value={metrics.shotPct} detail={`${metrics.shotApproved}/${metrics.shotTotal}`} />
              <ProgressMetric label="资产覆盖" value={Math.min(100, metrics.assets * 18)} detail={`${metrics.assets} 个资产`} />
            </Panel>
          </aside>

          <main className="space-y-4">
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">生产画布</p>
                  <p className="text-xs text-muted-foreground">内容结构、创作意图、镜头执行、生成工具和审批状态在这里对齐。</p>
                </div>
                <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1">
                  {[
                    { key: 'overview', label: '总览' },
                    { key: 'beats', label: '节拍' },
                    { key: 'shots', label: '镜头' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setView(item.key as WorkbenchView)}
                      className={cn(
                        'rounded px-3 py-1.5 text-xs font-medium transition-colors',
                        view === item.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {view === 'overview' && <ProductionCanvas />}
              {view === 'beats' && <BeatTable />}
              {view === 'shots' && <ShotTaskBoard />}
            </div>

            <section className="grid grid-cols-2 gap-4">
              <Panel title="工具包" icon={Wand2}>
                <div className="grid grid-cols-2 gap-2">
                  {toolNodes.map((tool) => {
                    const Icon = tool.icon
                    return (
                      <div key={tool.label} className="border border-border rounded-lg bg-background p-3">
                        <div className="flex items-center gap-2">
                          <Icon size={15} className="text-muted-foreground" />
                          <span className="text-sm font-medium">{tool.label}</span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tool.value}</p>
                      </div>
                    )
                  })}
                </div>
              </Panel>

              <Panel title="审批闸门" icon={Lock}>
                <div className="space-y-2">
                  {['故事大纲确认', '节拍与分镜确认', '角色/场景视觉确认', '单镜头锁定'].map((gate, index) => (
                    <div key={gate} className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
                      <span className={cn('h-2.5 w-2.5 rounded-full', index < 2 ? 'bg-emerald-500' : index === 2 ? 'bg-amber-500' : 'bg-muted-foreground/40')} />
                      <span className="flex-1 text-sm">{gate}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {index < 2 ? '已通过' : index === 2 ? '批阅中' : '未开始'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>
          </main>

          <aside className="space-y-4">
            <Panel title="管理者视图" icon={LayoutDashboard}>
              <Kpi label="待批阅" value={metrics.reviewTasks} tone="text-amber-600" />
              <Kpi label="进行中任务" value={metrics.openTasks} tone="text-sky-600" />
              <Kpi label="镜头已锁定" value={metrics.shotApproved} tone="text-emerald-600" />
            </Panel>

            <Panel title="需要处理" icon={AlertTriangle}>
              <ReviewItem title="S02 手机屏幕推近" detail="剧情证据不够清楚，需要补道具特写。" status="需修改" />
              <ReviewItem title="B03 反转留钩" detail="确认结尾是否足够推动下一场。" status="待确认" />
              <ReviewItem title="角色资产：女主" detail="缺少电梯场景的侧脸参考。" status="缺素材" />
            </Panel>

            <Panel title="资产一致性" icon={Image}>
              <AssetLine label="角色卡" value="3/5" />
              <AssetLine label="场景卡" value="2/4" />
              <AssetLine label="道具卡" value="1/3" />
              <AssetLine label="风格卡" value="已锁定" />
            </Panel>
          </aside>
        </section>
      </div>
    </div>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof BookOpen; children: React.ReactNode }) {
  return (
    <section className="border border-border rounded-lg bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Icon size={15} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </section>
  )
}

function StructureRow({ icon: Icon, label, value, caption }: { icon: typeof FileText; label: string; value: number; caption: string }) {
  return (
    <div className="flex items-start gap-2.5 border-b border-border/70 py-2.5 last:border-b-0">
      <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-muted">
        <Icon size={14} className="text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{label}</p>
          <span className="font-mono text-xs text-muted-foreground">{value}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{caption}</p>
      </div>
    </div>
  )
}

function ProgressMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="space-y-1.5 py-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-muted-foreground">{detail}</span>
      </div>
      <ProgressBar value={value} className="h-1.5" />
    </div>
  )
}

function ProductionCanvas() {
  return (
    <div className="canvas-flow p-4">
      <div className="grid grid-cols-5 gap-3">
        <CanvasLane title="结构" items={['EP01 关系危机', '电梯场景', '戒指盒道具']} />
        <CanvasLane title="意图" items={['信息差钩子', '压迫情绪', '反转留白']} accent="emerald" />
        <CanvasLane title="镜头" items={['S01 特写', 'S02 推近', 'S03 入画']} accent="orange" />
        <CanvasLane title="工具" items={['参考生图', '画布对比', '生视频']} accent="fuchsia" />
        <CanvasLane title="审批" items={['B01 通过', 'S02 修改', 'S03 待生成']} accent="rose" />
      </div>
    </div>
  )
}

function CanvasLane({ title, items, accent = 'sky' }: { title: string; items: string[]; accent?: 'sky' | 'emerald' | 'orange' | 'fuchsia' | 'rose' }) {
  const dotClass = {
    sky: 'bg-sky-500',
    emerald: 'bg-emerald-500',
    orange: 'bg-orange-500',
    fuchsia: 'bg-fuchsia-500',
    rose: 'bg-rose-500',
  }[accent]

  return (
    <div className="min-h-[300px] rounded-lg border border-border bg-background/92 p-3">
      <div className="mb-3 flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', dotClass)} />
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item} className="rounded-md border border-border bg-card px-3 py-2 shadow-sm">
            <p className="text-sm font-medium">{item}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">可拖拽、可批注、可进入详情</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function BeatTable() {
  return (
    <div className="overflow-hidden">
      <div className="grid grid-cols-[72px_1.1fr_1fr_1fr_1.2fr_1.1fr] border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
        <span>编号</span>
        <span>节拍</span>
        <span>钩子</span>
        <span>情绪</span>
        <span>镜头推动</span>
        <span>通过标准</span>
      </div>
      {beatRows.map((row) => (
        <div key={row.id} className="grid grid-cols-[72px_1.1fr_1fr_1fr_1.2fr_1.1fr] border-b border-border px-4 py-3 text-sm last:border-b-0">
          <span className="font-mono text-xs text-muted-foreground">{row.id}</span>
          <span>
            <strong className="block font-medium">{row.title}</strong>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{row.story}</span>
          </span>
          <span className="text-muted-foreground">{row.hook}</span>
          <span className="text-muted-foreground">{row.emotion}</span>
          <span className="text-muted-foreground">{row.camera}</span>
          <span className="text-muted-foreground">{row.gate}</span>
        </div>
      ))}
    </div>
  )
}

function ShotTaskBoard() {
  return (
    <div className="grid grid-cols-3 gap-3 p-4">
      {shotCards.map((shot) => (
        <div key={shot.id} className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-mono text-xs text-muted-foreground">{shot.id}</p>
              <h3 className="mt-1 text-sm font-semibold">{shot.title}</h3>
            </div>
            <Badge variant="outline">{shot.status}</Badge>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{shot.intent}</p>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">{shot.tool}</span>
            <Button variant="outline" size="sm">打开任务卡</Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-lg font-semibold', tone)}>{value}</span>
    </div>
  )
}

function ReviewItem({ title, detail, status }: { title: string; detail: string; status: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Badge variant="secondary" className="shrink-0">{status}</Badge>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  )
}

function AssetLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
