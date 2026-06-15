"use client";

import {
  forwardRef,
  type ComponentProps,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { AgentSurfaceBlock } from '@movscript/ui/business/agent'
import { AppInlineError, AppInlineMeta } from '@movscript/ui/business/app'
import { Button, DropdownMenuContent, Input } from '@movscript/ui/primitives'

import { cn } from '@/shared/ui/cn'

import './AgentBrowserUi.css'

export function AgentBrowserRoot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-root', className)} {...props} />
}

export function AgentBrowserHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-header', className)} {...props} />
}

export function AgentBrowserTabBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-tab-bar', className)} {...props} />
}

export function AgentBrowserTabList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-tab-list', className)} {...props} />
}

export function AgentBrowserTabSurface({
  active,
  className,
  ...props
}: ComponentProps<typeof AgentSurfaceBlock> & {
  active?: boolean
}) {
  return <AgentSurfaceBlock variant={active ? 'subtle' : 'surface'} className={cn('agent-browser-tab-surface', className)} {...props} />
}

export function AgentBrowserTabButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button type="button" variant="ghost" size="sm" className={cn('agent-browser-tab-button', className)} {...props} />
}

export function AgentBrowserTabCloseButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button type="button" variant="ghost" size="icon-xs" className={cn('agent-browser-tab-close', className)} {...props} />
}

export function AgentBrowserTabIcon({
  loading,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  loading?: boolean
}) {
  return <span className={cn('agent-browser-tab-icon', loading && 'agent-browser-tab-icon--loading', className)} {...props} />
}

export const AgentBrowserIconButton = forwardRef<HTMLButtonElement, ComponentProps<typeof Button>>(
  ({ className, ...props }, ref) => (
    <Button ref={ref} type="button" size="icon-xs" variant="ghost" className={cn('agent-browser-icon-button', className)} {...props} />
  ),
)

AgentBrowserIconButton.displayName = 'AgentBrowserIconButton'

export function AgentBrowserMenuItemIcon({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-browser-menu-item-icon', className)} {...props} />
}

export function AgentBrowserMenuContent({ className, ...props }: ComponentProps<typeof DropdownMenuContent>) {
  return <DropdownMenuContent align="end" className={cn('agent-browser-menu-content', className)} {...props} />
}

export function AgentBrowserToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-toolbar', className)} {...props} />
}

export function AgentBrowserUrlMeta({ className, ...props }: ComponentProps<typeof AppInlineMeta>) {
  return <AppInlineMeta className={cn('agent-browser-url-meta', className)} {...props} />
}

export function AgentBrowserLauncherForm({ className, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cn('agent-browser-launcher-form', className)} {...props} />
}

export function AgentBrowserAddressForm({ className, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cn('agent-browser-address-form', className)} {...props} />
}

export function AgentBrowserLauncherIcon({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-browser-launcher-icon', className)} {...props} />
}

export function AgentBrowserInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input className={cn('agent-browser-input', className)} {...props} />
}

export function AgentBrowserLauncherSubmitButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button type="submit" size="sm" className={cn('agent-browser-launcher-submit', className)} {...props} />
}

export function AgentBrowserInlineError({
  icon,
  children,
  className,
  ...props
}: ComponentProps<typeof AppInlineError> & {
  icon?: ReactNode
}) {
  return (
    <AppInlineError className={cn('agent-browser-inline-error', className)} {...props}>
      {icon ? <span className="agent-browser-inline-error__icon">{icon}</span> : null}
      <span className="agent-browser-inline-error__text">{children}</span>
    </AppInlineError>
  )
}

export const AgentBrowserViewport = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('agent-browser-viewport', className)} {...props} />,
)

AgentBrowserViewport.displayName = 'AgentBrowserViewport'

export function AgentBrowserWebOverlay({
  loading,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  loading?: boolean
}) {
  return <div className={cn('agent-browser-web-overlay', loading && 'agent-browser-web-overlay--loading', className)} {...props} />
}

export function AgentBrowserResourcePane({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-resource-pane', className)} {...props} />
}

export function AgentBrowserInternalPane({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-internal-pane', className)} {...props} />
}
