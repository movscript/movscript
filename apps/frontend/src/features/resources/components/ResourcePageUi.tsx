import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'

import { AppContentLayout } from '@movscript/ui/layout'
import {
  Button,
  CheckboxField,
  DropdownMenuItem,
  Input,
  type ButtonProps,
  type IconComponent,
} from '@movscript/ui/primitives'
import {
  AppStateMessage,
  AppSurfaceItem,
} from '@movscript/ui/business/app'
import { WorkbenchListItem, WorkbenchSurfaceItem } from '@movscript/ui/business/workbench'
import { accentTextClass, toneTextClass } from '@movscript/ui/semantic'
import { cn } from '@/shared/ui/cn'
import './ResourcePageUi.css'

export * from '@/features/resources/components/ResourcePageDialogUi'

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
  return <div className={cn('ms-fill ms-center resource-asset-card__fallback', className)} {...props} />
}

export function ResourceDangerMenuItem({ className, ...props }: ComponentPropsWithoutRef<typeof DropdownMenuItem>) {
  return <DropdownMenuItem className={cn(toneTextClass('danger'), className)} {...props} />
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
