import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Calculator, Link2, Lock, Save } from 'lucide-react'
import { api } from '@/lib/api'
import type {
  CanvasEntityKind,
  EntitySchemaMigrationReport,
  EntitySemanticSchema,
  EntitySemanticSchemaField,
  EntitySemanticValues,
  ResourceBindingOwnerType,
  ResourceBindingRole,
} from '@/types'
import { Button, Input, Label, Textarea } from '@movscript/ui'
import { ResourceAttachments } from '@/components/shared/ResourceAttachments'
import { cn } from '@/lib/utils'

type EntityDraft = Record<string, any>

interface EntitySemanticFormProps {
  kind: CanvasEntityKind
  ownerType: ResourceBindingOwnerType
  ownerId: number
  draft: EntityDraft
  onChange: (draft: EntityDraft) => void
  onSave: (payload: EntityDraft) => void
  isSaving?: boolean
  className?: string
  includeFields?: string[]
  excludeFields?: string[]
  showSave?: boolean
  fieldRenderers?: Record<string, (ctx: EntitySemanticFieldRenderContext) => React.ReactNode>
  renderBefore?: ReactNode
  renderAfter?: ReactNode
}

export interface EntitySemanticFieldRenderContext {
  field: EntitySemanticSchemaField
  label: string
  value: unknown
  draft: EntityDraft
  setValue: (value: unknown) => void
  setDraft: (draft: EntityDraft) => void
  readonly: boolean
  defaultField: ReactNode
}

