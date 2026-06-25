import type { HTMLAttributes, ReactNode } from 'react'

import { Badge, ArrowRightIcon } from '@movscript/ui/primitives'
import { AppInlineMeta, AppPanel, AppSection } from '@movscript/ui/business/app'
import { ReviewCallout } from '@movscript/ui/business/review'
import { toneTextClass, type SemanticTone } from '@movscript/ui/semantic'
import type { IconComponent } from '@movscript/ui/primitives'
import { cn } from '@movscript/ui/primitives'

import './ProjectStandardsWorkspaceReviewUi.css'

export type ProjectStandardsWorkspaceReviewFieldDiffChange = 'added' | 'deleted' | 'modified' | 'unchanged'

export function ProjectStandardsWorkspaceReviewShell({
  kind,
  title,
  description,
  countLabel,
  action,
  children,
  className,
  icon,
  layout = 'default',
}: {
  kind: string
  title: string
  description: string
  countLabel?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  icon?: IconComponent
  layout?: 'default' | 'contained-scroll'
}) {
  const sectionAction = countLabel || action ? (
    <>
      {countLabel ? <Badge>{countLabel}</Badge> : null}
      {action}
    </>
  ) : null

  return (
    <AppSection
      icon={icon}
      eyebrow={kind}
      title={title}
      description={description}
      action={sectionAction}
      className={cn('project-standards-workspace-review-shell', layout !== 'default' && `project-standards-workspace-review-shell--${layout}`, className)}
      bodyClassName={layout !== 'default' ? 'project-standards-workspace-review-shell__body' : undefined}
    >
      {children}
    </AppSection>
  )
}

export function ProjectStandardsWorkspaceReviewArtifactList({
  children,
  className,
  scroll = false,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  scroll?: boolean
}) {
  return <div className={cn('project-standards-workspace-review-list', scroll && 'project-standards-workspace-review-list--scroll', className)}>{children}</div>
}

export function ProjectStandardsWorkspaceReviewArtifactPanel({
  title,
  meta,
  badges,
  children,
  className,
  bodyClassName,
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode
  meta?: ReactNode
  badges?: ReactNode
  children: ReactNode
  bodyClassName?: string
}) {
  return (
    <AppPanel
      title={title}
      action={badges ? <div className="project-standards-workspace-review-panel__badges">{badges}</div> : undefined}
      className={className}
      bodyClassName={cn('project-standards-workspace-review-panel__body', bodyClassName)}
    >
      {meta ? <p className="project-standards-workspace-review-panel__meta">{meta}</p> : null}
      {children}
    </AppPanel>
  )
}

export function ProjectStandardsWorkspaceReviewSummaryCallout({
  title,
  summary,
  badges,
  detail,
  actions,
  children,
}: {
  title?: string
  summary: ReactNode
  badges?: ReactNode
  detail?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <ReviewCallout tone="info" compact title={title}>
      <div className="project-standards-workspace-review-summary__main">
        <p className="project-standards-workspace-review-summary__summary">{summary}</p>
        {badges ? <div className="project-standards-workspace-review-summary__badges">{badges}</div> : null}
      </div>
      {detail || actions ? (
        <div className="project-standards-workspace-review-summary__footer">
          {detail ? <p className="project-standards-workspace-review-summary__detail">{detail}</p> : null}
          {actions ? <div className="project-standards-workspace-review-summary__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </ReviewCallout>
  )
}

export function ProjectStandardsWorkspaceReviewFieldDiffList({
  children,
  columns = 1,
  className,
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
  columns?: 1 | 2
}) {
  return <div className={cn('project-standards-workspace-review-field-diff-list', columns === 2 && 'project-standards-workspace-review-field-diff-list--2', className)}>{children}</div>
}

export function ProjectStandardsWorkspaceReviewFieldDiffRow({
  label,
  before,
  after,
  change = 'unchanged',
}: {
  label: ReactNode
  before?: ReactNode
  after?: ReactNode
  change?: ProjectStandardsWorkspaceReviewFieldDiffChange
}) {
  const tone = projectStandardsWorkspaceReviewFieldDiffTone(change)
  return (
    <div className="project-standards-workspace-review-field-diff-row">
      <AppInlineMeta className="project-standards-workspace-review-field-diff-row__label">{label}</AppInlineMeta>
      <span className={cn('project-standards-workspace-review-field-diff-row__before', before ? 'project-standards-workspace-review-field-diff-row__before--changed' : undefined)}>
        {before || '新增'}
      </span>
      <ArrowRightIcon size={10} className="project-standards-workspace-review-field-diff-row__arrow" />
      <span className={cn('project-standards-workspace-review-field-diff-row__after', tone !== 'neutral' ? toneTextClass(tone) : undefined)}>
        {after || '未填写'}
      </span>
    </div>
  )
}

function projectStandardsWorkspaceReviewFieldDiffTone(change: ProjectStandardsWorkspaceReviewFieldDiffChange): SemanticTone {
  if (change === 'added') return 'success'
  if (change === 'deleted') return 'danger'
  if (change === 'modified') return 'info'
  return 'neutral'
}
