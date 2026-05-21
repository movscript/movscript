import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  CheckCircle2,
  Circle,
  FileJson,
  Image,
  Loader2,
  Play,
  Puzzle,
  Settings2,
  Sparkles,
  Text,
  Video,
} from 'lucide-react'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'

export type CanvasToolSource = 'ai' | 'plugin'
export type CanvasToolTone = 'violet' | 'cyan' | 'amber' | 'emerald'
export type CanvasToolSlotType = 'text' | 'prompt' | 'image' | 'video' | 'json'
export type CanvasToolSlotState = 'empty' | 'ready' | 'pending' | 'failed'

export type CanvasToolSlot = {
  id: string
  label: string
  type: CanvasToolSlotType
  state: CanvasToolSlotState
  summary?: string
  inputPortId?: string
  outputPortId?: string
}

export type CanvasToolConfigItem = {
  id: string
  label: string
  value: string
}

export type CanvasToolAction = {
  id: string
  label: string
  icon?: LucideIcon
  onClick?: () => void
  disabled?: boolean
}

export type CanvasToolPortHandleRenderer = (handle: {
  id: string
  type: 'target' | 'source'
  side: 'left' | 'right'
  label: string
}) => ReactNode

export interface CanvasToolActionCardProps {
  source: CanvasToolSource
  tone?: CanvasToolTone
  icon?: LucideIcon
  title: string
  subtitle?: string
  status?: string
  selected?: boolean
  inputs?: CanvasToolSlot[]
  configs?: CanvasToolConfigItem[]
  outputs?: CanvasToolSlot[]
  inputPanel?: ReactNode
  resultPanel?: ReactNode
  primaryAction?: CanvasToolAction
  secondaryAction?: CanvasToolAction
  footer?: ReactNode
  className?: string
  renderPortHandle?: CanvasToolPortHandleRenderer
}

