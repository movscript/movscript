import { Box, MapPin, Palette, Tag, UserRound } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Progress as ProgressBar } from '@movscript/ui'

export type CreativeReferenceCardKind = 'person' | 'location' | 'object' | 'style' | 'product'
export type CreativeReferenceCardStatus =
  | 'locked'
  | 'review'
  | 'missing'
  | 'confirmed'
  | 'corrected'
  | 'draft'
  | 'ignored'
  | 'active'
  | 'approved'
  | 'rejected'

export interface CreativeReferenceCardData {
  id: string | number
  kind: CreativeReferenceCardKind
  title: string
  subtitle: string
  status: CreativeReferenceCardStatus
  version: string
  usage: number
  coverage: number
  summary: string
  accent: string
}

export const creativeReferenceKindMeta: Record<CreativeReferenceCardKind, { label: string; icon: typeof UserRound; dot: string; bg: string; text: string }> = {
  person: { label: '人物', icon: UserRound, dot: 'bg-sky-500', bg: 'bg-sky-500/10', text: 'text-sky-700 dark:text-sky-300' },
  location: { label: '地点', icon: MapPin, dot: 'bg-teal-500', bg: 'bg-teal-500/10', text: 'text-teal-700 dark:text-teal-300' },
  object: { label: '道具', icon: Box, dot: 'bg-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300' },
  style: { label: '风格', icon: Palette, dot: 'bg-rose-500', bg: 'bg-rose-500/10', text: 'text-rose-700 dark:text-rose-300' },
  product: { label: '产品', icon: Tag, dot: 'bg-violet-500', bg: 'bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300' },
}

export const creativeReferenceStatusMeta: Record<CreativeReferenceCardStatus, { label: string; className: string }> = {
  locked: { label: '已锁定', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  confirmed: { label: '已确认', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  corrected: { label: '已修正', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  active: { label: '进行中', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  approved: { label: '已批准', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  review: { label: '待确认', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  draft: { label: '草稿', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  missing: { label: '待补设定', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  ignored: { label: '已忽略', className: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300' },
  rejected: { label: '已拒绝', className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
}

export function normalizeCreativeReferenceKind(kind?: string): CreativeReferenceCardKind {
  const normalized = String(kind ?? '').toLowerCase()
  if (['person', 'character', '人物', '角色'].includes(normalized)) return 'person'
  if (['location', 'place', '地点', '场景'].includes(normalized)) return 'location'
  if (['object', 'prop', '道具'].includes(normalized)) return 'object'
  if (['style', 'rule', 'world_rule', 'restriction', 'time_period', '风格', '规则'].includes(normalized)) return 'style'
  if (['product', 'brand', '产品', '品牌'].includes(normalized)) return 'product'
  return 'object'
}

export function normalizeCreativeReferenceStatus(status?: string): CreativeReferenceCardStatus {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized in creativeReferenceStatusMeta) return normalized as CreativeReferenceCardStatus
  return 'draft'
}

export function accentForCreativeReferenceKind(kind: CreativeReferenceCardKind) {
  switch (kind) {
    case 'person':
      return 'from-sky-500/20 to-cyan-500/10'
    case 'location':
      return 'from-teal-500/20 to-emerald-500/10'
    case 'object':
      return 'from-amber-500/20 to-yellow-500/10'
    case 'style':
      return 'from-rose-500/20 to-fuchsia-500/10'
    case 'product':
      return 'from-violet-500/20 to-purple-500/10'
  }
}

export function CreativeReferenceCard({
  reference,
  selected = false,
  onSelect,
  className,
}: {
  reference: CreativeReferenceCardData
  selected?: boolean
  onSelect?: () => void
  className?: string
}) {
  const meta = creativeReferenceKindMeta[reference.kind]
  const status = creativeReferenceStatusMeta[reference.status] ?? creativeReferenceStatusMeta.draft
  const Icon = meta.icon
  const Component = onSelect ? 'button' : 'div'

  return (
    <Component
      type={onSelect ? 'button' : undefined}
      onClick={onSelect}
      className={cn(
        'block w-full overflow-hidden rounded-lg border bg-background text-left transition-all hover:border-primary/50 hover:shadow-sm',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
        className,
      )}
    >
      <div className={cn('h-20 border-b border-border bg-gradient-to-br', reference.accent)}>
        <div className="flex h-full items-center justify-between px-4">
          <span className={cn('flex h-10 w-10 items-center justify-center rounded-md', meta.bg)}>
            <Icon size={19} className={meta.text} />
          </span>
          <div className="text-right">
            <p className="text-xs font-medium text-muted-foreground">{reference.version}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">引用 {reference.usage}</p>
          </div>
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', meta.dot)} />
              <p className="truncate text-sm font-semibold text-foreground">{reference.title}</p>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{reference.subtitle}</p>
          </div>
          <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', status.className)}>{status.label}</span>
        </div>
        <p className="mt-2 line-clamp-2 min-h-9 text-xs leading-relaxed text-muted-foreground">{reference.summary}</p>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">完整度</span>
            <span className="font-medium text-foreground">{reference.coverage}%</span>
          </div>
          <ProgressBar value={reference.coverage} className="h-1.5" />
        </div>
      </div>
    </Component>
  )
}
