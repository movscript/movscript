import type { HTMLAttributes, ReactNode } from 'react'
import type { CanvasEntityKind } from '@/types'
import { cn } from '@/lib/utils'
import { Badge } from '@movscript/ui'
import { ENTITY_KIND_META } from './EntitySurface'

export interface SemanticEntityThumbCardProps extends HTMLAttributes<HTMLDivElement> {
  kind: CanvasEntityKind
  title: string
  description?: string
  status?: string
  meta?: ReactNode[]
  selected?: boolean
  draggable?: boolean
}

export function SemanticEntityThumbCard({
  kind,
  title,
  description,
  status,
  meta = [],
  selected,
  draggable,
  className,
  ...props
}: SemanticEntityThumbCardProps) {
  const cfg = ENTITY_KIND_META[kind]
  const Icon = cfg.icon

  return (
    <div
      draggable={draggable}
      className={cn(
        'group flex h-[150px] w-[236px] shrink-0 cursor-grab flex-col overflow-hidden rounded-lg border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md active:cursor-grabbing',
        selected ? 'border-primary ring-1 ring-primary/70' : 'border-border',
        className,
      )}
      title={title}
      {...props}
    >
      <div className={cn('border-b px-3 py-2.5', cfg.accentSoft)}>
        <div className="flex min-w-0 items-start gap-2">
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/85', cfg.activeColor)}>
            <Icon size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <Badge variant="outline" className="shrink-0 bg-background/70 type-tiny leading-none">
                {kindLabel(kind)}
              </Badge>
              {status ? (
                <span className="shrink-0 rounded border border-border bg-background/75 px-1.5 py-0.5 type-tiny leading-none text-muted-foreground">
                  {status}
                </span>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 min-h-9 type-body font-semibold leading-[18px] text-foreground">{title}</p>
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-3 py-2.5">
        <p className="line-clamp-2 min-h-9 type-caption leading-[18px] text-muted-foreground">
          {description || '暂无内容'}
        </p>
        <div className="mt-auto flex min-w-0 flex-wrap gap-1.5 pt-2">
          {meta.slice(0, 3).map((item, index) => (
            <span
              key={index}
              className="max-w-full truncate rounded border border-border bg-background px-1.5 py-0.5 type-tiny leading-none text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function kindLabel(kind: CanvasEntityKind) {
  if (kind === 'segment') return '编排段'
  if (kind === 'scene_moment') return '情景'
  if (kind === 'creative_reference') return '设定资料'
  if (kind === 'asset_slot') return '素材需求'
  if (kind === 'content_unit') return '制作项'
  return '剧本'
}
