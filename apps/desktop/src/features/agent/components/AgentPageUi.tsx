import type { ComponentProps, HTMLAttributes } from 'react'

import { AppPageShell, AppPageShellBody, AppPageShellHeader } from '@movscript/ui/layout'

import { cn } from '@/shared/ui/cn'

export function AgentPageShell({
  className,
  ...props
}: Omit<ComponentProps<typeof AppPageShell>, 'chrome'>) {
  return <AppPageShell chrome="immersive" className={cn('agent-page-shell', className)} {...props} />
}

export function AgentPageShellHeader(props: ComponentProps<typeof AppPageShellHeader>) {
  return <AppPageShellHeader {...props} />
}

export function AgentPageShellBody(props: ComponentProps<typeof AppPageShellBody>) {
  return <AppPageShellBody {...props} />
}

export function AgentPageHeaderContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-page-header-content', className)} {...props} />
}

export function AgentPageHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-page-header-copy', className)} {...props} />
}

export function AgentPageEyebrowRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-page-eyebrow-row', className)} {...props} />
}

export function AgentPageDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-page-description', className)} {...props} />
}
