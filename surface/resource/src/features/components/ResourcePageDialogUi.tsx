import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode } from 'react'

import {
  CheckboxField,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Input,
  Progress,
  RangeInput,
} from '@movscript/ui/primitives'
import {
  AppControlGroup,
  AppMediaFrame,
  AppRangeTrack,
  AppSurfaceItem,
  type AppRangeTrackProps,
} from '@movscript/ui/business/app'
import type { IconComponent } from '@movscript/ui/primitives'
import { cn } from '@movscript/ui/primitives'

export function ResourceDialogContent({
  size = 'sm',
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogContent> & {
  size?: 'xs' | 'sm' | 'md' | 'permissions' | 'clip'
}) {
  return <DialogContent className={cn('resource-dialog-content', `resource-dialog-content--${size}`, className)} {...props} />
}

export function ResourceDialogTitle(props: ComponentPropsWithoutRef<typeof DialogTitle>) {
  return <DialogTitle {...props} />
}

export function ResourceDialogFooter({ className, ...props }: ComponentPropsWithoutRef<typeof DialogFooter>) {
  return <DialogFooter className={cn('resource-dialog-footer', className)} {...props} />
}

export function ResourceDialogStack({
  density = 'normal',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  density?: 'normal' | 'compact' | 'loose'
}) {
  return <div className={cn('resource-dialog-stack', `resource-dialog-stack--${density}`, className)} {...props} />
}

export function ResourceDialogField({ className, ...props }: HTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('resource-dialog-field', className)} {...props} />
}

export function ResourceDialogFieldLabel({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('resource-dialog-field__label', className)} {...props} />
}

export function ResourceDialogInput({ className, ...props }: ComponentPropsWithoutRef<typeof Input>) {
  return <Input className={cn('resource-dialog-input', className)} {...props} />
}

export function ResourceDialogSelect({ className, ...props }: ComponentPropsWithoutRef<'select'>) {
  return <select className={cn('resource-dialog-select', className)} {...props} />
}

export function ResourceDialogCheckbox({ className, ...props }: ComponentPropsWithoutRef<typeof CheckboxField>) {
  return <CheckboxField className={cn('resource-dialog-checkbox', className)} {...props} />
}

export function ResourceDialogText({
  tone = 'muted',
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  tone?: 'muted' | 'faint' | 'foreground'
}) {
  return <p className={cn('resource-dialog-text', `resource-dialog-text--${tone}`, className)} {...props} />
}

export function ResourceDialogScrollArea({
  size = 'md',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  size?: 'sm' | 'md'
}) {
  return <div className={cn('resource-dialog-scroll-area', `resource-dialog-scroll-area--${size}`, className)} {...props} />
}

export function ResourceDialogHeader({
  icon: Icon,
  title,
  close,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon?: IconComponent
  title: ReactNode
  close?: ReactNode
}) {
  return (
    <div className={cn('resource-dialog-header', className)} {...props}>
      {Icon ? <Icon size={14} className="resource-dialog-header__icon" /> : null}
      <DialogTitle className="resource-dialog-header__title">{title}</DialogTitle>
      {close}
    </div>
  )
}

export function ResourceDialogCloseButton({ className, ...props }: ComponentPropsWithoutRef<typeof DialogClose>) {
  return <DialogClose className={cn('resource-dialog-close', className)} {...props} />
}

export function ResourceClipLayout({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-clip-layout', className)} {...props} />
}

export function ResourceClipMain({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-clip-main', className)} {...props} />
}

export function ResourceClipStageFrame({ className, ...props }: ComponentPropsWithoutRef<typeof AppMediaFrame>) {
  return <AppMediaFrame variant="stage-dark" className={cn('resource-clip-stage', className)} {...props} />
}

export function ResourceClipStageState({
  align = 'center',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  align?: 'center' | 'left'
}) {
  return <div className={cn('resource-clip-stage-state', `resource-clip-stage-state--${align}`, className)} {...props} />
}

export function ResourceClipStageText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('resource-clip-stage-text', className)} {...props} />
}

