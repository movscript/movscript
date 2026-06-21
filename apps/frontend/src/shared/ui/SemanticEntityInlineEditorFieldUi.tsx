import type { FormHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

import { ReviewCallout } from '@movscript/ui/business/review'
import { CheckboxField, Input, Label, NativeSelect, Textarea } from '@movscript/ui/primitives'
import { toneTextClass } from '@movscript/ui/semantic'

import { cn } from '@/shared/ui/cn'

type DetailEntityFieldType = 'text' | 'textarea' | 'select' | 'number' | 'boolean' | string
type DetailEntityFieldValue = string | boolean

interface DetailEntityFieldOption {
  value: string
  label: string
}

interface DetailEntityFieldDefinition {
  key: string
  label: string
  type: DetailEntityFieldType
  required?: boolean
  placeholder?: string
  helper?: string
  options?: DetailEntityFieldOption[]
}

export function DetailEntityFieldControl({
  id,
  field,
  value,
  optionsOverride,
  advanced = false,
  disabled = false,
  invalid = false,
  lockReason,
  checkboxLabel = '启用',
  emptyOptionLabel = '未设置',
  className,
  onChange,
}: {
  id: string
  field: DetailEntityFieldDefinition
  value: DetailEntityFieldValue
  optionsOverride?: DetailEntityFieldOption[]
  advanced?: boolean
  disabled?: boolean
  invalid?: boolean
  lockReason?: string
  checkboxLabel?: ReactNode
  emptyOptionLabel?: ReactNode
  className?: string
  onChange: (value: DetailEntityFieldValue) => void
}) {
  return (
    <div className={cn(field.type === 'textarea' && 'detail-entity-field--wide', className)}>
      <Label htmlFor={id} required={field.required}>{field.label}</Label>
      <div className="detail-entity-field__control">
        {field.type === 'textarea' ? (
          <Textarea
            id={id}
            required={field.required}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            value={String(value ?? '')}
            rows={field.key.endsWith('_json') ? 5 : advanced ? 3 : 4}
            placeholder={field.placeholder}
            className={field.key.endsWith('_json') ? 'font-mono type-label' : undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : field.type === 'select' || optionsOverride ? (
          <NativeSelect
            id={id}
            required={field.required}
            disabled={disabled}
            invalid={invalid}
            value={String(value ?? '')}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">{emptyOptionLabel}</option>
            {(optionsOverride ?? field.options)?.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </NativeSelect>
        ) : field.type === 'boolean' ? (
          <CheckboxField
            disabled={disabled}
            checked={Boolean(value)}
            inputProps={{ id, required: field.required }}
            onCheckedChange={onChange}
          >
            {checkboxLabel}
          </CheckboxField>
        ) : (
          <Input
            id={id}
            required={field.required}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            type={field.type === 'number' ? 'number' : 'text'}
            step={field.type === 'number' ? 'any' : undefined}
            value={String(value ?? '')}
            placeholder={field.placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </div>
      {lockReason ? (
        <p className={cn('detail-entity-field__help detail-entity-field__help--locked', toneTextClass('warning'))}>{lockReason}</p>
      ) : field.helper ? (
        <p className="detail-entity-field__help">{field.helper}</p>
      ) : null}
    </div>
  )
}

export function DetailEntityForm({
  children,
  divided = false,
  className,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & {
  divided?: boolean
}) {
  return (
    <form className={cn('detail-entity-form', divided && 'detail-entity-form--divided', className)} {...props}>
      {children}
    </form>
  )
}

export function DetailEntityFieldGrid({
  children,
  columns = 'single',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  columns?: 'single' | 'responsive'
}) {
  return (
    <div data-columns={columns} className={cn('detail-entity-field-grid', className)} {...props}>
      {children}
    </div>
  )
}

export function DetailEntitySourceLockNotice({
  title = '来源已锁定',
  reason,
  fieldsText,
  suffix,
  compact = true,
}: {
  title?: ReactNode
  reason?: ReactNode
  fieldsText: ReactNode
  suffix: ReactNode
  compact?: boolean
}) {
  return (
    <ReviewCallout tone="warning" compact={compact}>
      <p className={cn('detail-entity-lock-notice__title', toneTextClass('warning'))}>{title}</p>
      <p className={cn('detail-entity-lock-notice__body', toneTextClass('warning'))}>
        {reason}。已锁定字段：{fieldsText}；{suffix}
      </p>
    </ReviewCallout>
  )
}
