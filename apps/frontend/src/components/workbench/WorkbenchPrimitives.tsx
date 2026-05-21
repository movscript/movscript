import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ImageIcon } from 'lucide-react'

import { semanticStatusClass, semanticStatusLabel, type SemanticTone, semanticToneClass } from '@/components/app/semantic'
import { cn } from '@/lib/utils'

export type WorkbenchDensity = 'compact' | 'normal'

export function WorkbenchSection({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('workbench-section', className)}>
      {(title || description || Icon || action) ? (
        <div className="workbench-section__header">
          <div className="flex min-w-0 items-start gap-2">
            {Icon ? <Icon size={15} className="mt-0.5 shrink-0 text-muted-foreground" /> : null}
            <div className="min-w-0">
              {title ? <h2 className="workbench-section__title">{title}</h2> : null}
              {description ? <p className="workbench-section__description">{description}</p> : null}
            </div>
          </div>
          {action ? <div className="workbench-section__action">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn('workbench-section__body', bodyClassName)}>{children}</div>
    </section>
  )
}

export function WorkbenchList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('workbench-list', className)} {...props}>
      {children}
    </div>
  )
}

export function WorkbenchListItem({
  active,
  density = 'normal',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
  density?: WorkbenchDensity
}) {
  return (
    <button
      type="button"
      data-active={active ? 'true' : undefined}
      data-density={density}
      className={cn('workbench-list-item', className)}
      {...props}
    >
      {children}
    </button>
  )
}

export function WorkbenchEntityCard({
  active,
  media,
  title,
  description,
  meta,
  status,
  action,
  className,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> & {
  active?: boolean
  media?: ReactNode
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode
  status?: ReactNode
  action?: ReactNode
}) {
  return (
    <button
      type="button"
      data-active={active ? 'true' : undefined}
      className={cn('workbench-entity-card', className)}
      {...props}
    >
      {media ? <div className="workbench-entity-card__media">{media}</div> : null}
      <div className="workbench-entity-card__content">
        <div className="workbench-entity-card__main">
          <p className="workbench-entity-card__title">{title}</p>
          {description ? <p className="workbench-entity-card__description">{description}</p> : null}
          {meta ? <div className="workbench-entity-card__meta">{meta}</div> : null}
        </div>
        {status || action ? (
          <div className="workbench-entity-card__aside">
            {status}
            {action}
          </div>
        ) : null}
      </div>
      {children}
    </button>
  )
}

export function WorkbenchThumbnail({
  children,
  icon: Icon = ImageIcon,
  label,
  fit = 'cover',
  ratio = 'default',
  className,
  ...props
}: {
  children?: ReactNode
  icon?: LucideIcon
  label?: ReactNode
  fit?: 'cover' | 'contain'
  ratio?: 'square' | 'wide' | 'banner' | 'default'
  className?: string
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-fit={fit} data-ratio={ratio} className={cn('workbench-thumbnail', className)} {...props}>
      {children ? (
        <div className="workbench-thumbnail__media">{children}</div>
      ) : (
        <div className="workbench-thumbnail__fallback">
          <Icon size={16} />
          {label ? <span>{label}</span> : null}
        </div>
      )}
    </div>
  )
}

export function WorkbenchStatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status?: string | null
  label?: ReactNode
  tone?: SemanticTone
  className?: string
}) {
  const badgeClass = tone ? semanticToneClass(tone, 'badge') : semanticStatusClass(status, 'badge')
  return <span className={cn('workbench-status-badge', badgeClass, className)}>{label ?? semanticStatusLabel(status)}</span>
}

export function WorkbenchMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'neutral',
  compact = false,
  className,
}: {
  icon?: LucideIcon
  label: ReactNode
  value: ReactNode
  detail?: ReactNode
  tone?: SemanticTone
  compact?: boolean
  className?: string
}) {
  return (
    <div className={cn('workbench-metric', compact && 'workbench-metric--compact', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="workbench-metric__label">{label}</p>
          <p className="workbench-metric__value">{value}</p>
        </div>
        {Icon ? (
          <span className="workbench-metric__icon">
            <Icon size={compact ? 14 : 16} className={semanticToneClass(tone, 'icon')} />
          </span>
        ) : null}
      </div>
      {detail ? <p className="workbench-metric__detail">{detail}</p> : null}
    </div>
  )
}

export function WorkbenchKeyValue({
  label,
  value,
  strong,
  className,
}: {
  label: ReactNode
  value?: ReactNode
  strong?: boolean
  className?: string
}) {
  return (
    <div className={cn('workbench-key-value', className)}>
      <p className="workbench-key-value__label">{label}</p>
      <p className={cn('workbench-key-value__value', strong && 'font-semibold')}>{value || '无'}</p>
    </div>
  )
}

export function WorkbenchEmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div className={cn('workbench-empty-state', compact && 'workbench-empty-state--compact', className)}>
      {Icon ? (
        <span className="workbench-empty-state__icon">
          <Icon size={compact ? 16 : 22} />
        </span>
      ) : null}
      <p className="workbench-empty-state__title">{title}</p>
      {description ? <p className="workbench-empty-state__description">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
