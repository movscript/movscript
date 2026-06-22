import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

import { AppChoiceTile, AppSection, AppSurfaceItem } from '@movscript/ui/business/app'
import { Button, Input, Label, type ButtonProps, type IconComponent, type InputProps } from '@movscript/ui/primitives'
import { toneTextClass, type SemanticTone } from '@movscript/ui/semantic'

import { cn } from '@/shared/ui/cn'
import './AppSettingsUi.css'

export type AppSettingsFeedbackTone = 'neutral' | 'success' | 'danger'

export function AppSettingsShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('app-settings-shell', className)} {...props} />
}

export function AppSettingsHeader({
  back,
  icon: Icon,
  title,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  back: ReactNode
  icon?: IconComponent
  title: ReactNode
}) {
  return (
    <header className={cn('app-settings-header', className)} {...props}>
      <div className="app-settings-header__inner">
        {back}
        <div className="app-settings-header__title">
          {Icon ? <Icon size={16} /> : null}
          {title}
        </div>
      </div>
    </header>
  )
}

export const AppSettingsBackButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="sm"
      className={cn('app-settings-back-button', className)}
      {...props}
    />
  ),
)

AppSettingsBackButton.displayName = 'AppSettingsBackButton'

export function AppSettingsMain({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main className={cn('app-settings-main', className)} {...props} />
}

export function AppSettingsContentStack({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('app-settings-content-stack', className)} {...props} />
}

export function AppSettingsIntro({
  title,
  description,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode
  description: ReactNode
}) {
  return (
    <div className={cn('app-settings-intro', className)} {...props}>
      <h1 className="app-settings-intro__title">{title}</h1>
      <p className="app-settings-intro__description">{description}</p>
    </div>
  )
}

export function AppSettingsSection({ className, ...props }: Parameters<typeof AppSection>[0]) {
  return <AppSection className={cn('app-settings-section', className)} {...props} />
}

export function AppSettingsChoiceGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('app-settings-choice-grid', className)} {...props} />
}

export const AppSettingsChoiceTile = forwardRef<HTMLButtonElement, ButtonProps & {
  selected?: boolean
  icon?: ReactNode
  title: ReactNode
  detail?: ReactNode
  footer?: ReactNode
}>(({ selected = false, icon, title, detail, footer, className, ...props }, ref) => (
  <AppChoiceTile
    ref={ref}
    selected={selected}
    variant={selected ? 'soft' : 'ghost'}
    className={cn('app-settings-choice-tile', className)}
    {...props}
  >
    {icon ? <span className="app-settings-choice-tile__icon">{icon}</span> : null}
    <span className="app-settings-choice-tile__copy">
      <span className="app-settings-choice-tile__title">
        {title}
      </span>
      {detail ? <span className="app-settings-choice-tile__detail">{detail}</span> : null}
    </span>
    {footer ? <span className="app-settings-choice-tile__footer">{footer}</span> : null}
  </AppChoiceTile>
))

AppSettingsChoiceTile.displayName = 'AppSettingsChoiceTile'

export function AppSettingsField({
  label,
  htmlFor,
  help,
  error,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: ReactNode
  htmlFor: string
  help?: ReactNode
  error?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={cn('app-settings-field', className)} {...props}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {help ? <p className="app-settings-field__help">{help}</p> : null}
      {error ? <AppSettingsFeedbackText tone="danger">{error}</AppSettingsFeedbackText> : null}
    </div>
  )
}

export const AppSettingsInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => <Input ref={ref} className={cn('app-settings-input', className)} {...props} />,
)

AppSettingsInput.displayName = 'AppSettingsInput'

export function AppSettingsInfoSurface({
  children,
  muted = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  muted?: boolean
}) {
  return (
    <AppSurfaceItem
      variant={muted ? 'muted' : 'card'}
      className={cn('app-settings-info-surface', muted && 'app-settings-info-surface--muted', className)}
      {...props}
    >
      {children}
    </AppSurfaceItem>
  )
}

export function AppSettingsEndpointSurface({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <AppSettingsInfoSurface muted>
      {label}: <span className="app-settings-endpoint-value">{value}</span>
    </AppSettingsInfoSurface>
  )
}

export function AppSettingsAdminSurface({
  label,
  url,
  action,
  help,
}: {
  label: ReactNode
  url: ReactNode
  action: ReactNode
  help: ReactNode
}) {
  return (
    <AppSettingsInfoSurface className="app-settings-admin-surface">
      <div className="app-settings-admin-surface__header">
        <span>
          {label}: <span className="app-settings-endpoint-value">{url}</span>
        </span>
        {action}
      </div>
      <p className="app-settings-admin-surface__help">{help}</p>
    </AppSettingsInfoSurface>
  )
}

export function AppSettingsFeedbackText({
  tone = 'neutral',
  icon,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  tone?: AppSettingsFeedbackTone
  icon?: ReactNode
}) {
  return (
    <p
      data-has-icon={icon ? 'true' : undefined}
      className={cn('app-settings-feedback', tone !== 'neutral' ? toneTextClass(appSettingsFeedbackSemanticTone(tone)) : undefined, className)}
      {...props}
    >
      {icon}
      {children}
    </p>
  )
}

export function AppSettingsActionRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('app-settings-action-row', className)} {...props} />
}

export const AppSettingsActionButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => <Button ref={ref} className={cn('app-settings-action-button', className)} {...props} />,
)

AppSettingsActionButton.displayName = 'AppSettingsActionButton'

export function AppSettingsFooterText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('app-settings-footer-text', className)} {...props} />
}

function appSettingsFeedbackSemanticTone(tone: Exclude<AppSettingsFeedbackTone, 'neutral'>): SemanticTone {
  if (tone === 'danger') return 'danger'
  return 'success'
}
