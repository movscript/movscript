import type { LucideIcon } from 'lucide-react'
import { ArrowRight, CheckCircle2, ChevronRight, CircleDot, Database, ListChecks, RefreshCw } from 'lucide-react'

import { decisionVariant, priorityLabel, statusLabel, statusVariant } from '@/lib/contentWorkbenchStatus'
import { cn } from '@/lib/utils'
import { useWorkbenchCanvasLauncher, type CanvasWorkbenchKind } from '@/lib/useWorkbenchCanvasLauncher'
import type {
  WorkbenchDecisionRow,
  WorkbenchQueueItem,
  WorkbenchScenarioPriority,
  WorkbenchScenarioStatus,
} from '@/lib/workbenchScenarios'
import { getWorkbenchSurface, type WorkbenchCategory } from '@/pages/project/projectSurfaces'
import { Badge, Button, Card, Progress, ScrollArea } from '@movscript/ui'
import { WorkbenchPanel } from './WorkbenchPanel'

export interface WorkbenchMetric {
  label: string
  value: string
  detail: string
  icon: LucideIcon
  status: WorkbenchScenarioStatus
}

export interface WorkbenchGate {
  label: string
  detail: string
  done: boolean
  tone?: 'warning' | 'success'
}

export interface WorkbenchLinkRow {
  label: string
  value: string
  icon: LucideIcon
}

export function SpecializedWorkbenchHeader({
  category,
  kicker,
  title,
  description,
  generationKind,
}: {
  category: WorkbenchCategory
  kicker: string
  title: string
  description: string
  generationKind?: CanvasWorkbenchKind
}) {
  const surface = getWorkbenchSurface(category)
  const generation = useWorkbenchCanvasLauncher(generationKind)

  return (
    <header className="shrink-0 border-b border-border bg-background px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <surface.icon size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database size={14} />
              <span>当前项目</span>
              <ChevronRight size={13} />
              <span>{kicker}</span>
            </div>
            <h1 className="mt-1 truncate text-lg font-semibold text-foreground">{title}</h1>
            <p className="mt-1 max-w-4xl truncate text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm">
            <RefreshCw size={14} />
            刷新上下文
          </Button>
          {generationKind ? (
            <Button size="sm" disabled={generation.disabled} loading={generation.loading} onClick={generation.open}>
              <ArrowRight size={14} />
              {generation.label}
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export function QueueList({
  items,
  selectedId,
  onSelect,
}: {
  items: WorkbenchQueueItem[]
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

export function InfoPanel({ title, rows, icon: Icon }: { title: string; rows: string[]; icon: LucideIcon }) {
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

export function DecisionPanel({ title, rows }: { title: string; rows: WorkbenchDecisionRow[] }) {
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

export function ActionRail({ actions, outputTitle, outputs }: { actions: string[]; outputTitle: string; outputs: WorkbenchDecisionRow[] }) {
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

export function MetricStrip({ metrics }: { metrics: WorkbenchMetric[] }) {
  return (
    <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon
        return (
          <div key={metric.label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <Icon size={15} />
                <span className="truncate">{metric.label}</span>
              </div>
              <Badge variant={statusVariant(metric.status)}>{statusLabel(metric.status)}</Badge>
            </div>
            <p className="mt-3 text-2xl font-semibold text-foreground">{metric.value}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{metric.detail}</p>
          </div>
        )
      })}
    </section>
  )
}

export function SpecializedQueue({
  title = '生产队列',
  items,
  selectedId,
  onSelect,
  className,
  bodyClassName,
}: {
  title?: string
  items: Array<{
    id: string
    title: string
    scope: string
    status: WorkbenchScenarioStatus
    priority: WorkbenchScenarioPriority
    progress: number
    need?: string
  }>
  selectedId: string
  onSelect: (id: string) => void
  className?: string
  bodyClassName?: string
}) {
  return (
    <WorkbenchPanel title={title} icon={ListChecks} action={<Badge variant="secondary">{items.length}</Badge>} className={className} bodyClassName={bodyClassName}>
      <ScrollArea className="h-full min-h-0">
        <div className="space-y-2 pr-2">
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
              <p className="mt-1 truncate text-xs text-muted-foreground">{item.scope}</p>
              {item.need ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.need}</p> : null}
              <div className="mt-3 flex items-center gap-2">
                <Badge variant={item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'outline'}>{priorityLabel(item.priority)}</Badge>
                <Progress value={item.progress} className="h-1.5" />
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </WorkbenchPanel>
  )
}

export function QueueMiniMetric({
  label,
  value,
  tone = 'default',
  onClick,
}: {
  label: string
  value: number | string
  tone?: 'default' | 'warning'
  onClick?: () => void
}) {
  const content = (
    <>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-sm font-semibold tabular-nums', tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground')}>{value}</p>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="min-w-14 rounded-md border border-border bg-background px-2 py-1.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
      >
        {content}
      </button>
    )
  }
  return (
    <div className="min-w-14 rounded-md border border-border bg-background px-2 py-1.5">
      {content}
    </div>
  )
}

export function ContextStack({ rows, className }: { rows: WorkbenchLinkRow[]; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-md border border-border bg-background', className)}>
      {rows.map((row) => {
        const Icon = row.icon
        return (
          <div key={row.label} className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 border-b border-border/70 px-2.5 py-2 last:border-b-0">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <Icon size={14} className="shrink-0" />
              <span className="truncate">{row.label}</span>
            </div>
            <p className="min-w-0 truncate text-sm text-foreground">{row.value}</p>
          </div>
        )
      })}
    </div>
  )
}

export function GateChecklist({ rows }: { rows: WorkbenchGate[] }) {
  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.label} className="rounded-md border border-border bg-background px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {row.done ? <CheckCircle2 size={15} className="shrink-0 text-emerald-600" /> : <CircleDot size={15} className="shrink-0 text-amber-600" />}
              <span className="truncate text-sm font-medium text-foreground">{row.label}</span>
            </div>
            <Badge variant={row.done ? 'success' : row.tone === 'warning' ? 'warning' : 'outline'}>{row.done ? '通过' : '待处理'}</Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.detail}</p>
        </div>
      ))}
    </div>
  )
}
