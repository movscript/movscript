import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { Badge, Button } from '@movscript/ui/primitives'
import { AppIconFrame, AppKeyValue } from '@movscript/ui/business/app'
import { AgentDataBlock } from '@movscript/ui/business/agent'

import { cn } from '@/shared/ui/cn'

import './AgentBrowserInternalPageUi.css'

export function AgentBrowserBlankForm({ className, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cn('agent-browser-blank-form', className)} {...props} />
}

export function AgentBrowserBlankContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-blank-content', className)} {...props} />
}

export function AgentBrowserSectionIntro({
  title,
  description,
}: {
  title: ReactNode
  description: ReactNode
}) {
  return (
    <div className="agent-browser-section-intro">
      <h2 className="agent-browser-section-intro__title">{title}</h2>
      <p className="agent-browser-section-intro__description">{description}</p>
    </div>
  )
}

export function AgentBrowserNavGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-nav-grid', className)} {...props} />
}

export function AgentBrowserNavButton({
  icon,
  title,
  description,
  trailing,
  ...props
}: ComponentProps<typeof Button> & {
  icon: ReactNode
  title: ReactNode
  description: ReactNode
  trailing?: ReactNode
}) {
  return (
    <Button type="button" variant="outline" className="agent-browser-nav-button" {...props}>
      <AppIconFrame size="lg">{icon}</AppIconFrame>
      <span className="agent-browser-nav-button__copy">
        <span className="agent-browser-nav-button__title">{title}</span>
        <span className="agent-browser-nav-button__description">{description}</span>
      </span>
      {trailing ? <span className="agent-browser-nav-button__trailing">{trailing}</span> : null}
    </Button>
  )
}

export function AgentBrowserDividerSection({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-divider-section', className)} {...props} />
}

export function AgentBrowserSectionLabel({
  icon,
  children,
}: {
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="agent-browser-section-label">
      {icon}
      {children}
    </div>
  )
}

export function AgentBrowserInputRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-input-row', className)} {...props} />
}

export function AgentBrowserProjectEmpty({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: ReactNode
  description: ReactNode
}) {
  return (
    <div className="agent-browser-project-empty">
      <AppIconFrame size="lg" className="agent-browser-project-empty__icon">{icon}</AppIconFrame>
      <h2 className="agent-browser-project-empty__title">{title}</h2>
      <p className="agent-browser-project-empty__description">{description}</p>
    </div>
  )
}

export function AgentBrowserProjectPage({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-project-page', className)} {...props} />
}

export function AgentBrowserProjectNavigationPage({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <AgentBrowserProjectPage className={cn('agent-browser-project-page--navigation', className)} {...props} />
}

export function AgentBrowserProjectHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-project-header', className)} {...props} />
}

export function AgentBrowserProjectHeaderCopy({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-project-header__copy', className)} {...props} />
}

export function AgentBrowserProjectMetaLabel({
  icon,
  children,
}: {
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="agent-browser-project-meta-label">
      {icon}
      {children}
    </div>
  )
}

export function AgentBrowserProjectTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('agent-browser-project-title', className)} {...props} />
}

export function AgentBrowserProjectDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-browser-project-description', className)} {...props} />
}

export function AgentBrowserBadge({ className, ...props }: ComponentProps<typeof Badge>) {
  return <Badge variant="outline" className={cn('agent-browser-badge', className)} {...props} />
}

export function AgentBrowserKeyValue(props: ComponentProps<typeof AppKeyValue>) {
  return <AppKeyValue {...props} />
}

export function AgentBrowserContentToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-content-nav__toolbar', className)} {...props} />
}

export function AgentBrowserActionButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button className={cn('agent-browser-action-button', className)} {...props} />
}

export function AgentBrowserContentToolButton({
  icon,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode
}) {
  return (
    <button type="button" className={cn('agent-browser-content-nav__tool', className)} {...props}>
      {icon}
      <span>{children}</span>
    </button>
  )
}

export function AgentBrowserContentSummary({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('agent-browser-content-nav__summary', className)} {...props} />
}

export function AgentBrowserContentSummaryMain({
  label,
  value,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode
  value: ReactNode
}) {
  return (
    <div className={cn('agent-browser-content-nav__summary-main', className)} {...props}>
      <span className="agent-browser-content-nav__summary-label">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function AgentBrowserContentSummaryGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-content-nav__summary-grid', className)} {...props} />
}

export function AgentBrowserContentMatrix({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('agent-browser-content-nav__matrix', className)} {...props} />
}

export function AgentBrowserContentFlow({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('agent-browser-content-nav__flow', className)} {...props} />
}

export function AgentBrowserContentGroup({
  tone,
  variant,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  tone: string
  variant: string
}) {
  return (
    <section
      className={cn('agent-browser-content-group', className)}
      data-tone={tone}
      data-variant={variant}
      {...props}
    />
  )
}

export function AgentBrowserContentGroupHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-content-group__header', className)} {...props} />
}

export function AgentBrowserContentGroupIcon({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-browser-content-group__icon', className)} {...props} />
}

export function AgentBrowserContentGroupCopy({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-browser-content-group__copy', className)} {...props} />
}

export function AgentBrowserContentGroupTitleRow({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-browser-content-group__title-row', className)} {...props} />
}

export function AgentBrowserContentGroupIndex({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-browser-content-group__index', className)} {...props} />
}

export function AgentBrowserContentGroupTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-browser-content-group__title', className)} {...props} />
}

export function AgentBrowserContentGroupDescription({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-browser-content-group__description', className)} {...props} />
}

export function AgentBrowserContentGroupItems({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-content-group__items', className)} {...props} />
}

export function AgentBrowserContentGroupState({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-content-group__state', className)} {...props} />
}

export function AgentBrowserContentGroupOverflow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('agent-browser-content-group__overflow', className)} {...props} />
}

export const AgentBrowserContentItem = forwardRef<HTMLElement, HTMLAttributes<HTMLElement> & {
  asChild?: boolean
}>(({ asChild = false, className, children, ...props }, ref) => {
  if (asChild) {
    const child = Children.only(children)
    if (isValidElement<{ className?: string }>(child)) {
      return cloneElement(child as ReactElement<{ className?: string }>, {
        ...props,
        ref,
        className: cn('agent-browser-content-item', child.props.className, className),
      } as { ref: Ref<HTMLElement>; className: string })
    }
  }
  return <button ref={ref as Ref<HTMLButtonElement>} type="button" className={cn('agent-browser-content-item', className)} {...props}>{children}</button>
})

AgentBrowserContentItem.displayName = 'AgentBrowserContentItem'

export function AgentBrowserContentItemCopy({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-browser-content-item__copy', className)} {...props} />
}

export function AgentBrowserContentItemTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-browser-content-item__title', className)} {...props} />
}

export function AgentBrowserContentItemDescription({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-browser-content-item__description', className)} {...props} />
}

export function AgentBrowserContentItemMeta({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('agent-browser-content-item__meta', className)} {...props} />
}

export function AgentBrowserDataBlock({ className, ...props }: ComponentProps<typeof AgentDataBlock>) {
  return <AgentDataBlock className={cn('agent-browser-data-block', className)} {...props} />
}

export function AgentBrowserDataBlockTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-browser-data-block__title', className)} {...props} />
}

export function AgentBrowserDataBlockDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('agent-browser-data-block__description', className)} {...props} />
}
