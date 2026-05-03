import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Image,
  Link2,
  MoreHorizontal,
  Palette,
  Sparkles,
  Tag,
} from 'lucide-react'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'

export type SettingStateTone = 'neutral' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'

export type SettingStateToken = {
  id: string
  label: string
  value: string
  tone?: SettingStateTone
}

export type SettingStateBinding = {
  id: string
  label: string
  state: 'ready' | 'missing' | 'conflict'
  summary: string
}

export type SettingStateImpact = {
  id: string
  label: string
  value: string
  tone?: SettingStateTone
  icon?: LucideIcon
}

export interface CanvasSettingStateCardProps {
  title: string
  baseSetting: string
  scope: string
  status?: string
  selected?: boolean
  states: SettingStateToken[]
  bindings: SettingStateBinding[]
  impacts: SettingStateImpact[]
  className?: string
}

export function CanvasSettingStateCard({
  title,
  baseSetting,
  scope,
  status,
  selected,
  states,
  bindings,
  impacts,
  className,
}: CanvasSettingStateCardProps) {
  return (
    <div
      className={cn(
        'relative w-[310px] overflow-visible rounded-lg border bg-card text-xs shadow-sm transition-all',
        selected ? 'border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/15' : 'border-border',
        className,
      )}
    >
      <header className="border-b border-border bg-amber-500/10 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80">
            <Palette size={15} className="text-amber-600" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-amber-700 dark:text-amber-300">
                状态
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-foreground">{title}</p>
              {status && (
                <span className="shrink-0 rounded border border-border bg-background/85 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                  {status}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {baseSetting} · {scope}
            </p>
          </div>
          <Button size="icon-xs" variant="ghost" className="h-6 w-6 shrink-0" aria-label="More">
            <MoreHorizontal size={13} />
          </Button>
        </div>
      </header>

      <div className="space-y-2.5 px-3 py-2.5">
        <div>
          <SectionTitle icon={Tag} label="状态变量" />
          <div className="mt-1 flex flex-wrap gap-1.5">
            {states.slice(0, 6).map((state) => (
              <StateToken key={state.id} state={state} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_112px] gap-2">
          <div className="min-w-0">
            <SectionTitle icon={Image} label="表现素材" />
            <div className="mt-1 space-y-1">
              {bindings.slice(0, 3).map((binding) => (
                <BindingRow key={binding.id} binding={binding} />
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <SectionTitle icon={Sparkles} label="体验影响" />
            <div className="mt-1 space-y-1">
              {impacts.slice(0, 3).map((impact) => (
                <ImpactRow key={impact.id} impact={impact} />
              ))}
            </div>
          </div>
        </div>

        <div className="relative rounded-md border border-border bg-muted/20 px-2 py-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Link2 size={11} />
            <span className="min-w-0 flex-1 truncate">作为生成上下文注入到镜头、分镜、素材变体</span>
            <ArrowRight size={10} className="shrink-0" />
          </div>
        </div>
      </div>
    </div>
  )
}

function StateToken({ state }: { state: SettingStateToken }) {
  return (
    <span className={cn(
      'max-w-full rounded border px-1.5 py-1 text-[10px] leading-none',
      toneClass(state.tone ?? 'neutral'),
    )}>
      <span className="text-muted-foreground">{state.label}</span>
      <span className="ml-1 font-medium text-foreground">{state.value}</span>
    </span>
  )
}

function BindingRow({ binding }: { binding: SettingStateBinding }) {
  const Icon = binding.state === 'ready' ? CheckCircle2 : AlertTriangle
  return (
    <div className="relative flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-1.5 text-[10px]">
      <Icon size={11} className={cn(
        'shrink-0',
        binding.state === 'ready' && 'text-emerald-600',
        binding.state === 'missing' && 'text-muted-foreground',
        binding.state === 'conflict' && 'text-amber-600',
      )} />
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{binding.label}</span>
      <span className="max-w-[70px] truncate text-muted-foreground">{binding.summary}</span>
    </div>
  )
}

function ImpactRow({ impact }: { impact: SettingStateImpact }) {
  const Icon = impact.icon ?? Clock3
  return (
    <div className={cn('rounded-md border px-1.5 py-1', toneClass(impact.tone ?? 'neutral'))}>
      <div className="flex items-center gap-1 text-[10px]">
        <Icon size={10} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{impact.label}</span>
      </div>
      <p className="mt-0.5 truncate text-[10px] font-medium text-foreground">{impact.value}</p>
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

function toneClass(tone: SettingStateTone) {
  if (tone === 'emerald') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (tone === 'amber') return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (tone === 'rose') return 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300'
  if (tone === 'sky') return 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300'
  if (tone === 'violet') return 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300'
  return 'border-border bg-background text-muted-foreground'
}

function PortDot({
  side,
  tone,
  label,
  compact,
  className,
}: {
  side: 'left' | 'right'
  tone: 'target' | 'source' | 'neutral' | 'muted'
  label: string
  compact?: boolean
  className?: string
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
    />
  )
}
