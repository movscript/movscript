import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

import { AppAvatar } from '@movscript/ui/business/app'
import { Button, type ButtonProps } from '@movscript/ui/primitives'

import { cn } from '@/shared/ui/cn'

import './UserProfilePageUi.css'

export function UserProfileShell({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('account-profile', className)} {...props} />
}

export function UserProfileHeader({
  title,
  description,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  title: ReactNode
  description?: ReactNode
}) {
  return (
    <div className={cn('account-profile-header', className)} {...props}>
      <h1 className="account-profile-header__title">{title}</h1>
      {description ? <p className="account-profile-header__description">{description}</p> : null}
    </div>
  )
}

export function UserProfileCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('account-profile-card', className)} {...props} />
}

export function UserProfileIdentity({
  name,
  role,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  name?: string | null
  role: ReactNode
}) {
  return (
    <div className={cn('account-profile-identity', className)} {...props}>
      <AppAvatar size="lg" name={name ?? undefined} />
      <span className="account-profile-identity__copy">
        <span className="account-profile-identity__name">{name}</span>
        <span className="account-profile-identity__role">{role}</span>
      </span>
    </div>
  )
}

export function UserProfileActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('account-profile-actions', className)} {...props} />
}

export const UserProfileLogoutButton = forwardRef<HTMLButtonElement, ButtonProps & {
  icon?: ReactNode
}>(({ icon, children, className, variant = 'ghost', tone = 'danger', ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant={variant}
    tone={tone}
    className={cn('account-profile-logout-button', className)}
    {...props}
  >
    {icon ? <span className="account-profile-logout-button__icon">{icon}</span> : null}
    {children}
  </Button>
))

UserProfileLogoutButton.displayName = 'UserProfileLogoutButton'
