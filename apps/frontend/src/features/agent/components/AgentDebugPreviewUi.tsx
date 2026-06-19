import type { ComponentProps, HTMLAttributes, ReactNode } from 'react'

import { toneSurfaceClass, toneTextClass } from '@movscript/ui/semantic'
import { Badge, Button, StatusBadge, type ButtonProps, type StatusBadgeProps } from '@movscript/ui/primitives'
import { AppCodeBlock, AppInlineMeta } from '@movscript/ui/business/app'
import { AgentDataBlock, AgentSurfaceBlock } from '@movscript/ui/business/agent'
import { ReviewCallout } from '@movscript/ui/business/review'
import type { IconComponent } from '@movscript/ui/primitives'

import { cn } from '@/shared/ui/cn'

import './AgentDebugPreviewUi.css'

export type AgentDebugPreviewTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export type AgentDebugWorkspaceDiffSide = 'current' | 'proposed'
export type AgentDebugWorkspaceDiffLineChange = 'removed' | 'added' | 'same'

export function AgentDebugIcon({
  icon: Icon,
  spinning = false,
  selected = false,
  className,
  ...props
}: ComponentProps<IconComponent> & {
  icon: IconComponent
  spinning?: boolean
  selected?: boolean
}) {
  return (
    <Icon
      className={cn(
        'agent-debug-icon',
        spinning ? 'agent-debug-icon--spinning' : undefined,
        selected ? 'agent-debug-icon--selected' : undefined,
        className,
      )}
      {...props}
    />
  )
}

export function AgentDebugStack({
  density = 'regular',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  density?: 'compact' | 'regular'
}) {
  return <div data-density={density} className={cn('agent-debug-stack', className)} {...props} />
}

export function AgentDebugGrid({
  columns = 'two',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  columns?: 'two' | 'three' | 'four' | 'runtime' | 'overview'
}) {
  return <div data-columns={columns} className={cn('agent-debug-grid', className)} {...props} />
}

export function AgentDebugCodeBlock({ className, ...props }: ComponentProps<typeof AppCodeBlock>) {
  return <AppCodeBlock className={cn('agent-debug-code-block', className)} {...props} />
}

export function AgentDebugItemTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-debug-item-title', className)} {...props} />
}

export function AgentDebugIssueList({
  items,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLUListElement>, 'children'> & {
  items: ReactNode[]
}) {
  if (items.length === 0) return null
  return (
    <ul className={cn('agent-debug-issue-list', className)} {...props}>
      {items.map((item, index) => (
        <li key={index} className="agent-debug-issue-list__item">
          {item}
        </li>
      ))}
    </ul>
  )
}

export function AgentDebugDialogOverlay({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-debug-dialog-overlay', className)} {...props} />
}

export function AgentDebugDialogSurface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AgentSurfaceBlock className={cn('agent-debug-dialog-surface', className)} {...props} />
}

export function AgentDebugDialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-debug-dialog-header', className)} {...props} />
}

export function AgentDebugDialogHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-debug-dialog-header__copy', className)} {...props} />
}

export function AgentDebugDialogTitleRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-debug-dialog-title-row', className)} {...props} />
}

export function AgentDebugDialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('agent-debug-dialog-title', className)} {...props} />
}

export function AgentDebugDialogDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-debug-dialog-description', className)} {...props} />
}

export function AgentDebugDialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-debug-dialog-body', className)} {...props} />
}

export function AgentDebugDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-debug-dialog-footer', className)} {...props} />
}

export function AgentDebugDialogFooterActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-debug-dialog-footer__actions', className)} {...props} />
}

export function AgentDebugSection({
  title,
  children,
}: {
  title: ReactNode
  children: ReactNode
}) {
  return (
    <section className="agent-debug-section">
      <h3 className="agent-debug-section__title">{title}</h3>
      {children}
    </section>
  )
}

