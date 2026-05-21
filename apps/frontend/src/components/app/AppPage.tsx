import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { semanticToneClass, type SemanticTone } from './semantic'

export function AppPage({
  children,
  className,
  width = 'wide',
}: {
  children: ReactNode
  className?: string
  width?: 'normal' | 'wide' | 'full'
}) {
  return (
    <div className={cn('app-page h-full overflow-auto', className)}>
      <div
        className={cn(
          'mx-auto min-h-full space-y-4 p-5',
          width === 'normal' && 'max-w-5xl',
          width === 'wide' && 'max-w-7xl',
          width === 'full' && 'max-w-none',
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function AppPageHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  icon?: LucideIcon
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  meta?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('app-page-header', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="app-page-header__icon">
            <Icon size={18} />
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <div className="app-page-header__eyebrow">{eyebrow}</div> : null}
          <h1 className="app-page-header__title">{title}</h1>
          {description ? <p className="app-page-header__description">{description}</p> : null}
          {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="app-page-header__actions">{actions}</div> : null}
    </header>
  )
}

export function ProjectSurfaceHeader({
  icon: Icon,
  title,
  description,
  meta,
  actions,
  className,
}: {
  icon: LucideIcon
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('project-surface-header flex min-w-0 items-center justify-between gap-4 border-b border-border pb-4', className)}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="project-surface-header__icon flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon size={18} />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate type-title-sm font-semibold text-foreground">{title}</h1>
            {meta}
          </div>
          {description ? (
            <p className="mt-1 max-w-4xl truncate type-label text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="project-surface-header__actions flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </header>
  )
}

export function AppSection({
  children,
  title,
  description,
  icon: Icon,
  action,
  className,
  bodyClassName,
}: {
  children: ReactNode
  title?: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('app-section', className)}>
      {(title || description || Icon || action) ? (
        <div className="app-section__header">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon ? <Icon size={14} className="mt-0.5 shrink-0 text-muted-foreground" /> : null}
            <div className="min-w-0">
              {title ? <h2 className="app-section__title">{title}</h2> : null}
              {description ? <p className="app-section__description">{description}</p> : null}
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn('app-section__body', bodyClassName)}>{children}</div>
    </section>
  )
}

export function AppMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'neutral',
  compact = false,
}: {
  icon?: LucideIcon
  label: ReactNode
  value: ReactNode
  detail?: ReactNode
  tone?: SemanticTone
  compact?: boolean
}) {
  return (
    <div className={cn('app-metric-card', compact && 'app-metric-card--compact')}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="app-metric-card__label">{label}</p>
          <p className="app-metric-card__value">{value}</p>
        </div>
        {Icon ? (
          <span className="app-metric-card__icon">
            <Icon size={compact ? 15 : 18} className={semanticToneClass(tone, 'icon')} />
          </span>
        ) : null}
      </div>
      {detail ? <p className="app-metric-card__detail">{detail}</p> : null}
    </div>
  )
}

export function AppEmptyState({
  icon: Icon,
  title,
  detail,
  action,
  compact = false,
}: {
  icon?: LucideIcon
  title: ReactNode
  detail?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={cn('app-empty-state', compact && 'app-empty-state--compact')}>
      {Icon ? (
        <span className="app-empty-state__icon">
          <Icon size={compact ? 18 : 24} />
        </span>
      ) : null}
      <p className="app-empty-state__title">{title}</p>
      {detail ? <p className="app-empty-state__detail">{detail}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