const TOOL_TONE_META: Record<CanvasToolTone, {
  accentSoft: string
  activeColor: string
  sourceBadge: string
}> = {
  violet: { accentSoft: 'bg-violet-500/10', activeColor: 'text-violet-600', sourceBadge: 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  cyan: { accentSoft: 'bg-cyan-500/10', activeColor: 'text-cyan-600', sourceBadge: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  amber: { accentSoft: 'bg-amber-500/10', activeColor: 'text-amber-600', sourceBadge: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  emerald: { accentSoft: 'bg-emerald-500/10', activeColor: 'text-emerald-600', sourceBadge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
}

export function CanvasToolActionCard({
  source,
  tone,
  icon,
  title,
  subtitle,
  status,
  selected,
  inputs = [],
  configs = [],
  outputs = [],
  inputPanel,
  resultPanel,
  primaryAction,
  secondaryAction,
  footer,
  className,
  renderPortHandle,
}: CanvasToolActionCardProps) {
  const resolvedTone = tone ?? (source === 'ai' ? 'violet' : 'cyan')
  const toneMeta = TOOL_TONE_META[resolvedTone]
  const Icon = icon ?? (source === 'ai' ? Sparkles : Puzzle)
  const visibleInputs = inputs.slice(0, 3)
  const visibleConfigs = configs.slice(0, 5)
  const visibleOutputs = outputs.slice(0, 2)
  const PrimaryIcon = primaryAction?.icon ?? Play
  const SecondaryIcon = secondaryAction?.icon

  return (
    <div
      className={cn(
        'relative w-[320px] overflow-visible rounded-xl border bg-background type-label shadow-sm transition-colors',
        selected ? 'border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/15' : 'border-border/80 hover:border-border',
        className,
      )}
    >
      <header className="px-3 pt-3 pb-2">
        <div className="flex items-start gap-2">
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', toneMeta.accentSoft)}>
            <Icon size={14} className={toneMeta.activeColor} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <SourceBadge source={source} className={toneMeta.sourceBadge} />
              <p className="min-w-0 flex-1 truncate type-body font-semibold leading-5 text-foreground">{title}</p>
              {status && (
                <StatusBadge label={status} />
              )}
            </div>
            {subtitle && <p className="mt-1 truncate type-caption text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </header>

      <div className="space-y-2 px-3 pb-3">
        <div>
          <SectionTitle icon={Text} label="输入" />
          <div className="mt-1 space-y-1">
            {visibleInputs.length > 0 ? visibleInputs.map((slot) => (
                <ToolSlotRow key={slot.id} slot={slot} direction="input" renderPortHandle={renderPortHandle} />
            )) : (
              <EmptyRow label="等待上游输入" />
            )}
          </div>
        </div>

        {inputPanel}

        <div className="grid grid-cols-[1fr_112px] gap-2">
          <div className="min-w-0">
            <SectionTitle icon={Settings2} label="配置" />
            <div className="mt-1 space-y-1">
              {visibleConfigs.length > 0 ? visibleConfigs.map((item) => (
                <ConfigPill key={item.id} item={item} />
              )) : (
                <EmptyRow label="默认参数" />
              )}
            </div>
          </div>

          <div className="min-w-0">
            <SectionTitle icon={Image} label="输出" />
            <div className="mt-1 grid grid-cols-2 gap-1">
              {visibleOutputs.length > 0 ? visibleOutputs.map((slot) => (
                <OutputTile key={slot.id} slot={slot} renderPortHandle={renderPortHandle} />
              )) : (
                <div className="col-span-2">
                  <EmptyRow label="未生成" />
                </div>
              )}
            </div>
          </div>
        </div>

        {resultPanel}
      </div>

      <footer className="border-t border-border/50 bg-muted/20 px-3 py-2.5">
        <div className="flex items-center gap-2">
          {primaryAction && (
            <Button
              size="sm"
              className="flex-1 justify-center rounded-full"
              disabled={primaryAction.disabled}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                primaryAction.onClick?.()
              }}
            >
              <PrimaryIcon size={12} />
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 rounded-full"
              disabled={secondaryAction.disabled}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                secondaryAction.onClick?.()
              }}
            >
              {SecondaryIcon && <SecondaryIcon size={12} />}
              {secondaryAction.label}
            </Button>
          )}
        </div>
        {footer && <div className="mt-2">{footer}</div>}
      </footer>
    </div>
  )
}

function SourceBadge({ source, className }: { source: CanvasToolSource; className?: string }) {
  return (
    <span className={cn(
      'shrink-0 rounded border px-1.5 py-0.5 type-micro font-semibold uppercase leading-none',
      className,
    )}>
      {source === 'ai' ? 'AI' : '插件'}
    </span>
  )
}

function StatusBadge({ label }: { label: string }) {
  const running = label.includes('运行') || label.includes('等待')
  const done = label.includes('完成') || label.includes('就绪')
  const failed = label.includes('失败')
  return (
    <span className={cn(
      'shrink-0 rounded-full px-1.5 py-0.5 type-tiny font-medium leading-none',
      done && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      running && !done && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      failed && 'bg-destructive/10 text-destructive',
      !running && !done && !failed && 'bg-muted text-muted-foreground',
    )}>
      {label}
    </span>
  )
}

function ToolSlotRow({
  slot,
  direction,
  renderPortHandle,
}: {
  slot: CanvasToolSlot
  direction: 'input' | 'output'
  renderPortHandle?: CanvasToolPortHandleRenderer
}) {
  const Icon = slotIcon(slot.type)
  const isReady = slot.state === 'ready'
  const isPending = slot.state === 'pending'
  const isFailed = slot.state === 'failed'

  return (
    <div
      data-input-port-id={direction === 'input' ? slot.inputPortId ?? `tool-in:${slot.id}` : undefined}
      data-output-port-id={direction === 'output' ? slot.outputPortId ?? `tool-out:${slot.id}` : undefined}
      className={cn(
        'relative flex h-7 min-w-0 items-center gap-1.5 rounded-lg border bg-background px-1.5 type-tiny',
        isFailed ? 'border-destructive/40 bg-destructive/5' : 'border-border/80',
      )}
    >
      {direction === 'input' && (
        <PortDot
          side="left"
          tone={isReady ? 'target' : 'neutral'}
          label="in"
          compact
          handleId={slot.inputPortId ?? `tool-in:${slot.id}`}
          handleType="target"
          renderPortHandle={renderPortHandle}
        />
      )}
      <Icon size={12} className={cn('shrink-0', isFailed ? 'text-destructive' : 'text-muted-foreground')} />
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{slot.label}</span>
      <span className={cn('max-w-[92px] truncate text-muted-foreground', isFailed && 'text-destructive')}>
        {slot.summary ?? slotStateLabel(slot.state)}
      </span>
      {isPending && <Loader2 size={10} className="shrink-0 animate-spin text-muted-foreground" />}
      {isReady && <CheckCircle2 size={10} className="shrink-0 text-emerald-600" />}
      {direction === 'output' && (
        <PortDot
          side="right"
          tone={isReady ? 'source' : 'muted'}
          label="out"
          compact
          handleId={slot.outputPortId ?? `tool-out:${slot.id}`}
          handleType="source"
          renderPortHandle={renderPortHandle}
        />
      )}
    </div>
  )
}

function ConfigPill({ item }: { item: CanvasToolConfigItem }) {
  return (
    <div className="flex h-7 min-w-0 items-center gap-1.5 rounded-lg border border-border/80 bg-muted/25 px-1.5 type-tiny">
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.label}</span>
      <span className="max-w-[86px] truncate font-medium text-foreground">{item.value}</span>
    </div>
  )
}

