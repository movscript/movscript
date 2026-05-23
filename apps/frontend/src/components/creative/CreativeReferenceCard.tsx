import { Box, MapPin, Palette, Tag, UserRound } from 'lucide-react'

import { cn } from '@/lib/utils'
import { accentToneClass, Progress as ProgressBar, semanticToneClass, type AccentTone, type SemanticTone } from '@movscript/ui'

export type CreativeReferenceCardKind = 'person' | 'location' | 'object' | 'style' | 'product'
export type CreativeReferenceCardStatus =
  | 'locked'
  | 'review'
  | 'missing'
  | 'confirmed'
  | 'corrected'
  | 'draft'
  | 'ignored'
  | 'merged'
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

export const creativeReferenceKindMeta: Record<CreativeReferenceCardKind, { label: string; icon: typeof UserRound; tone: AccentTone }> = {
  person: { label: '人物', icon: UserRound, tone: 'sky' },
  location: { label: '地点', icon: MapPin, tone: 'teal' },
  object: { label: '道具', icon: Box, tone: 'amber' },
  style: { label: '风格', icon: Palette, tone: 'rose' },
  product: { label: '产品', icon: Tag, tone: 'violet' },
}

export const creativeReferenceStatusMeta: Record<CreativeReferenceCardStatus, { label: string; tone: SemanticTone }> = {
  locked: { label: '已锁定', tone: 'success' },
  confirmed: { label: '已确认', tone: 'success' },
  corrected: { label: '已修正', tone: 'info' },
  active: { label: '进行中', tone: 'info' },
  approved: { label: '已批准', tone: 'success' },
  review: { label: '待确认', tone: 'warning' },
  draft: { label: '草稿', tone: 'warning' },
  missing: { label: '待补设定', tone: 'danger' },
  ignored: { label: '已忽略', tone: 'neutral' },
  merged: { label: '已合并', tone: 'neutral' },
  rejected: { label: '已拒绝', tone: 'danger' },
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
  return accentToneClass(creativeReferenceKindMeta[kind].tone, 'gradient')
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
      <div className={cn('h-20 border-b border-border', reference.accent)}>
        <div className="flex h-full items-center justify-between px-4">
          <span className={cn('flex h-10 w-10 items-center justify-center rounded-md', accentToneClass(meta.tone, 'soft'))}>
            <Icon size={18} className={accentToneClass(meta.tone, 'icon')} />
          </span>
          <div className="text-right">
            <p className="type-label font-medium text-muted-foreground">{reference.version}</p>
            <p className="mt-1 type-caption text-muted-foreground">引用 {reference.usage}</p>
          </div>
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', accentToneClass(meta.tone, 'dot'))} />
              <p className="truncate type-body font-semibold text-foreground">{reference.title}</p>
            </div>
            <p className="mt-1 truncate type-label text-muted-foreground">{reference.subtitle}</p>
          </div>
          <span className={cn('shrink-0 rounded px-1.5 py-0.5 type-tiny font-medium', semanticToneClass(status.tone, 'badge'))}>{status.label}</span>
        </div>
        <p className="mt-2 line-clamp-2 min-h-9 type-label leading-relaxed text-muted-foreground">{reference.summary}</p>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between type-caption">
            <span className="text-muted-foreground">完整度</span>
            <span className="font-medium text-foreground">{reference.coverage}%</span>
          </div>
          <ProgressBar value={reference.coverage} className="h-1.5" />
        </div>
      </div>
    </Component>
  )
}
