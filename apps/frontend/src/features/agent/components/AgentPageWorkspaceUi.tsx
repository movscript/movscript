import type { ComponentProps, HTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'

import { Button, type ButtonProps } from '@movscript/ui/primitives'
import { AppPageShellBody } from '@movscript/ui/layout'

import { cn } from '@/shared/ui/cn'

import './AgentPageWorkspaceUi.css'

export function AgentWorkspacesPageBody({
  className,
  ...props
}: Omit<ComponentProps<typeof AppPageShellBody>, 'padding' | 'scroll'>) {
  return <AppPageShellBody padding="none" scroll="responsive-split" className={cn('agent-workspaces-page-body', className)} {...props} />
}

export function AgentWorkspacesPageSidebar({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn('agent-workspaces-page-sidebar', className)} {...props} />
}

export function AgentWorkspacesPageSidebarControls({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspaces-page-sidebar__controls', className)} {...props} />
}

export function AgentWorkspaceSidebarPathRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-sidebar-path-row', className)} {...props} />
}

export function AgentWorkspaceSidebarPathText({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-sidebar-path-text', className)} {...props} />
}

export function AgentWorkspacesPageList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspaces-page-list', className)} {...props} />
}

export function AgentWorkspaceListStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-list-stack', className)} {...props} />
}

export function AgentWorkspacesPageMain({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={cn('agent-workspaces-page-main', className)} {...props} />
}

export function AgentWorkspacesPageFullMain({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <AgentWorkspacesPageMain className={cn('agent-workspaces-page-main--full', className)} {...props} />
}

export function AgentWorkspaceEditorLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-editor-layout', className)} {...props} />
}

export function AgentWorkspaceEditorHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-editor-header', className)} {...props} />
}

export function AgentWorkspaceEditorTitleBlock({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-editor-title-block', className)} {...props} />
}

export function AgentWorkspaceEditorTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-editor-title', className)} {...props} />
}

export function AgentWorkspaceEditorSubtitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-editor-subtitle', className)} {...props} />
}

export function AgentWorkspaceEditorActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-editor-actions', className)} {...props} />
}

export function AgentWorkspaceEditorBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-editor-body', className)} {...props} />
}

export function AgentWorkspaceEditorFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-editor-footer', className)} {...props} />
}

export function AgentWorkspaceEditorTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('agent-workspace-editor-textarea', className)} {...props} />
}

export function AgentWorkspaceReviewSummaryPane({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <AgentWorkspacesPageSidebar className={cn('agent-workspace-review-summary-pane', className)} {...props} />
}

export function AgentWorkspaceReviewRawPane({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <AgentWorkspacesPageMain className={cn('agent-workspace-review-raw-pane', className)} {...props} />
}

export function AgentWorkspaceReviewTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('agent-workspace-review-textarea', className)} {...props} />
}

export function AgentWorkspaceReviewPaneTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-review-pane-title', className)} {...props} />
}

export function AgentWorkspaceReviewJsonBlock({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-review-json-block', className)} {...props} />
}

export function AgentWorkspaceReviewJsonBlockTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-review-json-block__title', className)} {...props} />
}

export function AgentWorkspaceReviewJsonPre({
  maxHeight = false,
  className,
  ...props
}: HTMLAttributes<HTMLPreElement> & {
  maxHeight?: boolean
}) {
  return <pre data-max-height={maxHeight ? 'true' : undefined} className={cn('agent-workspace-review-json-pre', className)} {...props} />
}

export function AgentWorkspaceReviewSection({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-review-section', className)} {...props} />
}

export function AgentWorkspaceReviewSectionTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-review-section__title', className)} {...props} />
}

export function AgentWorkspaceReviewEffectsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-review-effects-list', className)} {...props} />
}

export function AgentWorkspaceReviewEmptyBlock({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-review-empty-block', className)} {...props} />
}

export function AgentWorkspaceSummaryRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-summary-row', className)} {...props} />
}

export function AgentWorkspaceSummaryLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-summary-row__label', className)} {...props} />
}

export function AgentWorkspaceSummaryValue({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-summary-row__value', className)} {...props} />
}

export function AgentWorkspaceStateRow({
  icon,
  tone = 'muted',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode
  tone?: 'muted' | 'danger'
}) {
  return (
    <div data-tone={tone === 'danger' ? 'danger' : undefined} className={cn('agent-workspace-state-row', className)} {...props}>
      {icon}
      {children}
    </div>
  )
}

export function AgentWorkspaceStateSpinner({ className, ...props }: ComponentProps<typeof Loader2>) {
  return <Loader2 size={14} className={cn('agent-workspace-state-spinner', className)} {...props} />
}

export function AgentWorkspaceListItemButton({ className, ...props }: ButtonProps) {
  return <Button type="button" variant="ghost" className={cn('agent-workspace-list-item', className)} {...props} />
}

export function AgentWorkspaceListItemContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-list-item__content', className)} {...props} />
}

export function AgentWorkspaceListItemTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-workspace-list-item__title', className)} {...props} />
}

export function AgentWorkspaceListItemMeta({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-workspace-list-item__meta', className)} {...props} />
}