export function ResourceClipProgress({ className, ...props }: ComponentPropsWithoutRef<typeof Progress>) {
  return <Progress className={cn('resource-clip-progress', className)} {...props} />
}

export function ResourceClipControls({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-clip-controls', className)} {...props} />
}

export function ResourceClipTime({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('resource-clip-time', className)} {...props} />
}

export function ResourceClipRangeGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-clip-range-grid', className)} {...props} />
}

export function ResourceClipSidebar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-clip-sidebar', className)} {...props} />
}

export function ResourceClipFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-clip-footer', className)} {...props} />
}

export function ResourceClipHint(props: HTMLAttributes<HTMLParagraphElement>) {
  return <ResourceDialogText {...props} />
}

export function ResourceClipExpectedPath({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('resource-clip-expected-path', className)} {...props} />
}

export function ResourceClipStatusText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('resource-clip-status-text', className)} {...props} />
}

export function ResourceClipRangeFieldRoot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-clip-range-field', className)} {...props} />
}

export function ResourceClipRangeFieldHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-clip-range-field__header', className)} {...props} />
}

export function ResourceClipRangeInput({ className, ...props }: ComponentPropsWithoutRef<typeof RangeInput>) {
  return <RangeInput className={cn('resource-clip-range-input', className)} {...props} />
}

export function ResourceClipRangeTrack({ className, ...props }: AppRangeTrackProps) {
  return <AppRangeTrack className={cn('resource-clip-range-track', className)} {...props} />
}

export function ResourcePermissionShareRow({
  title,
  description,
  control,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode
  description?: ReactNode
  control: ReactNode
}) {
  return (
    <AppSurfaceItem variant="muted" className={cn('resource-permission-share-row', className)} {...props}>
      <div className="resource-permission-share-row__copy">
        <p className="resource-permission-share-row__title">{title}</p>
        {description ? <p className="resource-permission-share-row__description">{description}</p> : null}
      </div>
      <div className="resource-permission-share-row__control">{control}</div>
    </AppSurfaceItem>
  )
}

export function ResourcePermissionUserRow({
  name,
  meta,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  name: ReactNode
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <AppSurfaceItem className={cn('resource-permission-user-row', className)} {...props}>
      <span className="resource-permission-user-row__name">{name}</span>
      {meta ? <span className="resource-permission-user-row__meta">{meta}</span> : null}
      {actions ? <div className="resource-permission-user-row__actions">{actions}</div> : null}
    </AppSurfaceItem>
  )
}

export function ResourcePermissionActionGroup({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppControlGroup className={cn('resource-permission-action-group', className)} {...props}>
      {children}
    </AppControlGroup>
  )
}

export function ResourcePermissionSection({
  title,
  children,
  divided = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode
  divided?: boolean
}) {
  return (
    <div className={cn('resource-permission-section', divided && 'resource-permission-section--divided', className)} {...props}>
      <p className="resource-permission-section__title">{title}</p>
      {children}
    </div>
  )
}

export function ResourcePermissionEmpty({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('resource-permission-empty', className)} {...props} />
}

export interface ResourceClipSummaryProps extends HTMLAttributes<HTMLDivElement> {
  rows: Array<{ label: ReactNode; value: ReactNode; title?: string }>
}

export function ResourceClipSummary({ rows, className, ...props }: ResourceClipSummaryProps) {
  return (
    <AppSurfaceItem variant="muted" className={cn('resource-clip-summary', className)} {...props}>
      {rows.map((row, index) => (
        <div key={index} className="resource-clip-summary__row">
          <span className="resource-clip-summary__label">{row.label}</span>
          <span className="resource-clip-summary__value" title={row.title}>{row.value}</span>
        </div>
      ))}
    </AppSurfaceItem>
  )
}

export function ResourceClipModeGroup({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppControlGroup layout="grid" className={cn('resource-clip-mode-group', className)} {...props}>
      {children}
    </AppControlGroup>
  )
}
