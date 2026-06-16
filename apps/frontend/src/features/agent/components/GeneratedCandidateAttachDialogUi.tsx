import type { ComponentPropsWithoutRef, HTMLAttributes } from 'react'
import { AppTextEmptyState } from '@movscript/ui/business/app'
import { WorkbenchList, WorkbenchListItem } from '@movscript/ui/business/workbench'
import {
  Badge,
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@movscript/ui/primitives'
import { cn } from '@/shared/ui/cn'
import './GeneratedCandidateAttachDialog.css'

export function GeneratedCandidateDialogContent({ className, ...props }: ComponentPropsWithoutRef<typeof DialogContent>) {
  return <DialogContent className={cn('agent-generated-candidate-dialog', className)} {...props} />
}

export function GeneratedCandidateDialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <DialogHeader className={cn('agent-generated-candidate-dialog-header', className)} {...props} />
}

export function GeneratedCandidateDialogTitle({ className, ...props }: ComponentPropsWithoutRef<typeof DialogTitle>) {
  return <DialogTitle className={className} {...props} />
}

export function GeneratedCandidateDialogDescription({ className, ...props }: ComponentPropsWithoutRef<typeof DialogDescription>) {
  return <DialogDescription className={className} {...props} />
}

export function GeneratedCandidateDialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-candidate-dialog-body', className)} {...props} />
}

export function GeneratedCandidateDialogSidebar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-candidate-dialog-sidebar', className)} {...props} />
}

export function GeneratedCandidateDialogMain({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-candidate-dialog-main', className)} {...props} />
}

export function GeneratedCandidateDialogSectionHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-candidate-dialog-section-header', className)} {...props} />
}

export function GeneratedCandidateDialogList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-candidate-dialog-list', className)} {...props} />
}

export function GeneratedCandidateDialogControls({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-candidate-dialog-controls', className)} {...props} />
}

export function GeneratedCandidateDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <DialogFooter className={cn('agent-generated-candidate-dialog-footer', className)} {...props} />
}

export function GeneratedCandidateBadge({ className, ...props }: ComponentPropsWithoutRef<typeof Badge>) {
  return <Badge className={cn('agent-generated-candidate-dialog-badge', className)} {...props} />
}

export function GeneratedCandidateActionButton({ className, ...props }: ComponentPropsWithoutRef<typeof Button>) {
  return <Button className={cn('agent-generated-candidate-dialog-action', className)} {...props} />
}

export function GeneratedCandidateSearchInput({ className, controlSize = 'sm', ...props }: ComponentPropsWithoutRef<typeof Input>) {
  return <Input controlSize={controlSize} className={cn('agent-generated-candidate-dialog-search', className)} {...props} />
}

export function GeneratedCandidateEmptyState({ className, ...props }: ComponentPropsWithoutRef<typeof AppTextEmptyState>) {
  return <AppTextEmptyState className={cn('agent-generated-candidate-dialog-empty', className)} {...props} />
}

export function GeneratedCandidateResourceItem({
  attached = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { attached?: boolean }) {
  return (
    <div
      data-attached={attached ? 'true' : undefined}
      className={cn('agent-generated-candidate-resource-item', className)}
      {...props}
    />
  )
}

export function GeneratedCandidateResourceRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-candidate-resource-item-row', className)} {...props} />
}

export function GeneratedCandidateResourceIcon({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-generated-candidate-resource-item-icon', className)} {...props} />
}

export function GeneratedCandidateResourceBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-candidate-resource-item-body', className)} {...props} />
}

export function GeneratedCandidateResourceName({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-generated-candidate-resource-item-name', className)} {...props} />
}

export function GeneratedCandidateResourceMeta({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-generated-candidate-resource-item-meta', className)} {...props} />
}

export function GeneratedCandidateTargetListFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-candidate-target-list', className)} {...props} />
}

export function GeneratedCandidateTargetList({ className, ...props }: ComponentPropsWithoutRef<typeof WorkbenchList>) {
  return <WorkbenchList className={cn('agent-generated-candidate-target-list-items', className)} {...props} />
}

export function GeneratedCandidateTargetItem({ className, density = 'compact', ...props }: ComponentPropsWithoutRef<typeof WorkbenchListItem>) {
  return <WorkbenchListItem density={density} className={cn('agent-generated-candidate-target-list-item', className)} {...props} />
}

export function GeneratedCandidateEmptyMessage({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-generated-candidate-empty-message', className)} {...props} />
}

export function GeneratedCandidateTargetRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-candidate-target-row', className)} {...props} />
}

export function GeneratedCandidateTargetTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-generated-candidate-target-title', className)} {...props} />
}

export function GeneratedCandidateTargetId({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-generated-candidate-target-id', className)} {...props} />
}

export function GeneratedCandidateTargetMeta({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-generated-candidate-target-meta', className)} {...props} />
}

export function GeneratedCandidateTargetDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-generated-candidate-target-description', className)} {...props} />
}

export function GeneratedCandidateSelectedTarget({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-candidate-selected-target', className)} {...props} />
}

export function GeneratedCandidateStatusMessage({
  className,
  tone = 'neutral',
  ...props
}: HTMLAttributes<HTMLParagraphElement> & { tone?: 'neutral' | 'success' | 'danger' }) {
  return <p data-tone={tone} className={cn('agent-generated-candidate-status-message', className)} {...props} />
}

export function GeneratedViewerSidePanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-viewer-panel', className)} {...props} />
}

export function GeneratedViewerSideHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-viewer-panel-header', className)} {...props} />
}

export function GeneratedViewerSideActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-viewer-panel-actions', className)} {...props} />
}

export function GeneratedViewerSideContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-generated-viewer-panel-content', className)} {...props} />
}

export function GeneratedViewerActionButton({ className, size = 'xs', ...props }: ComponentPropsWithoutRef<typeof Button>) {
  return <Button size={size} className={cn('agent-generated-viewer-panel-action', className)} {...props} />
}

export function GeneratedViewerBadge({ className, ...props }: ComponentPropsWithoutRef<typeof Badge>) {
  return <Badge className={cn('agent-generated-viewer-panel-badge', className)} {...props} />
}
