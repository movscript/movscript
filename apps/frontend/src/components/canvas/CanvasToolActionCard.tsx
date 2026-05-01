import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  CheckCircle2,
  Circle,
  FileJson,
  Image,
  Loader2,
  MoreHorizontal,
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
export type CanvasToolSlotType = 'text' | 'prompt' | 'image' | 'video' | 'audio' | 'entity' | 'json'
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
  primaryAction?: CanvasToolAction
  secondaryAction?: CanvasToolAction
  footer?: ReactNode
  className?: string
  renderPortHandle?: CanvasToolPortHandleRenderer
}

const TOOL_TONE_META: Record<CanvasToolTone, {
  accentSoft: string
  activeColor: string
}> = {
  violet: { accentSoft: 'bg-violet-500/10', activeColor: 'text-violet-600' },
  cyan: { accentSoft: 'bg-cyan-500/10', activeColor: 'text-cyan-600' },
  amber: { accentSoft: 'bg-amber-500/10', activeColor: 'text-amber-600' },
  emerald: { accentSoft: 'bg-emerald-500/10', activeColor: 'text-emerald-600' },
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
  const visibleConfigs = configs.slice(0, 3)
  const visibleOutputs = outputs.slice(0, 2)
  const PrimaryIcon = primaryAction?.icon ?? Play
  const SecondaryIcon = secondaryAction?.icon

  return (
    <div
      className={cn(
        'relative w-[300px] overflow-visible rounded-lg border bg-card text-xs shadow-sm transition-all',
        selected ? 'border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/15' : 'border-border',
        className,
      )}
    >
      <PortDot side="left" tone="target" label="tool inputs" className="top-[38px]" />
      <PortDot side="right" tone="source" label="tool output" className="top-[38px]" />

      <header className={cn('border-b px-3 py-2.5', toneMeta.accentSoft)}>
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80">
            <Icon size={15} className={toneMeta.activeColor} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <SourceBadge source={source} />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-foreground">{title}</p>
              {status && (
                <span className="shrink-0 rounded border border-border bg-background/85 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                  {status}
                </span>
              )}
            </div>
            {subtitle && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
          <Button size="icon-xs" variant="ghost" className="h-6 w-6 shrink-0" aria-label="More">
            <MoreHorizontal size={13} />
          </Button>
        </div>
      </header>

      <div className="space-y-2 px-3 py-2.5">
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
      </div>

      <footer className="border-t border-border/70 px-3 py-2">
        <div className="flex items-center gap-2">
          {primaryAction && (
            <Button
              size="xs"
              className="h-7 flex-1 justify-center"
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
              size="xs"
              variant="outline"
              className="h-7 shrink-0"
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

function SourceBadge({ source }: { source: CanvasToolSource }) {
  return (
    <span className={cn(
      'shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none',
      source === 'ai'
        ? 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300'
        : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
    )}>
      {source === 'ai' ? 'AI' : '插件'}
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
      className="relative flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-1.5 text-[10px]"
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
      <Icon size={11} className={cn('shrink-0', isFailed ? 'text-destructive' : 'text-muted-foreground')} />
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
    <div className="flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-border bg-muted/25 px-1.5 text-[10px]">
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
        'relative flex h-[58px] min-w-0 flex-col rounded-md border text-left transition-colors',
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
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-t-md bg-muted/25">
        {isPending ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : <Icon size={15} className={cn(isFailed ? 'text-destructive' : 'text-muted-foreground/60')} />}
      </div>
      <div className="w-full border-t border-border/60 px-1.5 py-1">
        <div className="flex items-center gap-1">
          {isReady ? <CheckCircle2 size={10} className="shrink-0 text-emerald-600" /> : <Circle size={10} className="shrink-0 text-muted-foreground/60" />}
          <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-foreground">{slot.label}</span>
        </div>
        <p className={cn('mt-0.5 truncate text-[9px] text-muted-foreground', isFailed && 'text-destructive')}>
          {slot.summary ?? slotStateLabel(slot.state)}
        </p>
      </div>
    </button>
  )
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="flex h-7 items-center rounded-md border border-dashed border-border px-1.5 text-[10px] text-muted-foreground">
      {label}
    </div>
  )
}

function SectionTitle({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
      <Icon size={11} />
      <span>{label}</span>
    </div>
  )
}

function slotIcon(type: CanvasToolSlotType) {
  if (type === 'image') return Image
  if (type === 'video') return Video
  if (type === 'audio') return Video
  if (type === 'json') return FileJson
  if (type === 'entity') return Puzzle
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
      {handleId && handleType && renderPortHandle?.({ id: handleId, type: handleType, side, label })}
    </span>
  )
}