function OutputTile({ slot, renderPortHandle }: { slot: CanvasToolSlot; renderPortHandle?: CanvasToolPortHandleRenderer }) {
  const Icon = slotIcon(slot.type)
  const isReady = slot.state === 'ready'
  const isPending = slot.state === 'pending'
  const isFailed = slot.state === 'failed'

  return (
    <button
      type="button"
      data-output-port-id={slot.outputPortId ?? `tool-out:${slot.id}`}
      className={cn(
        'relative flex h-[58px] min-w-0 flex-col rounded-lg border text-left transition-colors',
        isReady ? 'border-border bg-background' : 'border-dashed border-border bg-muted/20 hover:bg-muted/40',
        isFailed && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <PortDot
        side="right"
        tone={isReady ? 'source' : isFailed ? 'muted' : 'neutral'}
        label="out"
        compact
        handleId={slot.outputPortId ?? `tool-out:${slot.id}`}
        handleType="source"
        renderPortHandle={renderPortHandle}
      />
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-t-lg bg-muted/25">
        {isPending ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : <Icon size={14} className={cn(isFailed ? 'text-destructive' : 'text-muted-foreground/60')} />}
      </div>
      <div className="w-full border-t border-border/60 px-1.5 py-1">
        <div className="flex items-center gap-1">
          {isReady ? <CheckCircle2 size={10} className="shrink-0 text-emerald-600" /> : <Circle size={10} className="shrink-0 text-muted-foreground/60" />}
          <span className="min-w-0 flex-1 truncate type-tiny font-medium text-foreground">{slot.label}</span>
        </div>
        <p className={cn('mt-0.5 truncate type-micro text-muted-foreground', isFailed && 'text-destructive')}>
          {slot.summary ?? slotStateLabel(slot.state)}
        </p>
      </div>
    </button>
  )
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="flex h-7 items-center rounded-lg border border-dashed border-border px-1.5 type-tiny text-muted-foreground">
      {label}
    </div>
  )
}

function SectionTitle({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-1.5 type-tiny font-medium text-muted-foreground">
      <Icon size={12} />
      <span>{label}</span>
    </div>
  )
}

function slotIcon(type: CanvasToolSlotType) {
  if (type === 'image') return Image
  if (type === 'video') return Video
  if (type === 'json') return FileJson
  return Text
}

function slotStateLabel(state: CanvasToolSlotState) {
  if (state === 'ready') return '已就绪'
  if (state === 'pending') return '处理中'
  if (state === 'failed') return '失败'
  return '未绑定'
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
  renderPortHandle?: CanvasToolPortHandleRenderer
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
