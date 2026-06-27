import type { HTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Badge, cn } from '@movscript/ui/primitives'

import './ProjectHomeCardGroup.css'

export type ProjectHomeCardGroupLayout = 'grid' | 'rows' | 'compact-grid'
export type ProjectHomeCardGroupVariant = 'anchor' | 'library' | 'canvas' | 'pipeline' | 'reference'

export interface ProjectHomeCardGroupFact {
  label: ReactNode
  value: ReactNode
}

export interface ProjectHomeCardGroupProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  action?: ReactNode
  bodyClassName?: string
  count?: number | string
  countLabel?: string
  description: ReactNode
  eyebrow?: ReactNode
  facts?: ProjectHomeCardGroupFact[]
  footer?: ReactNode
  icon: LucideIcon
  layout?: ProjectHomeCardGroupLayout
  title: ReactNode
  toolbar?: ReactNode
  variant?: ProjectHomeCardGroupVariant
}

export function ProjectHomeCardGroup({
  action,
  bodyClassName,
  children,
  className,
  count,
  countLabel,
  description,
  eyebrow,
  facts,
  footer,
  icon: Icon,
  layout = 'grid',
  title,
  toolbar,
  variant = 'library',
  ...props
}: ProjectHomeCardGroupProps) {
  return (
    <section className={cn('project-home-card-group', className)} data-layout={layout} data-variant={variant} {...props}>
      <div className="project-home-card-group__header">
        <div className="project-home-card-group__heading">
          <span className="project-home-card-group__icon" aria-hidden="true">
            <Icon size={16} />
          </span>
          <div className="project-home-card-group__copy">
            {eyebrow ? <div className="project-home-card-group__eyebrow">{eyebrow}</div> : null}
            <div className="project-home-card-group__title-line">
              <h2 className="project-home-card-group__title">{title}</h2>
              {count !== undefined ? (
                <Badge variant="outline" className="project-home-card-group__count">
                  {countLabel ? `${count} ${countLabel}` : count}
                </Badge>
              ) : null}
            </div>
            <p className="project-home-card-group__description">{description}</p>
          </div>
        </div>
        {action ? <div className="project-home-card-group__actions">{action}</div> : null}
      </div>
      {facts?.length ? (
        <dl className="project-home-card-group__facts">
          {facts.map((fact, index) => (
            <div key={index} className="project-home-card-group__fact">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {toolbar ? <div className="project-home-card-group__toolbar">{toolbar}</div> : null}
      <div className={cn('project-home-card-group__body', bodyClassName)} data-layout={layout} data-variant={variant}>
        {children}
      </div>
      {footer ? <div className="project-home-card-group__footer">{footer}</div> : null}
    </section>
  )
}

export function ProjectHomeCardGroupEmpty({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('project-home-card-group__empty', className)} {...props} />
}
