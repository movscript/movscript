import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Image,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  Video,
} from 'lucide-react'
import { Button } from '@movscript/ui'
import type { CanvasEntityKind } from '@/types'
import { cn } from '@/lib/utils'
import { ENTITY_KIND_META } from '@/components/entity/EntitySurface'

export type CanvasEntityBindingSlot = {
  id: string
  label: string
  kind: 'image' | 'video' | 'resource'
  state: 'empty' | 'bound' | 'pending'
  resourceLabel?: string
  thumbnailUrl?: string
  inputPortId?: string
  outputPortId?: string
}

export type CanvasEntityRelation = {
  id: string
  label: string
  targetLabel: string
  direction?: 'outgoing' | 'incoming'
  inputPortId?: string
  outputPortId?: string
}

export type CanvasEntityCreateAction = {
  id: string
  label: string
  icon?: LucideIcon
  outputPortId?: string
}

export type CanvasEntityPortHandleRenderer = (handle: {
  id: string
  type: 'target' | 'source'
  side: 'left' | 'right'
  label: string
}) => ReactNode

export interface CanvasEntityActionCardProps {
  kind: CanvasEntityKind
  title: string
  subtitle?: string
  status?: string
  selected?: boolean
  bindings?: CanvasEntityBindingSlot[]
  relations?: CanvasEntityRelation[]
  createActions?: CanvasEntityCreateAction[]
  footer?: ReactNode
  className?: string
  renderPortHandle?: CanvasEntityPortHandleRenderer
  renderCreateActionPorts?: boolean
}

