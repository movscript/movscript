import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Film,
  Flag,
  Gauge,
  PackageCheck,
  Plus,
  Save,
  Sparkles,
  Target,
  Trash2,
  Users,
  Wand2,
} from 'lucide-react'

import { Badge, Button, Input, Textarea } from '@movscript/ui'
import { useProjectStore } from '@/store/projectStore'
import { cn } from '@/lib/utils'

type MilestoneStatus = 'planned' | 'active' | 'blocked' | 'done'
type ConstraintLevel = 'normal' | 'risk' | 'blocking'

interface Milestone {
  id: string
  title: string
  owner: string
  due: string
  status: MilestoneStatus
}

interface Constraint {
  id: string
  title: string
  detail: string
  level: ConstraintLevel
}

interface ProjectPlanDraft {
  logline: string
  format: string
  audience: string
  runtime: string
  style: string
  delivery: string
  creativeScope: string
  productionScope: string
  milestones: Milestone[]
  constraints: Constraint[]
}

const defaultPlan: ProjectPlanDraft = {
  logline: '雨夜旧伞暴露出被隐藏多年的线索，主角被迫重新面对失踪母亲留下的秘密。',
  format: '竖屏短剧 / 8 集 / 每集 60-90 秒',
  audience: '悬疑情感向短剧观众，偏重强钩子、快节奏、人物关系反转。',
  runtime: '首版预演控制在 8-12 分钟，单个内容单元 4-8 秒。',
  style: '冷雨低照度、强道具证据、克制表演，不使用过度奇幻视觉。',
  delivery: '先完成可播放预演，再进入关键片段生产，最终输出 1080x1920 竖屏版本。',
  creativeScope: '核心人物、雨夜巷口、旧伞、纸条、第三人剪影必须先确定；支线地点和群演可后置。',
  productionScope: '优先生产能支撑剧情钩子的内容单元；素材缺口未锁定前不进入正式视频批量生成。',
  milestones: [
    { id: 'm1', title: '确认项目定位和交付规格', owner: '导演', due: '本周', status: 'active' },
    { id: 'm2', title: '完成第一版剧本预演', owner: '编导', due: '下周', status: 'planned' },
    { id: 'm3', title: '锁定核心人物与道具素材', owner: '美术', due: '下周', status: 'planned' },
  ],
  constraints: [
    { id: 'c1', title: '旧伞和纸条必须可读', detail: '关键道具不能被雨效、景深或运动模糊遮挡。', level: 'risk' },
    { id: 'c2', title: '第三人身份延后暴露', detail: '前半段只能使用剪影或局部动作，不出现清晰正脸。', level: 'normal' },
  ],
}

