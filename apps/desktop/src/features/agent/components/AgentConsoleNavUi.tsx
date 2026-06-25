import type { ComponentProps, HTMLAttributes, ReactNode } from 'react'

import { AppInlineMeta } from '@movscript/ui/business/app'
import { AgentSurfaceBlock } from '@movscript/ui/business/agent'
import type { IconComponent } from '@movscript/ui/primitives'
import { cn } from '@/shared/ui/cn'

export function AgentConsoleNavShell({
  compact,
  className,
  ...props
}: ComponentProps<typeof AgentSurfaceBlock> & {
  compact?: boolean
}) {
  return (
    <AgentSurfaceBlock
      asChild
      variant="subtle"
      className={cn('agent-console-nav-shell', compact && 'agent-console-nav-shell--compact', className)}
      {...props}
    />
  )
}

export function AgentConsoleNavList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-console-nav-list', className)} {...props} />
}

export function AgentConsoleNavLinkWrapper({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-console-nav-link-wrapper', className)} {...props} />
}

export function AgentConsoleNavItem({
  active,
  compact,
  icon,
  title,
  description,
  className,
  ...props
}: ComponentProps<typeof AgentSurfaceBlock> & {
  active?: boolean
  compact?: boolean
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
}) {
  return (
    <AgentSurfaceBlock
      variant={active ? 'card' : 'surface'}
      className={cn('agent-console-nav-item', active && 'agent-console-nav-item--active', className)}
      {...props}
    >
      {icon ? <span className="agent-console-nav-item__icon">{icon}</span> : null}
      <span className="agent-console-nav-item__body">
        <span className="agent-console-nav-item__title">{title}</span>
        {!compact && description ? <span className="agent-console-nav-item__description">{description}</span> : null}
      </span>
    </AgentSurfaceBlock>
  )
}

export function AgentConsoleNavMetaRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-console-nav-meta-row', className)} {...props} />
}

export function AgentConsoleNavMeta({ className, ...props }: ComponentProps<typeof AppInlineMeta>) {
  return <AppInlineMeta className={cn('agent-console-nav-meta', className)} {...props} />
}

export type AgentConsoleNavMetaIcon = IconComponent
