import type { ComponentPropsWithoutRef, FormHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

import { AppEmptyState, AppKeyValue, AppPanel, AppSurfaceItem } from '@movscript/ui/business/app'
import { ReviewCallout } from '@movscript/ui/business/review'
import { Button, CheckboxField, Input, Label, NativeSelect, Textarea } from '@movscript/ui/primitives'
import { accentGradientClass, toneTextClass, type AccentTone } from '@movscript/ui/semantic'

import { cn } from '@/shared/ui/cn'
import './SemanticEntityInlineEditorUi.css'

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

interface DetailEntityEditorActionIcons {
  collapse?: ReactNode
  expand?: ReactNode
  edit?: ReactNode
  delete?: ReactNode
  cancel?: ReactNode
  save?: ReactNode
}

interface DetailEntityEditorStat {
  label: string
  value: ReactNode
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

export function DetailEntityEditorActions({
  mode,
  canCollapse = false,
  collapsed = false,
  collapsedMode = 'vertical',
  canEdit = true,
  canDelete = false,
  canSave = true,
  deleting = false,
  saving = false,
  disabled = false,
  overlay = false,
  formId,
  icons = {},
  collapseLabel,
  expandLabel = '展开',
  editLabel = '编辑',
  deleteLabel = '删除',
  cancelLabel = '取消',
  saveLabel = '保存',
  onToggleCollapsed,
  onEdit,
  onDelete,
  onCancel,
  className,
}: {
  mode: 'view' | 'edit'
  canCollapse?: boolean
  collapsed?: boolean
  collapsedMode?: 'vertical' | 'horizontal'
  canEdit?: boolean
  canDelete?: boolean
  canSave?: boolean
  deleting?: boolean
  saving?: boolean
  disabled?: boolean
  overlay?: boolean
  formId?: string
  icons?: DetailEntityEditorActionIcons
  collapseLabel?: ReactNode
  expandLabel?: ReactNode
  editLabel?: ReactNode
  deleteLabel?: ReactNode
  cancelLabel?: ReactNode
  saveLabel?: ReactNode
  onToggleCollapsed?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onCancel?: () => void
  className?: string
}) {
  const collapseIcon = collapsed ? icons.expand : collapsedMode === 'horizontal' ? icons.expand : icons.collapse
  const toggleLabel = collapsed ? expandLabel : collapseLabel ?? '收起'

  return (
    <div className={cn('detail-entity-editor-actions', overlay && 'detail-entity-editor-actions--overlay', className)}>
      {canCollapse ? (
        <Button type="button" size="sm" variant="outline" className="detail-entity-editor-actions__secondary" onClick={onToggleCollapsed}>
          {collapseIcon}
          {toggleLabel}
        </Button>
      ) : null}
      {mode === 'view' ? (
        <>
          {canEdit ? (
            <Button size="sm" variant="outline" className="detail-entity-editor-actions__secondary" onClick={onEdit} disabled={disabled || deleting}>
              {icons.edit}
              {editLabel}
            </Button>
          ) : null}
          {canDelete ? (
            <Button type="button" size="sm" variant="solid" tone="danger" onClick={onDelete} loading={deleting}>
              {icons.delete}
              {deleteLabel}
            </Button>
          ) : null}
        </>
      ) : (
        <>
          {canDelete ? (
            <Button type="button" size="sm" variant="solid" tone="danger" onClick={onDelete} loading={deleting}>
              {icons.delete}
              {deleteLabel}
            </Button>
          ) : null}
          {onCancel ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="detail-entity-editor-actions__secondary"
              onClick={onCancel}
              disabled={disabled || saving || deleting}
            >
              {icons.cancel}
              {cancelLabel}
            </Button>
          ) : null}
          <Button
            type="submit"
            form={formId}
            size="sm"
            loading={saving}
            disabled={!canSave || disabled || deleting}
          >
            {icons.save}
            {saveLabel}
          </Button>
        </>
      )}
    </div>
  )
}

export function DetailEntityEditorHeader({
  title,
  description,
  requiredHint,
  actions,
  hideCopy = false,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  requiredHint?: ReactNode
  actions?: ReactNode
  hideCopy?: boolean
  className?: string
}) {
  return (
    <div className={cn('detail-entity-editor-header', hideCopy && 'detail-entity-editor-header--actions-only', className)}>
      {hideCopy ? null : (
        <div className="detail-entity-editor-header__copy">
          <p className="detail-entity-editor-header__title">{title}</p>
          {description ? <p className="detail-entity-editor-header__description">{description}</p> : null}
          {requiredHint ? <p className="detail-entity-editor-header__hint">{requiredHint}</p> : null}
        </div>
      )}
      {actions ? <div className="detail-entity-editor-header__actions">{actions}</div> : null}
    </div>
  )
}

export function DetailEntityEditorHero({
  icon,
  eyebrow,
  title,
  subtitle,
  summary,
  description,
  status,
  actions,
  stats,
  compact = false,
  collapsed = false,
  accentTone = 'neutral',
  accentClassName,
  className,
  children,
}: {
  icon?: ReactNode
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  summary?: ReactNode
  description?: ReactNode
  status?: ReactNode
  actions?: ReactNode
  stats?: DetailEntityEditorStat[]
  compact?: boolean
  collapsed?: boolean
  accentTone?: AccentTone
  accentClassName?: string
  className?: string
  children?: ReactNode
}) {
  return (
    <AppPanel className={className} bodyClassName="detail-entity-editor-shell">
      <div className={cn('detail-entity-editor-hero', compact && 'detail-entity-editor-hero--compact', !compact && accentGradientClass(accentTone), accentClassName)}>
        <div className="detail-entity-editor-hero__layout">
          <div className="detail-entity-editor-hero__content">
            <div className="detail-entity-editor-hero__lead">
              {icon ? (
                <AppSurfaceItem className="detail-entity-editor-hero__icon" variant={compact ? 'muted' : 'overlay'}>
                  {icon}
                </AppSurfaceItem>
              ) : null}
              <div className="detail-entity-editor-hero__copy">
                {eyebrow ? <div className="detail-entity-editor-hero__eyebrow">{eyebrow}</div> : null}
                <h2 className="detail-entity-editor-hero__title">{title}</h2>
                {subtitle ? <div className="detail-entity-editor-hero__subtitle">{subtitle}</div> : null}
              </div>
            </div>
            {summary ? <div className="detail-entity-editor-hero__summary">{summary}</div> : null}
          </div>
          {(status || actions) ? (
            <div className="detail-entity-editor-hero__aside">
              {status}
              {actions}
            </div>
          ) : null}
        </div>
        {description ? <p className="detail-entity-editor-hero__description">{description}</p> : null}
      </div>
      {!collapsed && stats?.length ? <DetailEntityEditorStats stats={stats} compact={compact} /> : null}
      {children}
    </AppPanel>
  )
}

export function DetailEntityEditorShell({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <AppPanel className={className} bodyClassName="detail-entity-editor-shell">
      {children}
    </AppPanel>
  )
}

export function DetailEntityEditorEmptyState({
  title,
  detail,
  className,
}: {
  title: ReactNode
  detail?: ReactNode
  className?: string
}) {
  return (
    <AppPanel className={className} bodyClassName="detail-entity-editor-shell">
      <AppEmptyState title={title} detail={detail} compact />
    </AppPanel>
  )
}

export function DetailEntityHorizontalRail({
  title,
  subtitle,
  icon,
  expandLabel,
  onExpand,
  className,
  ...props
}: {
  title: ReactNode
  subtitle: ReactNode
  icon: ReactNode
  expandLabel: string
  onExpand: () => void
  className?: string
} & Omit<ComponentPropsWithoutRef<typeof AppPanel>, 'icon'>) {
  return (
    <AppPanel className={className} bodyClassName="detail-entity-rail" {...props}>
      <Button
        type="button"
        variant="ghost"
        className="detail-entity-rail__button"
        title={expandLabel}
        aria-label={expandLabel}
        onClick={onExpand}
      >
        <AppSurfaceItem className="detail-entity-rail__icon">
          {icon}
        </AppSurfaceItem>
        <span className="detail-entity-rail__title-wrap">
          <span className="detail-entity-rail__title">{title}</span>
        </span>
        <span className="detail-entity-rail__subtitle">{subtitle}</span>
      </Button>
    </AppPanel>
  )
}

function DetailEntityEditorStats({
  stats,
  compact = false,
}: {
  stats: DetailEntityEditorStat[]
  compact?: boolean
}) {
  return (
    <div className={cn('detail-entity-editor-stats', compact && 'detail-entity-editor-stats--compact')}>
      {stats.map((stat) => (
        <AppKeyValue key={stat.label} label={stat.label} value={stat.value} strong />
      ))}
    </div>
  )
}
