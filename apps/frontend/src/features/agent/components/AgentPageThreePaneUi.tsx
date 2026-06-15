import type { ButtonHTMLAttributes, ComponentProps, HTMLAttributes } from 'react'

import { AppPageShellBody } from '@movscript/ui/layout'
import { Button } from '@movscript/ui/primitives'

import { cn } from '@/shared/ui/cn'

import './AgentPageThreePaneUi.css'

export function AgentThreePanePageBody({
  className,
  ...props
}: Omit<ComponentProps<typeof AppPageShellBody>, 'padding' | 'scroll'>) {
  return <AppPageShellBody padding="none" scroll="responsive-split" className={cn('agent-three-pane-page-body', className)} {...props} />
}

export function AgentThreePanePagePane({
  className,
  tone = 'surface',
  ...props
}: HTMLAttributes<HTMLElement> & {
  tone?: 'surface' | 'raw'
}) {
  return <section data-tone={tone} className={cn('agent-three-pane-page-pane', className)} {...props} />
}

export function AgentThreePanePagePaneHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-three-pane-page-pane__header', className)} {...props} />
}

export function AgentThreePanePagePaneHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-three-pane-page-pane__header-copy', className)} {...props} />
}

export function AgentThreePanePagePaneTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('agent-three-pane-page-pane__title', className)} {...props} />
}

export function AgentThreePanePagePaneDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-three-pane-page-pane__description', className)} {...props} />
}

export function AgentThreePanePagePaneScroller({
  padding = 'default',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  padding?: 'default' | 'none'
}) {
  return <div data-padding={padding === 'none' ? 'none' : undefined} className={cn('agent-three-pane-page-pane__scroller', className)} {...props} />
}

export function AgentThreePanePageListHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-three-pane-page-list-header', className)} {...props} />
}

export function AgentThreePanePageListTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('agent-three-pane-page-list-header__title', className)} {...props} />
}

export function AgentThreePanePageListMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-three-pane-page-list-header__meta', className)} {...props} />
}

export function AgentThreePanePageListStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-three-pane-page-list-stack', className)} {...props} />
}

export function AgentThreePanePageEmptyText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-three-pane-page-empty-text', className)} {...props} />
}

export function AgentThreePanePageItemButton({
  active = false,
  variant = 'card',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
  variant?: 'card' | 'row'
}) {
  return <button type="button" data-active={active ? 'true' : undefined} data-variant={variant} className={cn('agent-three-pane-page-item', className)} {...props} />
}

export function AgentThreePanePageItemHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-three-pane-page-item__header', className)} {...props} />
}

export function AgentThreePanePageItemTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-three-pane-page-item__title', className)} {...props} />
}

export function AgentThreePanePageItemBadge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'info' | 'success'
}) {
  return <span data-tone={tone === 'neutral' ? undefined : tone} className={cn('agent-three-pane-page-item__badge', className)} {...props} />
}

export function AgentThreePanePageItemDetail({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-three-pane-page-item__detail', className)} {...props} />
}

export function AgentThreePanePageItemTime({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-three-pane-page-item__time', className)} {...props} />
}

export function AgentThreePanePageItemMetaRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-three-pane-page-item__meta-row', className)} {...props} />
}

export function AgentThreePanePagePaneRaw({ className, ...props }: HTMLAttributes<HTMLPreElement>) {
  return <pre className={cn('agent-three-pane-page-pane__raw', className)} {...props} />
}

export function AgentThreePanePageSegmentedControl({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-three-pane-page-segmented-control', className)} {...props} />
}

export function AgentThreePanePageSegmentButton({
  active = false,
  className,
  ...props
}: ComponentProps<typeof Button> & {
  active?: boolean
}) {
  return <Button type="button" variant="ghost" size="xs" data-active={active ? 'true' : undefined} className={cn('agent-three-pane-page-segment-button', className)} {...props} />
}