const statusMeta: Record<MilestoneStatus, { label: string; className: string }> = {
  planned: { label: '计划中', className: 'bg-muted text-muted-foreground' },
  active: { label: '推进中', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  blocked: { label: '阻塞', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  done: { label: '完成', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
}

const constraintMeta: Record<ConstraintLevel, { label: string; className: string }> = {
  normal: { label: '约束', className: 'bg-muted text-muted-foreground' },
  risk: { label: '风险', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  blocking: { label: '阻塞', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
}

function textCompletion(values: string[]) {
  const filled = values.filter((value) => value.trim().length > 0).length
  return Math.round((filled / values.length) * 100)
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`
}

export default function ProjectPlanPage() {
  const project = useProjectStore((s) => s.current)
  const storageKey = `movscript-project-plan-${project?.ID ?? 'none'}`
  const [plan, setPlan] = useState<ProjectPlanDraft>(defaultPlan)
  const [savedAt, setSavedAt] = useState<string>('')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) setPlan({ ...defaultPlan, ...JSON.parse(stored) })
    } catch {
      setPlan(defaultPlan)
    }
  }, [storageKey])

  const readiness = useMemo(() => {
    const scopeReady = textCompletion([
      plan.logline,
      plan.format,
      plan.audience,
      plan.runtime,
      plan.style,
      plan.delivery,
      plan.creativeScope,
      plan.productionScope,
    ])
    const doneMilestones = plan.milestones.filter((item) => item.status === 'done').length
    const milestoneReady = plan.milestones.length > 0 ? Math.round((doneMilestones / plan.milestones.length) * 100) : 0
    const blocking = plan.constraints.filter((item) => item.level === 'blocking').length
    return Math.max(0, Math.round(scopeReady * 0.7 + milestoneReady * 0.3) - blocking * 10)
  }, [plan])

  function updateField<K extends keyof ProjectPlanDraft>(key: K, value: ProjectPlanDraft[K]) {
    setPlan((current) => ({ ...current, [key]: value }))
  }

  function saveDraft() {
    localStorage.setItem(storageKey, JSON.stringify(plan))
    setSavedAt(new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date()))
  }

  function addMilestone() {
    updateField('milestones', [
      ...plan.milestones,
      { id: nextId('m'), title: '新的规划节点', owner: '未分配', due: '待定', status: 'planned' },
    ])
  }

  function updateMilestone(id: string, patch: Partial<Milestone>) {
    updateField('milestones', plan.milestones.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function removeMilestone(id: string) {
    updateField('milestones', plan.milestones.filter((item) => item.id !== id))
  }

  function addConstraint() {
    updateField('constraints', [
      ...plan.constraints,
      { id: nextId('c'), title: '新的约束', detail: '说明影响范围和处理边界。', level: 'normal' },
    ])
  }

  function updateConstraint(id: string, patch: Partial<Constraint>) {
    updateField('constraints', plan.constraints.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  function removeConstraint(id: string) {
    updateField('constraints', plan.constraints.filter((item) => item.id !== id))
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 p-6">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Target size={17} />
                  </span>
                  <Badge variant="outline">V2 项目规划</Badge>
                  {savedAt && <Badge variant="secondary">已保存 {savedAt}</Badge>}
                </div>
                <h1 className="mt-4 truncate text-2xl font-semibold text-foreground">{project?.name ?? '项目规划'}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  在这里确定项目目标、交付规格、创作边界和生产节奏；剧本预演只负责把某一版内容落成可确认的结构。
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="outline" className="gap-2" onClick={saveDraft}>
                  <Save size={15} /> 保存草稿
                </Button>
                <Button asChild className="gap-2">
                  <Link to="/script-preview">
                    进入剧本预演 <ArrowRight size={15} />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                { icon: Gauge, label: '规划完整度', value: `${readiness}%`, detail: '目标、范围和节点' },
                { icon: CalendarDays, label: '里程碑', value: plan.milestones.length, detail: '项目级推进节点' },
                { icon: Flag, label: '阻塞约束', value: plan.constraints.filter((item) => item.level === 'blocking').length, detail: '需要先处理' },
                { icon: CheckCircle2, label: '完成节点', value: plan.milestones.filter((item) => item.status === 'done').length, detail: '可继续沉淀' },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="rounded-md border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{item.value}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon size={16} />
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles size={17} className="text-primary" />
              <h2 className="text-base font-semibold text-foreground">规划到生产</h2>
            </div>
            <div className="mt-5 space-y-3">
              {[
                { icon: ClipboardList, title: '项目规划', detail: '目标、规格、范围、节奏' },
                { icon: Film, title: '剧本预演', detail: '剧本节、情境、内容单元、预演时间线' },
                { icon: PackageCheck, title: '素材准备', detail: '素材需求、候选、锁定' },
                { icon: Wand2, title: '内容生产', detail: '片段候选、采用、返工' },
              ].map((item, index) => {
                const Icon = item.icon
                return (
                  <div key={item.title} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
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

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <FileText size={17} className="text-muted-foreground" />
                <h2 className="text-base font-semibold text-foreground">项目定义</h2>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2 lg:col-span-2">
                  <span className="text-xs font-medium text-muted-foreground">一句话钩子</span>
                  <Textarea value={plan.logline} onChange={(event) => updateField('logline', event.target.value)} className="min-h-[88px]" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">内容形态</span>
                  <Input value={plan.format} onChange={(event) => updateField('format', event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">目标受众</span>
                  <Input value={plan.audience} onChange={(event) => updateField('audience', event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">时长节奏</span>
                  <Input value={plan.runtime} onChange={(event) => updateField('runtime', event.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">交付规格</span>
                  <Input value={plan.delivery} onChange={(event) => updateField('delivery', event.target.value)} />
                </label>
                <label className="space-y-2 lg:col-span-2">
                  <span className="text-xs font-medium text-muted-foreground">风格边界</span>
                  <Textarea value={plan.style} onChange={(event) => updateField('style', event.target.value)} className="min-h-[88px]" />
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Users size={17} className="text-muted-foreground" />
                <h2 className="text-base font-semibold text-foreground">范围边界</h2>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">创作范围</span>
                  <Textarea value={plan.creativeScope} onChange={(event) => updateField('creativeScope', event.target.value)} className="min-h-[132px]" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">生产范围</span>
                  <Textarea value={plan.productionScope} onChange={(event) => updateField('productionScope', event.target.value)} className="min-h-[132px]" />
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays size={17} className="text-muted-foreground" />
                  <h2 className="text-base font-semibold text-foreground">里程碑</h2>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={addMilestone}>
                  <Plus size={14} /> 新增
                </Button>
              </div>
              <div className="space-y-2">
                {plan.milestones.map((item) => (
                  <div key={item.id} className="rounded-md border border-border bg-background p-3">
                    <div className="flex items-start gap-2">
                      <Input value={item.title} onChange={(event) => updateMilestone(item.id, { title: event.target.value })} className="min-w-0 flex-1" />
                      <button
                        type="button"
                        onClick={() => removeMilestone(item.id)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="删除"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_96px_96px] gap-2">
                      <Input value={item.owner} onChange={(event) => updateMilestone(item.id, { owner: event.target.value })} />
                      <Input value={item.due} onChange={(event) => updateMilestone(item.id, { due: event.target.value })} />
                      <select
                        value={item.status}
                        onChange={(event) => updateMilestone(item.id, { status: event.target.value as MilestoneStatus })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                      >
                        {Object.entries(statusMeta).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                      </select>
                    </div>
                    <div className="mt-2">
                      <span className={cn('inline-flex rounded-md px-2 py-1 text-xs font-medium', statusMeta[item.status].className)}>
                        {statusMeta[item.status].label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Flag size={17} className="text-muted-foreground" />
                  <h2 className="text-base font-semibold text-foreground">风险与约束</h2>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={addConstraint}>
                  <Plus size={14} /> 新增
                </Button>
              </div>
              <div className="space-y-2">
                {plan.constraints.map((item) => (
                  <div key={item.id} className="rounded-md border border-border bg-background p-3">
                    <div className="flex items-start gap-2">
                      <Input value={item.title} onChange={(event) => updateConstraint(item.id, { title: event.target.value })} className="min-w-0 flex-1" />
                      <select
                        value={item.level}
                        onChange={(event) => updateConstraint(item.id, { level: event.target.value as ConstraintLevel })}
                        className="h-9 w-20 shrink-0 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                      >
                        {Object.entries(constraintMeta).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeConstraint(item.id)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="删除"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <Textarea value={item.detail} onChange={(event) => updateConstraint(item.id, { detail: event.target.value })} className="mt-2 min-h-[76px]" />
                    <div className="mt-2">
                      <span className={cn('inline-flex rounded-md px-2 py-1 text-xs font-medium', constraintMeta[item.level].className)}>
                        {constraintMeta[item.level].label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
