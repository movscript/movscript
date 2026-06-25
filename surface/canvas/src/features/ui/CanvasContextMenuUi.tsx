import { Fragment, forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { Button, type ButtonProps } from '@movscript/ui/primitives'
import { AppSurfaceItem } from '@movscript/ui/business/app'
import { cn } from '@movscript/ui/primitives'
import './CanvasContextMenuUi.css'

export type CanvasContextMenuAction = {
  key: string
  icon?: ReactNode
  label: ReactNode
  description?: ReactNode
  tone?: ButtonProps['tone']
  onSelect: () => void
}

export type CanvasContextMenuSection = {
  key: string
  title: ReactNode
  items: CanvasContextMenuAction[]
}

export type CanvasContextMenuViewProps = HTMLAttributes<HTMLDivElement> & {
  actions?: CanvasContextMenuAction[]
  sections: CanvasContextMenuSection[]
}

export const CanvasContextMenuView = forwardRef<HTMLDivElement, CanvasContextMenuViewProps>(({
  actions = [],
  sections,
  ...props
}, ref) => {
  return (
    <CanvasContextMenuRoot ref={ref} {...props}>
      {actions.map((action) => (
        <Fragment key={action.key}>
          <CanvasContextMenuActionItem action={action} />
          <CanvasContextMenuSeparator />
        </Fragment>
      ))}
      {sections.map((section, index) => (
        <Fragment key={section.key}>
          {index > 0 && <CanvasContextMenuSeparator />}
          <CanvasContextMenuSectionTitle>{section.title}</CanvasContextMenuSectionTitle>
          {section.items.map((item) => (
            <CanvasContextMenuActionItem key={item.key} action={item} />
          ))}
        </Fragment>
      ))}
    </CanvasContextMenuRoot>
  )
})

CanvasContextMenuView.displayName = 'CanvasContextMenuView'

function CanvasContextMenuActionItem({
  action,
}: {
  action: CanvasContextMenuAction
}) {
  return (
    <CanvasContextMenuItem
      tone={action.tone}
      onClick={action.onSelect}
      icon={action.icon}
      label={action.label}
      description={action.description}
    />
  )
}

export const CanvasContextMenuRoot = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({
  className,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      role="menu"
      className={cn('ms-menu-content ms-dropdown__content canvas-context-menu', className)}
      {...props}
    />
  )
})

CanvasContextMenuRoot.displayName = 'CanvasContextMenuRoot'

export function CanvasContextMenuSectionTitle({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  children: ReactNode
}) {
  return (
    <p className={cn('canvas-context-menu__section-title', className)} {...props}>
      {children}
    </p>
  )
}

export const CanvasContextMenuItem = forwardRef<HTMLButtonElement, ButtonProps & {
  icon?: ReactNode
  label?: ReactNode
  description?: ReactNode
}>(({ className, icon, label, description, children, variant = 'ghost', size = 'sm', role = 'menuitem', type = 'button', ...props }, ref) => (
  <Button
    ref={ref}
    type={type}
    variant={variant}
    size={size}
    role={role}
    className={cn('canvas-context-menu__item', className)}
    contentClassName="canvas-context-menu__item-content"
    {...props}
  >
    {icon ? <CanvasContextMenuItemIcon>{icon}</CanvasContextMenuItemIcon> : null}
    {label || description ? (
      <span className="canvas-context-menu__item-body">
        {label ? <span className="canvas-context-menu__item-label">{label}</span> : null}
        {description ? <span className="canvas-context-menu__item-description">{description}</span> : null}
      </span>
    ) : children}
  </Button>
))

CanvasContextMenuItem.displayName = 'CanvasContextMenuItem'

export function CanvasContextMenuItemIcon({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
}) {
  return (
    <AppSurfaceItem className={cn('canvas-context-menu__item-icon', className)} {...props}>
      {children}
    </AppSurfaceItem>
  )
}

export function CanvasContextMenuSeparator({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('ms-dropdown__separator canvas-context-menu__separator', className)} {...props} />
}
