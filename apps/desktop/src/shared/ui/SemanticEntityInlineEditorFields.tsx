import { AppDisclosure } from '@movscript/ui/business/app'

import type {
  SemanticEntityConfig,
  SourceLockStatus,
} from '@/shared/infrastructure/api/semanticEntities'
import {
  DetailEntityFieldControl,
  DetailEntityFieldGrid,
  DetailEntitySourceLockNotice,
} from '@/shared/ui/SemanticEntityInlineEditorUi'
import {
  isFieldFilled,
  type SemanticEntityInlineFormState,
} from '@/shared/ui/SemanticEntityInlineEditorModel'

export interface SemanticEntityInlineEditorFieldSectionsProps {
  configKind: SemanticEntityConfig['kind']
  idScope?: string
  fields: SemanticEntityConfig['fields']
  basicFields: SemanticEntityConfig['fields']
  advancedFields: SemanticEntityConfig['fields']
  form: SemanticEntityInlineFormState
  lookupOptions: Record<string, Array<{ value: string; label: string }>>
  recordExists: boolean
  isEditing: boolean
  isImmutableRecord: boolean
  lockedFields: Set<string>
  sourceLock?: SourceLockStatus
  sourceLockReason?: string
  advancedTitle: string
  advancedClassName?: string
  columns?: 'responsive'
  onChange: (key: string, value: string | boolean) => void
}

export function SemanticEntityInlineEditorFieldSections({
  configKind,
  idScope,
  fields,
  basicFields,
  advancedFields,
  form,
  lookupOptions,
  recordExists,
  isEditing,
  isImmutableRecord,
  lockedFields,
  sourceLock,
  sourceLockReason,
  advancedTitle,
  advancedClassName,
  columns,
  onChange,
}: SemanticEntityInlineEditorFieldSectionsProps) {
  return (
    <>
      {sourceLock?.locked ? (
        <SourceLockNotice fields={fields} sourceLock={sourceLock} reason={sourceLockReason} />
      ) : null}
      <DetailEntityFieldGrid columns={columns}>
        {basicFields.map((field) => (
          <FieldControl
            key={field.key}
            configKind={configKind}
            idScope={idScope}
            field={field}
            value={form[field.key]}
            optionsOverride={lookupOptions[field.key]}
            disabled={recordExists && (!isEditing || isImmutableRecord || lockedFields.has(field.key))}
            invalid={field.required && !isFieldFilled(form[field.key], field.type)}
            lockReason={lockedFields.has(field.key) ? sourceLockReason : undefined}
            onChange={(value) => onChange(field.key, value)}
          />
        ))}
      </DetailEntityFieldGrid>
      {advancedFields.length > 0 ? (
        <AppDisclosure title={advancedTitle} bodyClassName="detail-entity-field-grid" className={advancedClassName}>
          {advancedFields.map((field) => (
            <FieldControl
              key={field.key}
              configKind={configKind}
              idScope={idScope}
              field={field}
              advanced
              value={form[field.key]}
              optionsOverride={lookupOptions[field.key]}
              disabled={recordExists && (!isEditing || isImmutableRecord || lockedFields.has(field.key))}
              invalid={field.required && !isFieldFilled(form[field.key], field.type)}
              lockReason={lockedFields.has(field.key) ? sourceLockReason : undefined}
              onChange={(value) => onChange(field.key, value)}
            />
          ))}
        </AppDisclosure>
      ) : null}
    </>
  )
}

function FieldControl({
  configKind,
  idScope,
  field,
  value,
  optionsOverride,
  advanced = false,
  disabled = false,
  invalid = false,
  lockReason,
  onChange,
}: {
  configKind: SemanticEntityConfig['kind']
  idScope?: string
  field: SemanticEntityConfig['fields'][number]
  value: string | boolean
  optionsOverride?: Array<{ value: string; label: string }>
  advanced?: boolean
  disabled?: boolean
  invalid?: boolean
  lockReason?: string
  onChange: (value: string | boolean) => void
}) {
  const id = `semantic-inline-${idScope ?? configKind}-${field.key}`
  return (
    <DetailEntityFieldControl
      id={id}
      field={field}
      value={value}
      optionsOverride={optionsOverride}
      advanced={advanced}
      disabled={disabled}
      invalid={invalid}
      lockReason={lockReason}
      onChange={onChange}
    />
  )
}

function SourceLockNotice({ fields, sourceLock, reason }: { fields: SemanticEntityConfig['fields']; sourceLock: SourceLockStatus; reason?: string }) {
  return (
    <DetailEntitySourceLockNotice
      reason={reason ?? '已有下游对象引用当前记录'}
      fieldsText={sourceLock.locked_fields.map((key) => fieldLabel(fields, key)).join('、')}
      suffix="其他内容仍可继续编辑。"
    />
  )
}

function fieldLabel(fields: SemanticEntityConfig['fields'], key: string) {
  return fields.find((field) => field.key === key)?.label ?? key
}
