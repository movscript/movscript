import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  CheckCircle2,
  Circle,
  Loader2,
  MoreHorizontal,
  Play,
} from 'lucide-react'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'

export type CanvasIOTone = 'sky' | 'emerald' | 'amber'
export type CanvasIOState = 'empty' | 'ready' | 'pending' | 'failed'

export type CanvasIOPort = {
  id: string
  label: string
  type: 'target' | 'source'
  side: 'left' | 'right'
  dataType: string
  required?: boolean
}

export type CanvasIOMetaItem = {
  id: string
  label: string
  value: string
}

export type CanvasIOAction = {
  id: string
  label: string
  icon?: LucideIcon
  onClick?: () => void
  disabled?: boolean
}

export type CanvasIOPortHandleRenderer = (handle: {
  id: string
  type: 'target' | 'source'
  side: 'left' | 'right'
  label: string
}) => ReactNode

export interface CanvasIOActionCardProps {
  tone: CanvasIOTone
  icon: LucideIcon
  title: string
  subtitle?: string
  status?: string
  selected?: boolean
  port: CanvasIOPort
  metaItems?: CanvasIOMetaItem[]
  state: CanvasIOState
  stateLabel: string
  bodyLabel: string
  bodyValue?: string
  emptyLabel?: string
  primaryAction?: CanvasIOAction
  footer?: ReactNode
  className?: string
  renderPortHandle?: CanvasIOPortHandleRenderer
}

const IO_TONE_META: Record<CanvasIOTone, {
  accentSoft: string
  activeColor: string
  badgeClass: string
}> = {
  sky: {
    accentSoft: 'bg-sky-500/10',
    activeColor: 'text-sky-600',
    badgeClass: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  emerald: {
    accentSoft: 'bg-emerald-500/10',
    activeColor: 'text-emerald-600',
    badgeClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  amber: {
    accentSoft: 'bg-amber-500/10',
    activeColor: 'text-amber-600',
    badgeClass: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
}

export function CanvasIOActionCard({
  tone,
  icon,
  title,
  subtitle,
  status,
  selected,
  port,
  metaItems = [],
  state,
  stateLabel,
  bodyLabel,
  bodyValue,
  emptyLabel,
  primaryAction,
  footer,
  className,
  renderPortHandle,
}: CanvasIOActionCardProps) {
  const toneMeta = IO_TONE_META[tone]
  const Icon = icon
  const PrimaryIcon = primaryAction?.icon ?? Play
  const isReady = state === 'ready'
  const isPending = state === 'pending'
  const isFailed = state === 'failed'

  return (
    <div
      className={cn(
        'relative w-[260px] overflow-visible rounded-lg border bg-card type-label shadow-sm transition-all',
        selected ? 'border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/15' : 'border-border',
        className,
      )}
    >
      <header className={cn('border-b px-3 py-2.5', toneMeta.accentSoft)}>
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80">
            <Icon size={14} className={toneMeta.activeColor} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={cn('shrink-0 rounded border px-1.5 py-0.5 type-micro font-semibold uppercase leading-none', toneMeta.badgeClass)}>
                {port.type === 'source' ? 'INPUT' : 'OUTPUT'}
              </span>
              <p className="min-w-0 flex-1 truncate type-body font-semibold leading-5 text-foreground">{title}</p>
              {status && (
                <span className="shrink-0 rounded border border-border bg-background/85 px-1.5 py-0.5 type-tiny leading-none text-muted-foreground">
                  {status}
                </span>
              )}
            </div>
            {subtitle && <p className="mt-0.5 truncate type-caption text-muted-foreground">{subtitle}</p>}
          </div>
          <Button size="icon-xs" variant="ghost" className="shrink-0" aria-label="More">
            <MoreHorizontal size={14} />
          </Button>
        </div>
      </header>

      <div className="space-y-2 px-3 py-2.5">
        <div>
          <div className="flex items-center gap-1.5 type-tiny font-medium text-muted-foreground">
            <Icon size={12} />
            <span>{bodyLabel}</span>
          </div>
          <div
            data-input-port-id={port.type === 'target' ? port.id : undefined}
            data-output-port-id={port.type === 'source' ? port.id : undefined}
            className="relative mt-1 flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 type-tiny"
          >
            <PortDot
              side={port.side}
              tone={port.type === 'source' ? (isReady ? 'source' : 'neutral') : (isReady ? 'target' : 'neutral')}
              label={port.label}
              compact
              handleId={port.id}
              handleType={port.type}
              renderPortHandle={renderPortHandle}
            />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{port.label}</span>
            {port.required && <span className="shrink-0 rounded-sm bg-destructive/10 px-1 py-0.5 leading-none text-destructive">*</span>}
            <span className="shrink-0 rounded border border-border bg-muted/40 px-1 py-0.5 leading-none text-muted-foreground">{port.dataType}</span>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_94px] gap-2">
          <div className="min-w-0 space-y-1">
            {metaItems.length > 0 ? metaItems.slice(0, 2).map((item) => (
              <MetaPill key={item.id} item={item} />
            )) : (
              <EmptyRow label={emptyLabel ?? stateLabel} />
            )}
          </div>
          <StateTile state={state} label={stateLabel} />
        </div>

        <div className={cn(
          'min-h-12 rounded-md border px-2 py-1.5 type-tiny',
          bodyValue ? 'border-border bg-muted/20 text-foreground' : 'border-dashed border-border bg-muted/10 text-muted-foreground',
          isFailed && 'border-destructive/40 bg-destructive/5 text-destructive',
        )}>
          {bodyValue ? (
            <p className="line-clamp-3 whitespace-pre-wrap break-words">{bodyValue}</p>
          ) : (
            <p className="italic">{emptyLabel ?? stateLabel}</p>
          )}
        </div>
      </div>

      {(primaryAction || footer) && (
        <footer className="border-t border-border/70 px-3 py-2">
          {primaryAction && (
            <Button
              size="sm"
              className="w-full justify-center"
              disabled={primaryAction.disabled}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                primaryAction.onClick?.()
              }}
            >
              <PrimaryIcon size={12} className={cn(isPending && 'animate-spin')} />
              {primaryAction.label}
            </Button>
          )}
          {footer && <div className={primaryAction ? 'mt-2' : undefined}>{footer}</div>}
        </footer>
      )}
    </div>
  )
}

