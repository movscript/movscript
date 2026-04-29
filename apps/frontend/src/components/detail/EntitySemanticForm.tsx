import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Save } from 'lucide-react'
import { api } from '@/lib/api'
import type {
  CanvasEntityKind,
  EntitySemanticSchema,
  EntitySemanticSchemaField,
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

  const editableFields = useMemo(() => {
    if (!schema) return []
    return schema.sections.map((section) => ({
      ...section,
      fields: section.fields.filter((field) => {
        if (includeSet.size > 0 && !includeSet.has(field.id)) return false
        if (excludeSet.has(field.id)) return false
        if (!field.io.writable || field.readonly || field.deprecated) return false
        if (field.binding) return true
        return Object.prototype.hasOwnProperty.call(draft, field.id)
      }),
    })).filter((section) => section.fields.length > 0)
  }, [draft, excludeSet, includeSet, schema])

  function setField(field: EntitySemanticSchemaField, value: unknown) {
    onChange({ ...draft, [field.id]: value })
  }

  function buildPayload(): EntityDraft {
    const payload: EntityDraft = {}
    editableFields.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.binding) return
        payload[field.id] = draft[field.id]
      })
    })
    return payload
  }

  return (
    <div className={cn('h-full overflow-y-auto p-5 space-y-4', className)}>
      {renderBefore}
      {editableFields.map((section) => (
        <div key={section.id} className="space-y-3">
          {editableFields.length > 1 && (
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
                value={draft[field.id]}
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
        <Button onClick={() => onSave(buildPayload())} disabled={isSaving} className="w-full gap-1.5" size="sm">
          <Save size={13} /> {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      )}
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

  const defaultField = renderDefaultSemanticField({ field, ownerType, ownerId, value, onChange, label })
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
}: {
  field: EntitySemanticSchemaField
  ownerType: ResourceBindingOwnerType
  ownerId: number
  value: unknown
  onChange: (value: unknown) => void
  label: string
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
        />
      </div>
    )
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
