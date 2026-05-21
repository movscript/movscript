import { type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, CheckCircle2, ChevronRight, CircleDot, ListChecks, RefreshCw } from 'lucide-react'

import { decisionVariant, priorityLabel, statusLabel, statusVariant } from '@/lib/contentWorkbenchStatus'
import { cn } from '@/lib/utils'
import { useWorkbenchCanvasLauncher, type CanvasWorkbenchKind } from '@/lib/useWorkbenchCanvasLauncher'
import type {
  WorkbenchDecisionRow,
  WorkbenchQueueItem,
  WorkbenchScenarioPriority,
  WorkbenchScenarioStatus,
} from '@/lib/workbenchScenarios'
import {
  getProjectWorkbenchDefinition,
  type ProjectWorkbenchId,
} from '@/pages/project/projectSurfaces'
import { Badge, Button, Card, Progress, ScrollArea } from '@movscript/ui'
import { WorkbenchPanel } from './WorkbenchPanel'
import {
  WorkbenchKeyValue,
  WorkbenchList,
  WorkbenchListItem,
  WorkbenchMetric as WorkbenchPrimitiveMetric,
  WorkbenchStatusBadge,
} from './WorkbenchPrimitives'

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

export interface ProjectWorkbenchHeaderProps {
  workbenchId: ProjectWorkbenchId
  projectName?: string
  kicker?: string
  title?: string
  description?: string
  badges?: ReactNode
  headerBody?: ReactNode
  actions?: ReactNode
  onRefresh?: () => void
  refreshing?: boolean
  refreshLabel?: string
  generationKind?: CanvasWorkbenchKind
}

export function ProjectWorkbenchHeader({
  workbenchId,
  projectName,
  kicker,
  title,
  description,
  badges,
  headerBody,
  actions,
  onRefresh,
  refreshing = false,
  refreshLabel = '刷新上下文',
  generationKind,
}: ProjectWorkbenchHeaderProps) {
  const workbench = getProjectWorkbenchDefinition(workbenchId)
  const Icon = workbench.icon
  const generation = useWorkbenchCanvasLauncher(generationKind)

  return (
    <header data-testid="project-workbench-header" className="shrink-0 border-b border-border bg-background px-5 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            {kicker || projectName ? (
              <p className="mb-0.5 truncate type-caption font-medium text-muted-foreground">{kicker || projectName}</p>
            ) : null}
            <h1 className="truncate type-title-sm font-semibold text-foreground">{title || workbench.title}</h1>
            <p className="mt-1 max-w-4xl truncate type-label text-muted-foreground">{description || workbench.purpose}</p>
            {badges ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{badges}</div> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {onRefresh ? (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} />
              {refreshLabel}
            </Button>
          ) : null}
          {actions}
          {generationKind ? (
            <Button size="sm" disabled={generation.disabled} loading={generation.loading} onClick={generation.open}>
              <ArrowRight size={14} />
              {generation.label}
            </Button>
          ) : null}
        </div>
      </div>
      {headerBody ? <div className="mt-3 border-t border-border pt-3">{headerBody}</div> : null}
    </header>
  )
}

export function ProjectWorkbenchShell({
  children,
  className,
  ...headerProps
}: ProjectWorkbenchHeaderProps & {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      data-testid="project-workbench-shell"
      data-workbench-id={headerProps.workbenchId}
      className={cn('flex h-full min-h-0 flex-col overflow-hidden bg-background', className)}
    >
      <ProjectWorkbenchHeader {...headerProps} />
      {children}
    </div>
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
        <h2 className="type-body font-semibold text-foreground">待处理队列</h2>
        <Badge variant="secondary">{items.length}</Badge>
      </div>
      <WorkbenchList>
        {items.map((item) => (
          <WorkbenchListItem
            key={item.id}
            onClick={() => onSelect(item.id)}
            active={selectedId === item.id}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate type-body font-medium text-foreground">{item.title}</span>
              <WorkbenchStatusBadge tone={statusTone(item.status)} label={statusLabel(item.status)} />
            </div>
            <p className="mt-1 truncate type-label text-muted-foreground">{item.subtitle}</p>
            <div className="mt-3 flex items-center gap-2">
              <Badge variant={item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'outline'} className="shrink-0">
                {priorityLabel(item.priority)}
              </Badge>
              <Progress value={item.progress} className="h-1.5" />
            </div>
          </WorkbenchListItem>
        ))}
      </WorkbenchList>
    </Card>
  )
}