function MetaPill({ item }: { item: CanvasIOMetaItem }) {
  return (
    <div className="flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-border bg-muted/25 px-1.5 type-tiny">
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.label}</span>
      <span className="max-w-[82px] truncate font-medium text-foreground">{item.value}</span>
    </div>
  )
}

function StateTile({ state, label }: { state: CanvasIOState; label: string }) {
  const isReady = state === 'ready'
  const isPending = state === 'pending'
  const isFailed = state === 'failed'

  return (
    <div className={cn(
      'flex h-[58px] min-w-0 flex-col rounded-md border text-left',
      isReady ? 'border-border bg-background' : 'border-dashed border-border bg-muted/20',
      isFailed && 'border-destructive/40 bg-destructive/5',
    )}>
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-t-md bg-muted/25">
        {isPending ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : isReady ? (
          <CheckCircle2 size={14} className="text-emerald-600" />
        ) : (
          <Circle size={14} className={cn(isFailed ? 'text-destructive' : 'text-muted-foreground/60')} />
        )}
      </div>
      <div className="border-t border-border/60 px-1.5 py-1">
        <p className={cn('truncate type-tiny font-medium', isFailed ? 'text-destructive' : 'text-foreground')}>{label}</p>
      </div>
    </div>
  )
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="flex h-7 items-center rounded-md border border-dashed border-border px-1.5 type-tiny text-muted-foreground">
      {label}
    </div>
  )
}

function PortDot({
  side,
  tone,
  label,
  compact,
  className,
  handleId,
  handleType,
  renderPortHandle,
}: {
  side: 'left' | 'right'
  tone: 'target' | 'source' | 'neutral' | 'muted'
  label: string
  compact?: boolean
  className?: string
  handleId?: string
  handleType?: 'target' | 'source'
  renderPortHandle?: CanvasIOPortHandleRenderer
}) {
  if (!handleId || !handleType || !renderPortHandle) return null
  return (
    <span
      title={label}
      className={cn(
        'absolute z-20 -translate-y-1/2 rounded-full border-2 bg-card shadow-sm',
        compact ? 'top-1/2 h-3 w-3' : 'h-3.5 w-3.5',
        side === 'left' ? '-left-1.5' : '-right-1.5',
        tone === 'target' && 'border-sky-500 bg-sky-500/90',
        tone === 'source' && 'border-primary bg-primary/90',
        tone === 'neutral' && 'border-border bg-card',
        tone === 'muted' && 'border-border bg-muted',
        className,
      )}
      aria-hidden="true"
    >
      {renderPortHandle({ id: handleId, type: handleType, side, label })}
    </span>
  )
}