export function EntitySemanticForm({
  kind,
  ownerType,
  ownerId,
  draft,
  onChange,
  onSave,
  isSaving,
  className,
  includeFields,
  excludeFields,
  showSave = true,
  fieldRenderers,
  renderBefore,
  renderAfter,
}: EntitySemanticFormProps) {
  const { t } = useTranslation()
  const includeSet = useMemo(() => new Set(includeFields ?? []), [includeFields])
  const excludeSet = useMemo(() => new Set(excludeFields ?? []), [excludeFields])

  const { data: schema } = useQuery<EntitySemanticSchema>({
    queryKey: ['entity-semantic-schema', kind],
    queryFn: () => api.get(`/entities/semantic-schemas/${kind}`).then((r) => r.data),
  })
  const { data: semanticValues } = useQuery<EntitySemanticValues>({
    queryKey: ['entity-semantic-values', kind, ownerId],
    queryFn: () => api.get(`/entities/${kind}/${ownerId}/semantic-values`).then((r) => r.data),
    enabled: ownerId > 0,
  })
  const { data: migrationReport } = useQuery<EntitySchemaMigrationReport>({
    queryKey: ['entity-schema-migration-report', kind],
    queryFn: () => api.get(`/entities/semantic-schemas/${kind}/migration-report`).then((r) => r.data),
  })

  const visibleSections = useMemo(() => {
    if (!schema) return []
    return schema.sections.map((section) => ({
      ...section,
      fields: section.fields.filter((field) => {
        if (includeSet.size > 0 && !includeSet.has(field.id)) return false
        if (excludeSet.has(field.id)) return false
        if (field.deprecated) return false
        if (field.binding) return true
        if (isSemanticDisplayField(field)) return field.io.readable
        return isSemanticSavableField(field)
      }),
    })).filter((section) => section.fields.length > 0)
  }, [draft, excludeSet, includeSet, schema])

  function setField(field: EntitySemanticSchemaField, value: unknown) {
    onChange({ ...draft, [field.id]: value })
  }

  function buildPayload(): EntityDraft {
    const payload: EntityDraft = {}
    visibleSections.forEach((section) => {
      section.fields.forEach((field) => {
        if (!isSemanticSavableField(field)) return
        payload[field.id] = draft[field.id]
      })
    })
    return payload
  }

  return (
    <div className={cn('h-full overflow-y-auto p-5 space-y-4', className)}>
      {renderBefore}
      {schema && (
        <SchemaCompatibilityNotice schema={schema} migrationReport={migrationReport} />
      )}
      {visibleSections.map((section) => (
        <div key={section.id} className="space-y-3">
          {visibleSections.length > 1 && (
            <p className="text-xs font-medium text-muted-foreground">
              {t(section.labelKey, { defaultValue: section.fallbackLabel })}
            </p>
          )}
          <div className="space-y-3">
            {section.fields.map((field) => (
              <SemanticField
                key={field.id}
                field={field}
                ownerType={ownerType}
                ownerId={ownerId}
                draft={draft}
                value={semanticFieldValue(field, draft, semanticValues?.values)}
                onChange={(value) => setField(field, value)}
                onDraftChange={onChange}
                renderer={fieldRenderers?.[field.id]}
              />
            ))}
          </div>
        </div>
      ))}
      {renderAfter}
      {showSave && (
        <Button onClick={() => onSave(buildPayload())} disabled={isSaving || !hasSavableFields(visibleSections)} className="w-full gap-1.5" size="sm">
          <Save size={13} /> {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      )}
    </div>
  )
}

function SchemaCompatibilityNotice({
  schema,
  migrationReport,
}: {
  schema: EntitySemanticSchema
  migrationReport?: EntitySchemaMigrationReport
}) {
  const { t } = useTranslation()
  const aliases = migrationReport?.fieldAliases ?? schema.compatibility?.fieldAliases
  const aliasCount = aliases ? Object.values(aliases).reduce((sum, items) => sum + items.length, 0) : 0
  const deprecatedCount = (migrationReport?.deprecatedFields ?? schema.compatibility?.deprecatedFields ?? []).length
  const migrations = migrationReport?.migrations ?? schema.compatibility?.migrations ?? []
  if (aliasCount === 0 && deprecatedCount === 0 && migrations.length === 0) return null

  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {t('canvas.nodePanel.schemaProjection', { defaultValue: 'projection' })}: {schema.projection ?? 'semantic'}
        </span>
        <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
          v{migrationReport?.currentVersion ?? schema.compatibility?.currentVersion ?? schema.schemaVersion}
        </span>
        {aliasCount > 0 && (
          <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {t('canvas.nodePanel.schemaAliases', { defaultValue: 'aliases' })}: {aliasCount}
          </span>
        )}
        {migrations.length > 0 && (
          <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {t('canvas.nodePanel.schemaMigrations', { defaultValue: 'migrations' })}: {migrations.length}
          </span>
        )}
        {deprecatedCount > 0 && (
          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
            {t('common.deprecated', { defaultValue: 'deprecated' })}: {deprecatedCount}
          </span>
        )}
      </div>
      {migrationReport?.actions?.length ? (
        <div className="mt-2 space-y-1">
          {migrationReport.actions.slice(0, 3).map((action, index) => (
            <p key={`${action.kind}-${action.fieldId ?? action.fromFieldId ?? index}`} className="text-[10px] text-muted-foreground">
              <span className="font-medium text-foreground">{action.kind}</span>
              {action.fromFieldId || action.toFieldId ? ` · ${action.fromFieldId ?? '?'} -> ${action.toFieldId ?? '?'}` : ''}
              {action.description ? ` · ${action.description}` : ''}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SemanticField({
  field,
  ownerType,
  ownerId,
  draft,
  value,
  onChange,
  onDraftChange,
  renderer,
}: {
  field: EntitySemanticSchemaField
  ownerType: ResourceBindingOwnerType
  ownerId: number
  draft: EntityDraft
  value: unknown
  onChange: (value: unknown) => void
  onDraftChange: (draft: EntityDraft) => void
  renderer?: (ctx: EntitySemanticFieldRenderContext) => ReactNode
}) {
  const { t } = useTranslation()
  const label = t(field.labelKey, { defaultValue: field.fallbackLabel })
  const readonly = isSemanticDisplayField(field)

  const defaultField = renderDefaultSemanticField({ field, ownerType, ownerId, value, onChange, label, t })
  if (renderer) {
    return (
      <>
        {renderer({
          field,
          label,
          value,
          draft,
          setValue: onChange,
          setDraft: onDraftChange,
          readonly,
          defaultField,
        })}
      </>
    )
  }

  return <>{defaultField}</>
}

function renderDefaultSemanticField({
  field,
  ownerType,
  ownerId,
  value,
  onChange,
  label,
  t,
}: {
  field: EntitySemanticSchemaField
  ownerType: ResourceBindingOwnerType
  ownerId: number
  value: unknown
  onChange: (value: unknown) => void
  label: string
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  if (field.binding) {
    return (
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{label}</Label>
        <ResourceAttachments
          ownerType={ownerType}
          ownerId={ownerId}
          role={field.binding.role as ResourceBindingRole}
          slot={field.binding.slot}
          variant={field.control === 'resource_gallery' || field.binding.multiple ? 'gallery' : 'picker'}
          maxCount={field.io.maxCount}
        />
      </div>
    )
  }

  if (field.control === 'related_entity_list') {
    return <RelatedEntityListField field={field} label={label} value={value} t={t} />
  }

  if (isSemanticDisplayField(field)) {
    return <ReadonlySemanticField field={field} label={label} value={value} t={t} />
  }

  if (field.control === 'textarea' || field.control === 'json_editor') {
    return (
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{label}</Label>
        <Textarea
          className={cn(field.control === 'json_editor' && 'font-mono')}
          rows={field.control === 'json_editor' ? 4 : 3}
          value={stringValue(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    )
  }

  if (field.valueType === 'number' || field.control === 'number') {
    return (
      <div>
        <Label className="text-xs font-medium text-muted-foreground mb-1">{label}</Label>
        <Input
          type="number"
          value={numberInputValue(value)}
          onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
        />
      </div>
    )
  }

  if (field.valueType === 'boolean' || field.control === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{label}</span>
      </label>
    )
  }

  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground mb-1">{label}</Label>
      <Input value={stringValue(value)} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function ReadonlySemanticField({
  field,
  label,
  value,
  t,
}: {
  field: EntitySemanticSchemaField
  label: string
  value: unknown
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <FieldStateBadge field={field} t={t} />
      </div>
      <ReadonlyValue value={value} emptyLabel={t('common.emptyDescription')} />
    </div>
  )
}

function RelatedEntityListField({
  field,
  label,
  value,
  t,
}: {
  field: EntitySemanticSchemaField
  label: string
  value: unknown
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const items = arrayValue(value)
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <span className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <Link2 size={10} />
          {t('common.related', { defaultValue: 'related' })}
        </span>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.slice(0, 8).map((item, index) => (
            <RelatedEntityCard key={relatedEntityKey(item, index)} item={item} index={index} kind={field.layout?.nestedKind} />
          ))}
          {items.length > 8 && (
            <p className="text-[11px] text-muted-foreground">
              {t('common.itemsCount', { count: items.length })}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('common.emptyDescription')}</p>
      )}
    </div>
  )
}

function RelatedEntityCard({ item, index, kind }: { item: unknown; index: number; kind?: string }) {
  const { t } = useTranslation()
  const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
  const title = relatedEntityLabel(item, index, kind)
  const status = relatedEntityStatus(item)
  const description = stringRecordValue(record.description) || stringRecordValue(record.prompt)
  const meta = relatedEntityMeta(record, kind, t)

  return (
    <div className="rounded border border-border/70 bg-background px-2.5 py-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{title}</p>
          {meta && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta}</p>}
        </div>
        {status && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{status}</span>}
      </div>
      {description && <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{description}</p>}
    </div>
  )
}

function FieldStateBadge({ field, t }: { field: EntitySemanticSchemaField; t: (key: string, options?: Record<string, unknown>) => string }) {
  if (field.control === 'computed') {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
        <Calculator size={10} />
        {t('common.computed', { defaultValue: 'computed' })}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
      <Lock size={10} />
      {t('common.readonly', { defaultValue: 'read-only' })}
    </span>
  )
}

function ReadonlyValue({ value, emptyLabel }: { value: unknown; emptyLabel: string }) {
  if (value === null || value === undefined || value === '') {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>
  }
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return (
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-background px-2 py-1.5 text-xs text-foreground">
        {stringValue(value)}
      </pre>
    )
  }
  return <p className="whitespace-pre-wrap break-words text-sm text-foreground">{stringValue(value)}</p>
}

function isSemanticDisplayField(field: EntitySemanticSchemaField) {
  return field.readonly || !field.io.writable || field.control === 'readonly_text' || field.control === 'computed' || field.control === 'related_entity_list'
}

function isSemanticSavableField(field: EntitySemanticSchemaField) {
  return field.io.writable && !field.readonly && !field.deprecated && !field.binding && field.control !== 'readonly_text' && field.control !== 'computed' && field.control !== 'related_entity_list'
}

function semanticFieldValue(field: EntitySemanticSchemaField, draft: EntityDraft, values?: Record<string, unknown>) {
  if (isSemanticDisplayField(field)) {
    return values && Object.prototype.hasOwnProperty.call(values, field.id) ? values[field.id] : draft[field.id]
  }
  return draft[field.id]
}

function hasSavableFields(sections: Array<{ fields: EntitySemanticSchemaField[] }>) {
  return sections.some((section) => section.fields.some(isSemanticSavableField))
}

function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function relatedEntityKey(item: unknown, index: number) {
  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>
    return String(record.ID ?? record.id ?? index)
  }
  return String(item ?? index)
}

function relatedEntityLabel(item: unknown, index: number, kind?: string) {
  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>
    const id = record.ID ?? record.id
    const title = record.title ?? record.name ?? record.description
    const ordinal = record.number ?? record.order
    if (title) return id ? `#${id} ${String(title)}` : String(title)
    if (ordinal) return kind ? `${kind} ${ordinal}` : `#${ordinal}`
    if (id) return `#${id}`
  }
  if (typeof item === 'number' || typeof item === 'string') return `#${item}`
  return `#${index + 1}`
}

function relatedEntityStatus(item: unknown) {
  if (!item || typeof item !== 'object') return ''
  const status = (item as Record<string, unknown>).status
  return typeof status === 'string' ? status : ''
}

function relatedEntityMeta(record: Record<string, unknown>, kind: string | undefined, t: (key: string, options?: Record<string, unknown>) => string) {
  if (kind === 'storyboard') {
    const count = record.shots_count
    return typeof count === 'number' ? t('common.shotsCount', { count, defaultValue: '{{count}} shots' }) : ''
  }
  if (kind === 'shot') {
    const storyboardId = record.storyboard_id
    return storyboardId ? t('common.storyboardRef', { id: storyboardId, defaultValue: 'storyboard #{{id}}' }) : ''
  }
  if (kind === 'scene') {
    return [stringRecordValue(record.location), stringRecordValue(record.time_of_day)].filter(Boolean).join(' · ')
  }
  return ''
}

function stringRecordValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function numberInputValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return typeof value === 'number' ? value : Number(value) || ''
}
