import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'

import { AppContentLayout } from '@movscript/ui/layout'
import {
  Button,
  CheckboxField,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DropdownMenuItem,
  Input,
  Progress,
  RangeInput,
  type ButtonProps,
  type IconComponent,
} from '@movscript/ui/primitives'
import {
  AppControlGroup,
  AppMediaFrame,
  AppRangeTrack,
  AppStateMessage,
  AppSurfaceItem,
  type AppRangeTrackProps,
} from '@movscript/ui/business/app'
import { WorkbenchListItem, WorkbenchSurfaceItem } from '@movscript/ui/business/workbench'
import { accentTextClass, toneTextClass } from '@movscript/ui/semantic'
import { cn } from '@/shared/ui/cn'
import './ResourcePageUi.css'

export function ResourcePageLayout(props: ComponentPropsWithoutRef<typeof AppContentLayout>) {
  return <AppContentLayout variant="workspace" padding="none" scroll="hidden" contentClassName="resource-page" {...props} />
}

export function ResourcePageMain({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={cn('resource-page__main', className)} {...props} />
}

export function ResourcePageActionGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('app-control-group resource-page__action-group', className)} {...props} />
}

export function ResourcePageActionButton({ className, ...props }: ButtonProps) {
  return <Button className={cn('resource-page__action-button', className)} {...props} />
}

export function ResourcePageSearchField({
  icon: Icon,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Input> & {
  icon: IconComponent
}) {
  return (
    <label className={cn('resource-page__search', className)}>
      <Icon size={12} className="resource-page__search-icon" />
      <Input className="resource-page__search-input" {...props} />
    </label>
  )
}

export const ResourcePageHiddenFileInput = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<typeof Input>>(
  ({ className, ...props }, ref) => <Input ref={ref} className={cn('resource-page__hidden-input', className)} {...props} />,
)
ResourcePageHiddenFileInput.displayName = 'ResourcePageHiddenFileInput'

export function ResourcePageFilterBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-page__filter-bar', className)} {...props} />
}

export function ResourcePageFlexibleSpace({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-page__flex-space', className)} {...props} />
}

export function ResourcePageBulkActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-page__bulk-actions', className)} {...props} />
}

export function ResourcePageMutedText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('resource-page__muted-text', className)} {...props} />
}

export function ResourcePageContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-page__content', className)} {...props} />
}

export function ResourcePageLoadingState({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-page__loading', className)} {...props} />
}

export function ResourcePageEmptyState({
  icon: Icon,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon: IconComponent
}) {
  return (
    <div className={cn('resource-page__empty', className)} {...props}>
      <Icon size={24} className="resource-page__empty-icon" />
      <p className="resource-page__empty-text">{children}</p>
    </div>
  )
}

export function ResourcePageAssetGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-page__asset-grid', className)} {...props} />
}

export function ResourcePageAssetList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-page__asset-list', className)} {...props} />
}

export function ResourcePagePager({
  status,
  actions,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  status: ReactNode
  actions: ReactNode
}) {
  return (
    <div className={cn('resource-page__pager', className)} {...props}>
      <span>{status}</span>
      <div className="resource-page__pager-actions">{actions}</div>
    </div>
  )
}

export function ResourcePageListRow({
  selected = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  selected?: boolean
}) {
  return (
    <div
      className={cn('ms-frame ms-surface resource-list-surface-item resource-page__list-row', selected && 'resource-list-surface-item--selected', className)}
      data-density="compact"
      data-emphasis={selected ? 'muted' : 'raised'}
      data-kind="item"
      data-selected={selected ? 'true' : undefined}
      {...props}
    />
  )
}

export function ResourcePageListCheckbox({ className, ...props }: ComponentPropsWithoutRef<typeof CheckboxField>) {
  return <CheckboxField className={cn('resource-page__list-checkbox', className)} {...props} />
}

export function ResourceFolderTreeItem({
  active,
  icon,
  label,
  subtitle,
  badge,
  sharedIndicator,
  actions,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: ReactNode
  subtitle?: ReactNode
  badge?: ReactNode
  sharedIndicator?: ReactNode
  actions?: ReactNode
  onClick: () => void
}) {
  return (
    <WorkbenchSurfaceItem asChild active={active} density="compact" className="resource-folder-tree-item">
      <div onClick={onClick}>
        <span className="resource-folder-tree-item__icon">{icon}</span>
        <span className="resource-folder-tree-item__body">
          <span className="resource-folder-tree-item__label">{label}</span>
          {subtitle ? <span className="resource-folder-tree-item__subtitle">{subtitle}</span> : null}
        </span>
        {sharedIndicator}
        {badge}
        {actions}
      </div>
    </WorkbenchSurfaceItem>
  )
}

export const ResourceAssetActionButton = forwardRef<HTMLButtonElement, ButtonProps>(function ResourceAssetActionButton(
  { className, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn('resource-asset-card__action-button', className)}
      {...props}
    />
  )
})

export function ResourceAssetName({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('resource-asset-card__resource-name', className)} {...props} />
}

export function ResourceAssetPreviewFallback({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('resource-asset-card__fallback', className)} {...props} />
}

export function ResourceDangerMenuItem({ className, ...props }: ComponentPropsWithoutRef<typeof DropdownMenuItem>) {
  return <DropdownMenuItem className={cn(toneTextClass('danger'), className)} {...props} />
}

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

export function ResourceFolderOption({
  active,
  icon,
  label,
  sharedIndicator,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: ReactNode
  sharedIndicator?: ReactNode
  onClick: () => void
}) {
  return (
    <WorkbenchListItem active={active} density="compact" onClick={onClick} className="resource-folder-option">
      <span className="resource-folder-option__icon">{icon}</span>
      <span className="resource-folder-option__label">{label}</span>
      {sharedIndicator}
    </WorkbenchListItem>
  )
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

export function ResourceStateMessage({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'info' | 'success' | 'danger'
  className?: string
}) {
  return (
    <AppStateMessage tone={tone} className={cn('resource-state-message', className)}>
      {children}
    </AppStateMessage>
  )
}

export function ResourceContextMenu({
  x,
  y,
  label,
  children,
  className,
  onClick,
}: {
  x: number
  y: number
  label: ReactNode
  children: ReactNode
  className?: string
  onClick?: HTMLAttributes<HTMLDivElement>['onClick']
}) {
  return (
    <AppSurfaceItem
      className={cn('resource-context-menu', className)}
      style={{ left: x, top: y } as CSSProperties}
      onClick={onClick}
    >
      <div className="resource-context-menu__label">{label}</div>
      {children}
    </AppSurfaceItem>
  )
}

export function ResourceContextMenuButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('resource-context-menu__button', className)}
      {...props}
    />
  )
}

export function ResourceSharedIndicator({
  muted,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  muted?: boolean
}) {
  return (
    <span
      className={cn('resource-shared-indicator', muted ? 'resource-shared-indicator--muted' : accentTextClass('blue'), className)}
      {...props}
    />
  )
}