export function InfoPanel({ title, rows, icon: Icon }: { title: string; rows: string[]; icon: LucideIcon }) {
  return (
    <Card className="rounded-lg border-border bg-card p-4">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon size={16} />
        </span>
        <h2 className="type-body font-semibold text-foreground">{title}</h2>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row} className="rounded-md border border-border bg-background px-3 py-2 type-body leading-6 text-foreground">
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
      <h2 className="type-body font-semibold text-foreground">{title}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={`${row.label}:${row.value}`} className="rounded-md border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="type-label text-muted-foreground">{row.label}</p>
              <Badge variant={decisionVariant(row.tone)}>{row.tone === 'warning' ? '需处理' : row.tone === 'success' ? '可用' : '信息'}</Badge>
            </div>
            <p className="mt-2 type-body font-medium leading-6 text-foreground">{row.value}</p>
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
        <h3 className="mb-2 type-label font-semibold uppercase text-muted-foreground">可执行动作</h3>
        <div className="space-y-2">
          {actions.map((action, index) => (
            <button
              key={action}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left type-body transition-colors',
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
        <h3 className="mb-2 type-label font-semibold uppercase text-muted-foreground">{outputTitle}</h3>
        <div className="space-y-2">
          {outputs.map((row) => (
            <div key={`${row.label}:${row.value}`} className="rounded-md border border-border bg-background px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="type-label text-muted-foreground">{row.label}</p>
                <Badge variant={decisionVariant(row.tone)}>{row.tone === 'success' ? '输出' : '记录'}</Badge>
              </div>
              <p className="mt-1 type-body leading-5 text-foreground">{row.value}</p>
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
        return (
          <WorkbenchPrimitiveMetric
            key={metric.label}
            icon={metric.icon}
            label={(
              <span className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate">{metric.label}</span>
                <WorkbenchStatusBadge tone={statusTone(metric.status)} label={statusLabel(metric.status)} />
              </span>
            )}
            value={metric.value}
            detail={metric.detail}
            tone={statusTone(metric.status)}
          />
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
        <WorkbenchList className="pr-2">
          {items.map((item) => (
            <WorkbenchListItem
              key={item.id}
              onClick={() => onSelect(item.id)}
              active={selectedId === item.id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate type-body font-medium text-foreground">{item.title}</span>
                <WorkbenchStatusBadge tone={statusTone(item.status)} label={statusLabel(item.status)} />
              </div>
              <p className="mt-1 truncate type-label text-muted-foreground">{item.scope}</p>
              {item.need ? <p className="mt-2 line-clamp-2 type-label leading-5 text-muted-foreground">{item.need}</p> : null}
              <div className="mt-3 flex items-center gap-2">
                <Badge variant={item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'outline'}>{priorityLabel(item.priority)}</Badge>
                <Progress value={item.progress} className="h-1.5" />
              </div>
            </WorkbenchListItem>
          ))}
        </WorkbenchList>
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
      <p className="type-tiny text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 type-body font-semibold tabular-nums', tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground')}>{value}</p>
    </>
  )
  if (onClick) {
    return (
      <WorkbenchListItem
        type="button"
        onClick={onClick}
        density="compact"
        className="min-w-14"
      >
        {content}
      </WorkbenchListItem>
    )
  }
  return <WorkbenchKeyValue label={label} value={value} className="min-w-14 px-2 py-1.5" />
}

export function ContextStack({ rows, className }: { rows: WorkbenchLinkRow[]; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-md border border-border bg-background', className)}>
      {rows.map((row) => {
        const Icon = row.icon
        return (
          <div key={row.label} className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 border-b border-border/70 px-2.5 py-2 last:border-b-0">
            <div className="flex min-w-0 items-center gap-2 type-label text-muted-foreground">
              <Icon size={14} className="shrink-0" />
              <span className="truncate">{row.label}</span>
            </div>
            <p className="min-w-0 truncate type-body text-foreground">{row.value}</p>
          </div>
        )
      })}
    </div>
  )
}

export function GateChecklist({ rows }: { rows: WorkbenchGate[] }) {
  return (
    <WorkbenchList className="gap-1.5">
      {rows.map((row) => (
        <div key={row.label} className="workbench-list-item px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {row.done ? <CheckCircle2 size={14} className="shrink-0 text-emerald-600" /> : <CircleDot size={14} className="shrink-0 text-amber-600" />}
              <span className="truncate type-body font-medium text-foreground">{row.label}</span>
            </div>
            <WorkbenchStatusBadge tone={row.done ? 'success' : row.tone === 'warning' ? 'warning' : 'neutral'} label={row.done ? '通过' : '待处理'} />
          </div>
          <p className="mt-1 type-label leading-5 text-muted-foreground">{row.detail}</p>
        </div>
      ))}
    </WorkbenchList>
  )
}

function statusTone(status: WorkbenchScenarioStatus) {
  if (status === 'blocked') return 'warning'
  if (status === 'ready') return 'success'
  if (status === 'running') return 'info'
  return 'neutral'
}