export function AgentDebugSummaryItem({
  label,
  value,
}: {
  label: ReactNode
  value: ReactNode
}) {
  return (
    <AgentDataBlock className="agent-debug-summary-item">
      <span className="agent-debug-summary-item__label">{label}</span>
      <span className="agent-debug-summary-item__value" title={typeof value === 'string' ? value : undefined}>
        {value}
      </span>
    </AgentDataBlock>
  )
}

export function AgentDebugCodePanel({
  children,
  size = 'medium',
  span,
  className,
}: {
  children: ReactNode
  size?: 'small' | 'medium' | 'large' | 'raw'
  span?: 'full'
  className?: string
}) {
  return (
    <AgentDataBlock data-size={size} data-span={span} className={cn('agent-debug-code-panel', className)}>
      <AppCodeBlock className="agent-debug-code-panel__code">{children}</AppCodeBlock>
    </AgentDataBlock>
  )
}

export function AgentDebugFieldCodePanel({
  label,
  children,
  size = 'small',
  span,
}: {
  label: ReactNode
  children: ReactNode
  size?: 'small' | 'medium' | 'large' | 'raw'
  span?: 'full'
}) {
  return (
    <div data-span={span} className="agent-debug-field-group">
      <span className="agent-debug-field-group__label">{label}</span>
      <AgentDebugCodePanel span={span} size={size} className="agent-debug-field-code-panel">
        {children}
      </AgentDebugCodePanel>
    </div>
  )
}

export function AgentDebugLabeledCodePanel({
  leading,
  trailing,
  children,
  size = 'medium',
}: {
  leading: ReactNode
  trailing?: ReactNode
  children: ReactNode
  size?: 'small' | 'medium' | 'large' | 'raw'
}) {
  return (
    <AgentDataBlock data-size={size} className="agent-debug-labeled-code-panel">
      <div className="agent-debug-labeled-code-panel__header">
        <div className="agent-debug-labeled-code-panel__leading">{leading}</div>
        {trailing ? <span className="agent-debug-labeled-code-panel__trailing">{trailing}</span> : null}
      </div>
      <AgentDebugCodeBlock className="agent-debug-labeled-code-panel__code">{children}</AgentDebugCodeBlock>
    </AgentDataBlock>
  )
}

export function AgentDebugSimpleText({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-debug-simple-text', className)} {...props} />
}

export function AgentDebugSubtleText({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-debug-subtle-text', className)} {...props} />
}

export function AgentDebugMetaList({
  items,
  empty,
}: {
  items: ReactNode[]
  empty?: ReactNode
}) {
  if (items.length === 0) {
    return <AgentDebugSubtleText>{empty}</AgentDebugSubtleText>
  }
  return (
    <div className="agent-debug-meta-list">
      {items.map((item, index) => (
        <div key={index} className="agent-debug-meta-list__item">
          {item}
        </div>
      ))}
    </div>
  )
}

export function AgentDebugCard({
  variant = 'subtle',
  className,
  ...props
}: ComponentProps<typeof AgentSurfaceBlock>) {
  return <AgentSurfaceBlock variant={variant} className={cn('agent-debug-card', className)} {...props} />
}

export function AgentDebugCardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-debug-card__header', className)} {...props} />
}

export function AgentDebugCardTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-debug-card__title', className)} {...props} />
}

export function AgentDebugCardDetail({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-debug-card__detail', className)} {...props} />
}

export function AgentDebugHttpRequestShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AgentSurfaceBlock className={cn('agent-debug-http-request', className)} {...props} />
}

export function AgentDebugHttpRequestHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-debug-http-request__header', className)} {...props} />
}

export function AgentDebugHttpRequestTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-debug-http-request__title', className)} {...props} />
}

export function AgentDebugHttpRequestBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-debug-http-request__body', className)} {...props} />
}

