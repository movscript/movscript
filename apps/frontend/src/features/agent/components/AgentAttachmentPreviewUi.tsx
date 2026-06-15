import * as React from 'react'

import { cn } from '@/shared/ui/cn'
import { AgentSurfaceBlock, type AgentSurfaceBlockProps } from '@movscript/ui/business/agent'

type AgentAttachmentPreviewDensity = 'default' | 'compact'
type AgentAttachmentPreviewSurface = 'muted' | 'dark'

interface AgentAttachmentPreviewCardProps extends AgentSurfaceBlockProps {
  density?: AgentAttachmentPreviewDensity
}

export const AgentAttachmentPreviewCard = React.forwardRef<HTMLDivElement, AgentAttachmentPreviewCardProps>(
  ({ className, density = 'default', variant = 'surface', ...props }, ref) => (
    <AgentSurfaceBlock
      ref={ref}
      data-density={density}
      variant={variant}
      className={cn('agent-attachment-preview', className)}
      {...props}
    />
  )
)

AgentAttachmentPreviewCard.displayName = 'AgentAttachmentPreviewCard'

interface AgentAttachmentPreviewMediaProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: AgentAttachmentPreviewSurface
}

export const AgentAttachmentPreviewMedia = React.forwardRef<HTMLDivElement, AgentAttachmentPreviewMediaProps>(
  ({ className, surface = 'muted', ...props }, ref) => (
    <div
      ref={ref}
      data-surface={surface}
      className={cn('agent-attachment-preview__media', className)}
      {...props}
    />
  )
)

AgentAttachmentPreviewMedia.displayName = 'AgentAttachmentPreviewMedia'

export const AgentAttachmentPreviewFallback = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('agent-attachment-preview__fallback', className)} {...props} />
  )
)

AgentAttachmentPreviewFallback.displayName = 'AgentAttachmentPreviewFallback'

export const AgentAttachmentPreviewBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('agent-attachment-preview__body', className)} {...props} />
  )
)

AgentAttachmentPreviewBody.displayName = 'AgentAttachmentPreviewBody'