export function CanvasEntityActionCard({
  kind,
  title,
  subtitle,
  status,
  selected,
  bindings = [],
  relations = [],
  createActions = [],
  footer,
  className,
  renderPortHandle,
  renderCreateActionPorts = false,
}: CanvasEntityActionCardProps) {
  const cfg = ENTITY_KIND_META[kind]
  const Icon = cfg.icon
  const visibleBindings = bindings.slice(0, 3)
  const visibleRelations = relations.slice(0, 2)
  const visibleActions = createActions.slice(0, 2)

  return (
    <div
      className={cn(
        'relative w-[280px] overflow-visible rounded-lg border bg-card type-label shadow-sm transition-all',
        selected ? 'border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/15' : 'border-border',
        className,
      )}
    >
      <header className={cn('border-b px-3 py-2.5', cfg.accentSoft)}>
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80">
            <Icon size={15} className={cfg.activeColor} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
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
            <MoreHorizontal size={13} />
          </Button>
        </div>
      </header>

      <div className="space-y-2 px-3 py-2.5">
        <SectionTitle icon={Image} label="绑定" />
        <div className="grid grid-cols-3 gap-1.5">
          {visibleBindings.map((slot) => (
            <BindingSlot key={slot.id} slot={slot} renderPortHandle={renderPortHandle} />
          ))}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="min-w-0">
            <SectionTitle icon={Link2} label="关联" />
            <div className="mt-1 space-y-1">
              {visibleRelations.length > 0 ? visibleRelations.map((relation) => (
                <RelationRow key={relation.id} relation={relation} renderPortHandle={renderPortHandle} />
              )) : (
                <EmptyRow label="拖拽连接实体" />
              )}
            </div>
          </div>

          <div className="w-[92px]">
            <SectionTitle icon={Plus} label="创建" />
            <div className="mt-1 space-y-1">
              {visibleActions.map((action) => {
                const ActionIcon = action.icon ?? Plus
                return (
                  <button
                    key={action.id}
                    type="button"
                    data-port-id={action.outputPortId ?? `create:${action.id}`}
                    className="relative flex h-7 w-full items-center gap-1 rounded-md border border-border bg-background px-1.5 type-tiny text-foreground hover:bg-muted/60"
                  >
                    <ActionIcon size={11} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-left">{action.label}</span>
                    <PortDot
                      side="right"
                      tone="source"
                      label="out"
                      compact
                      handleId={renderCreateActionPorts ? action.outputPortId ?? `create:${action.id}` : undefined}
                      handleType={renderCreateActionPorts ? 'source' : undefined}
                      renderPortHandle={renderPortHandle}
                    />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {footer && <footer className="border-t border-border/70 px-3 py-2">{footer}</footer>}
    </div>
  )
}

function BindingSlot({
  slot,
  renderPortHandle,
}: {
  slot: CanvasEntityBindingSlot
  renderPortHandle?: CanvasEntityPortHandleRenderer
}) {
  const Icon = slot.kind === 'video' ? Video : Image
  const isBound = slot.state === 'bound'
  const isPending = slot.state === 'pending'

  return (
    <button
      type="button"
      data-input-port-id={slot.inputPortId ?? `bind:${slot.id}`}
      data-output-port-id={slot.outputPortId ?? `read:${slot.id}`}
      className={cn(
        'group relative flex h-[70px] min-w-0 flex-col rounded-md border text-left transition-colors',
        isBound ? 'border-border bg-background' : 'border-dashed border-border bg-muted/20 hover:bg-muted/40',
      )}
    >
      <PortDot
        side="left"
        tone="target"
        label="in"
        compact
        handleId={slot.inputPortId ?? `bind:${slot.id}`}
        handleType="target"
        renderPortHandle={renderPortHandle}
      />
      <PortDot
        side="right"
        tone={isBound ? 'source' : 'muted'}
        label="out"
        compact
        handleId={slot.outputPortId ?? `read:${slot.id}`}
        handleType="source"
        renderPortHandle={renderPortHandle}
      />
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-t-md bg-muted/25">
        {slot.thumbnailUrl ? (
          <img src={slot.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : isPending ? (
          <Loader2 size={15} className="animate-spin text-muted-foreground" />
        ) : (
          <Icon size={16} className="text-muted-foreground/55" />
        )}
      </div>
      <div className="w-full border-t border-border/60 px-1.5 py-1">
        <div className="flex items-center gap-1">
          {isBound ? <CheckCircle2 size={10} className="shrink-0 text-emerald-600" /> : <Circle size={10} className="shrink-0 text-muted-foreground/60" />}
          <span className="min-w-0 flex-1 truncate type-tiny font-medium text-foreground">{slot.label}</span>
        </div>
        <p className="mt-0.5 truncate type-micro text-muted-foreground">
          {slot.resourceLabel ?? (isPending ? '生成中' : '可绑定')}
        </p>
      </div>
    </button>
  )
}

function RelationRow({
  relation,
  renderPortHandle,
}: {
  relation: CanvasEntityRelation
  renderPortHandle?: CanvasEntityPortHandleRenderer
}) {
  return (
    <div
      data-input-port-id={relation.inputPortId ?? `relation-in:${relation.id}`}
      data-output-port-id={relation.outputPortId ?? `relation-out:${relation.id}`}
      className="relative flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-1.5 type-tiny"
    >
      <PortDot
        side="left"
        tone={relation.direction === 'incoming' ? 'target' : 'neutral'}
        label="in"
        compact
        handleId={relation.inputPortId ?? `relation-in:${relation.id}`}
        handleType="target"
        renderPortHandle={renderPortHandle}
      />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{relation.label}</span>
      <ArrowRight size={10} className={cn('shrink-0 text-muted-foreground', relation.direction === 'incoming' && 'rotate-180')} />
      <span className="max-w-[82px] truncate font-medium text-foreground">{relation.targetLabel}</span>
      <PortDot
        side="right"
        tone={relation.direction === 'incoming' ? 'neutral' : 'source'}
        label="out"
        compact
        handleId={relation.outputPortId ?? `relation-out:${relation.id}`}
        handleType="source"
        renderPortHandle={renderPortHandle}
      />
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

function SectionTitle({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-1.5 type-tiny font-medium text-muted-foreground">
      <Icon size={11} />
      <span>{label}</span>
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
  renderPortHandle?: CanvasEntityPortHandleRenderer
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