export function AgentDebugHttpRequestUrl({ method, url }: { method: ReactNode; url: ReactNode }) {
  return (
    <AgentDataBlock className="agent-debug-http-request__url">
      <span className="agent-debug-http-request__method">{method}</span>{' '}
      <span className="agent-debug-http-request__url-text">{url}</span>
    </AgentDataBlock>
  )
}

export function AgentDebugWorkspaceDiffShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AgentSurfaceBlock className={cn('agent-debug-workspace-diff', className)} {...props} />
}

export function AgentDebugWorkspaceDiffHeader({
  currentLabel,
  proposedLabel,
}: {
  currentLabel: ReactNode
  proposedLabel: ReactNode
}) {
  return (
    <div className="agent-debug-workspace-diff__header">
      <span className="agent-debug-workspace-diff__header-cell agent-debug-workspace-diff__header-cell--current">
        {currentLabel}
      </span>
      <span className="agent-debug-workspace-diff__header-cell">{proposedLabel}</span>
    </div>
  )
}

export function AgentDebugWorkspaceDiffColumns({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-debug-workspace-diff__columns', className)} {...props} />
}

export function AgentDebugWorkspaceDiffRows({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('agent-debug-workspace-diff__rows', className)}>
      <AgentSurfaceBlock className="agent-debug-workspace-diff__rows-inner" {...props} />
    </div>
  )
}

export function AgentDebugInlineMeta({ className, ...props }: ComponentProps<typeof AppInlineMeta>) {
  return <AppInlineMeta className={cn('agent-debug-inline-meta', className)} {...props} />
}

export function AgentDebugPreviewBadge({ className, ...props }: ComponentProps<typeof Badge>) {
  return <Badge className={cn('agent-debug-preview-badge', className)} {...props} />
}

export function AgentDebugPreviewStatusBadge({ className, ...props }: StatusBadgeProps) {
  return <StatusBadge className={cn('agent-debug-preview-status-badge', className)} {...props} />
}

export function AgentDebugPreviewActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn('agent-debug-preview-action-button', className)} {...props} />
}

export function AgentDebugWarningCallout({
  className,
  ...props
}: Omit<ComponentProps<typeof ReviewCallout>, 'tone' | 'compact'>) {
  return <ReviewCallout tone="warning" compact className={cn('agent-debug-callout agent-debug-warning-callout', className)} {...props} />
}

export function AgentDebugErrorCallout({
  className,
  ...props
}: Omit<ComponentProps<typeof ReviewCallout>, 'tone' | 'compact'>) {
  return <ReviewCallout tone="danger" compact className={cn('agent-debug-callout agent-debug-error-callout', className)} {...props} />
}

export function AgentDebugToneText({
  as: Element = 'p',
  tone,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'p' | 'span' | 'div'
  tone: Exclude<AgentDebugPreviewTone, 'neutral'>
}) {
  return (
    <Element className={cn('agent-debug-tone-text', toneTextClass(tone), className)} {...props}>
      {children}
    </Element>
  )
}

export function AgentDebugWorkspaceDiffCodeBlock({
  side,
  className,
  ...props
}: ComponentProps<typeof AppCodeBlock> & {
  side: AgentDebugWorkspaceDiffSide
}) {
  const tone = side === 'current' ? 'danger' : 'success'
  return (
    <AppCodeBlock
      className={cn(
        'agent-debug-workspace-diff-code',
        `agent-debug-workspace-diff-code--${side}`,
        toneSurfaceClass(tone),
        toneTextClass(tone),
        className,
      )}
      {...props}
    />
  )
}

export function AgentDebugWorkspaceDiffLine({
  change,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  change: AgentDebugWorkspaceDiffLineChange
}) {
  const tone = change === 'removed' ? 'danger' : change === 'added' ? 'success' : undefined
  return (
    <div
      className={cn(
        'agent-debug-workspace-diff-line',
        `agent-debug-workspace-diff-line--${change}`,
        tone ? cn(toneSurfaceClass(tone), toneTextClass(tone)) : undefined,
        className,
      )}
      {...props}
    />
  )
}
