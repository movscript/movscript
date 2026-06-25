import { forwardRef, useState, type ComponentProps, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { AppInlineMeta, AppStateMessage } from '@movscript/ui/business/app'
import { Button, Input, Label } from '@movscript/ui/primitives'
import { cn } from '@/shared/ui/cn'
import './AuthPageUi.css'

export function AuthRoot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('auth-root', className)} {...props} />
}

export function AuthPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('auth-panel', className)} {...props} />
}

export function AuthBrandMark({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('auth-brand-mark', className)} {...props} />
}

export function AuthTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn('auth-title', className)} {...props} />
}

export function AuthTagline({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('auth-tagline', className)} {...props} />
}

export function AuthStateMessage({ className, ...props }: ComponentProps<typeof AppStateMessage>) {
  return <AppStateMessage className={cn('auth-state-message', className)} {...props} />
}

export function AuthSettingsButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button size="icon" variant="outline" className={cn('auth-settings-button', className)} {...props} />
}

export function AuthTabs({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('auth-tabs', className)} {...props} />
}

export function AuthTabButton({
  active,
  className,
  ...props
}: ComponentProps<typeof Button> & {
  active?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn('auth-tab-button', active && 'auth-tab-button--active', className)}
      {...props}
    />
  )
}

export function AuthFormStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('auth-form-stack', className)} {...props} />
}

export function AuthField({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('auth-field', className)} {...props} />
}

export function AuthEmailCodeField({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('auth-email-code-field', className)} {...props} />
}

export function AuthEmailCodeRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('auth-email-code-row', className)} {...props} />
}

export function AuthLabel({
  screenReaderOnly = false,
  className,
  ...props
}: ComponentProps<typeof Label> & {
  screenReaderOnly?: boolean
}) {
  return <Label className={cn(screenReaderOnly && 'auth-screen-reader-only', className)} {...props} />
}

export function AuthInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input className={cn('auth-input', className)} {...props} />
}

export function AuthPasswordInput({
  placeholder,
  value,
  onChange,
  onKeyDown,
  showLabel,
  hideLabel,
}: {
  placeholder: string
  value: string
  onChange: (value: string) => void
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
  showLabel: string
  hideLabel: string
}) {
  const [show, setShow] = useState(false)

  return (
    <div className="auth-password-field">
      <AuthInput
        placeholder={placeholder}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="auth-password-field__input"
      />
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        onClick={() => setShow((current) => !current)}
        className="auth-password-field__toggle"
        tabIndex={-1}
        aria-label={show ? hideLabel : showLabel}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </Button>
    </div>
  )
}

export function AuthActionButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button className={cn('auth-action-button', className)} {...props} />
}

export function AuthSubmitButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button className={cn('auth-submit-button', className)} {...props} />
}

export function AuthFooterText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('auth-footer-text', className)} {...props} />
}

export function AuthRegisterPrompt({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('auth-register-prompt', className)} {...props} />
}

export function AuthWorkModeRoot({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('auth-work-mode-root', className)} {...props} />
}

export function AuthWorkModePanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('auth-work-mode-panel', className)} {...props} />
}

export function AuthInlineMeta({ className, ...props }: ComponentProps<typeof AppInlineMeta>) {
  return <AppInlineMeta className={cn('auth-inline-meta', className)} {...props} />
}

export function AuthInlineLinkButton({ className, ...props }: ComponentProps<typeof Button>) {
  return <Button size="xs" variant="link" className={cn('auth-inline-link-button', className)} {...props} />
}

export const AuthTurnstileSlot = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('auth-turnstile', className)} {...props} />,
)
AuthTurnstileSlot.displayName = 'AuthTurnstileSlot'

export type AuthPasswordInputProps = ComponentProps<typeof AuthPasswordInput>
export type AuthTabValue = string
export type AuthNode = ReactNode
