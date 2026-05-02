import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  FileText,
  Film,
  Image,
  ListChecks,
  Play,
  RefreshCw,
  Sparkles,
  Target,
  Upload,
  Users,
  Video,
  Wand2,
} from 'lucide-react'

import ReferenceRelationsPage from '@/pages/reference-relations/ReferenceRelationsPage'
import { AssetGenerationWorkspace } from '@/pages/assets/AssetsPage'
import { cn } from '@/lib/utils'
import { Badge, Button, Card, Progress } from '@movscript/ui'
import {
  getWorkbenchSurface,
  workbenchSurfaces,
  type WorkbenchCategory,
} from '@/pages/project-workspace/structure'

export type WorkbenchMode = 'free'
type WorkStatus = 'blocked' | 'review' | 'ready' | 'running'
type Priority = 'high' | 'medium' | 'low'

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
      { id: 's3', title: '旧伞纸条滑落', subtitle: '第 3 节 · 建议拆成两个情境', status: 'review', priority: 'high', progress: 62 },
      { id: 's2', title: '巷口对峙', subtitle: '第 2 节 · 人物动机待确认', status: 'review', priority: 'medium', progress: 74 },
      { id: 's4', title: '顾言停步', subtitle: '第 4 节 · 低置信表达', status: 'blocked', priority: 'medium', progress: 35 },
    ],
    evidenceTitle: '剧本证据',
    evidence: [
      '林夏撑着旧伞走进雨夜巷口，雨水沿着伞骨滴落。',
      '纸条从伞骨夹缝里滑出，被雨水打湿。',
      '顾言看见纸条，神色变化。林夏低声说：你还是来了。',
    ],
    decisionTitle: '理解判断',
    decisions: [
      { label: '情境', value: '旧伞纸条滑落' },
      { label: '人物', value: '林夏、顾言' },
      { label: '道具', value: '破损旧伞、纸条' },
      { label: '风险', value: '顾言动机缺上下文', tone: 'warning' },
    ],
    outputTitle: '确认后输出',
    outputs: [
      { label: '结构', value: '新增 2 个情境候选' },
      { label: '下游', value: '生成资料候选和素材缺口' },
      { label: '状态', value: '可进入预演决策', tone: 'success' },
    ],
    actions: ['确认为情境', '拆成两个情境', '忽略候选', '生成资料候选'],
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
      { id: 'v2', title: '片段 02 人物停步', subtitle: '版本 B 待审', status: 'review', priority: 'high', progress: 61 },
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

function ScenarioWorkspace({ category }: { category: WorkbenchCategory }) {
  const surface = getWorkbenchSurface(category)
  const scenario = scenarios[category]
  const [selectedId, setSelectedId] = useState(scenario.queue[0]?.id ?? '')
  const selected = scenario.queue.find((item) => item.id === selectedId) ?? scenario.queue[0]
  const evidenceIcon = category === 'production' ? Play : category === 'delivery' ? Film : category === 'creative' ? Users : category === 'assets' ? Upload : category === 'preview' ? Video : FileText

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

