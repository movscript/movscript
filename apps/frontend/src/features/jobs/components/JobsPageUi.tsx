import { forwardRef, type ComponentPropsWithoutRef, type HTMLAttributes, type ReactNode } from 'react'

import { AppEmptyState, AppStateMessage } from '@movscript/ui/business/app'
import { AppContentLayout } from '@movscript/ui/layout'
import { Button, DialogContent, DialogTitle, Separator, type ButtonProps } from '@movscript/ui/primitives'

import { cn } from '@/shared/ui/cn'

import './JobsPageUi.css'

export function JobsPageShell({
  header,
  filters,
  pager,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  header?: ReactNode
  filters?: ReactNode
  pager?: ReactNode
}) {
  return (
    <AppContentLayout
      variant="workspace"
      padding="none"
      scroll="hidden"
      contentClassName={cn('jobs-page-shell', className)}
      {...props}
    >
      {header ? header : null}
      {filters}
      <main className="jobs-page-shell__content">{children}</main>
      {pager}
    </AppContentLayout>
  )
}

export function JobsLoadingState({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode
}) {
  return (
    <div className={cn('jobs-loading-state', className)} {...props}>
      {icon ? <span className="jobs-loading-state__icon">{icon}</span> : null}
      <span className="jobs-loading-state__text">{children}</span>
    </div>
  )
}

export function JobsEmptyState(props: ComponentPropsWithoutRef<typeof AppEmptyState>) {
  return <AppEmptyState {...props} />
}

export function JobsActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn('jobs-action-button', className)} {...props} />
}

export function JobsDetailDialogContent(props: ComponentPropsWithoutRef<typeof DialogContent>) {
  return <DialogContent className="jobs-detail-dialog-content" {...props} />
}

export function JobsDetailDialogTitle(props: ComponentPropsWithoutRef<typeof DialogTitle>) {
  return <DialogTitle className="ms-sr-only" {...props} />
}

export function JobsPager({ status, actions, className, ...props }: HTMLAttributes<HTMLDivElement> & { status: ReactNode; actions: ReactNode }) {
  return (
    <footer className={cn('jobs-pager', className)} {...props}>
      <span className="jobs-pager__status">{status}</span>
      <div className="jobs-pager__actions">{actions}</div>
    </footer>
  )
}

export const JobsPagerButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'outline', size = 'sm', ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant={variant}
      size={size}
      className={cn('jobs-pager-button', className)}
      {...props}
    />
  ),
)

JobsPagerButton.displayName = 'JobsPagerButton'

export function JobsHeaderStatus({
  icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode
}) {
  return (
    <AppStateMessage
      tone="info"
      icon={icon}
      className={cn('jobs-header-status', className)}
      {...props}
    >
      {children}
    </AppStateMessage>
  )
}

export function JobsFilterBar({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('jobs-filter-bar', className)} {...props}>
      {children}
    </div>
  )
}

export function JobsFilterGroup({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('jobs-filter-group', className)} {...props}>
      {children}
    </div>
  )
}

export function JobsFilterDivider() {
  return (
    <Separator
      orientation="vertical"
      className="jobs-filter-divider"
    />
  )
}

export function JobsViewToggle({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('jobs-view-toggle', className)} {...props}>
      {children}
    </div>
  )
}

export const JobsFilterChipButton = forwardRef<HTMLButtonElement, ButtonProps & {
  active?: boolean
  icon?: ReactNode
  count?: ReactNode
}>(({ active = false, icon, count, children, className, variant, size = 'xs', ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant={variant ?? (active ? 'solid' : 'soft')}
    size={size}
    className={cn('jobs-filter-chip-button', className)}
    data-active={active ? 'true' : 'false'}
    {...props}
  >
    {icon ? <span className="jobs-filter-chip-button__icon">{icon}</span> : null}
    <span className="jobs-filter-chip-button__label">{children}</span>
    {count ? <span className="jobs-filter-chip-button__count">{count}</span> : null}
  </Button>
))

JobsFilterChipButton.displayName = 'JobsFilterChipButton'

export function JobsSelectedDetailRegion({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('jobs-selected-detail', className)} {...props}>
      {children}
    </div>
  )
}

export function JobsCollection({ children, layout = 'stack', className, ...props }: HTMLAttributes<HTMLDivElement> & { layout?: 'stack' | 'grid' }) {
  return (
    <div data-layout={layout} className={cn('jobs-collection', className)} {...props}>
      {children}
    </div>
  )
}

export function JobsCategorySection({
  control,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  control: ReactNode
}) {
  return (
    <section className={cn('jobs-category-section', className)} {...props}>
      <div className="jobs-category-section__control">{control}</div>
      {children}
    </section>
  )
}

export function JobsCountPill({ children, className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('jobs-count-pill', className)} {...props}>
      {children}
    </span>
  )
}
