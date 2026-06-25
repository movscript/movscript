import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { AppEmptyState, AppKeyValue, AppPanel, AppSurfaceItem } from '@movscript/ui/business/app'
import { Button } from '@movscript/ui/primitives'
import { accentGradientClass, type AccentTone } from '@movscript/ui/semantic'

import { cn } from '@/shared/ui/cn'
import './SemanticEntityInlineEditorUi.css'

export {
  DetailEntityFieldControl,
  DetailEntityFieldGrid,
  DetailEntityForm,
  DetailEntitySourceLockNotice,
} from '@/shared/ui/SemanticEntityInlineEditorFieldUi'

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
