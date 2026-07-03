import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AdapterDef, ParamDef } from '@admin/types'
import {
  PARAM_TEMPLATES,
  adapterParamsForOperation,
  emptyModelOperationParamProfile,
  nextOperationBuilderParam,
  operationProfileParams,
  paramTemplateFor,
  parseModelOperationParamProfile,
  serializeModelOperationParamProfile,
  setOperationProfileParams,
  splitOptions,
} from '@admin/lib/modelParamContract'
import { Button, Input, Label } from '@movscript/ui/primitives'

export type CatalogParamOperation = {
  capability: string
  operation: string
}

function paramTemplateLabel(key: string, fallback: string, t: (key: string, values?: Record<string, unknown>) => string) {
  return t(`admin.params.templates.${key}`, { defaultValue: fallback })
}

function operationLabel(operation: string, t: (key: string, values?: Record<string, unknown>) => string) {
  return t(`admin.modelOperations.${operation}`, { defaultValue: operation })
}

export function CatalogParamBuilder({
  value,
  onChange,
  operations,
  adapter,
}: {
  value: string
  onChange: (next: string) => void
  operations: CatalogParamOperation[]
  adapter?: AdapterDef
}) {
  const { t } = useTranslation()
  const profile = useMemo(() => parseModelOperationParamProfile(value), [value])
  const firstOperation = operations[0]?.operation ?? ''
  const [activeOperation, setActiveOperation] = useState(firstOperation)

  useEffect(() => {
    if (!activeOperation || !operations.some((item) => item.operation === activeOperation)) {
      setActiveOperation(firstOperation)
    }
  }, [activeOperation, firstOperation, operations])

  const active = operations.find((item) => item.operation === activeOperation)
  const activeParams = active ? operationProfileParams(profile, active.operation) : []
  const adapterParams = active ? adapterParamsForOperation(adapter, active.capability, active.operation) : []
  const adapterParamKeys = new Set(adapterParams.map((param) => param.key))
  const operationCounts = new Map(
    operations.map((item) => [item.operation, operationProfileParams(profile, item.operation).length] as const),
  )

  function updateParams(nextParams: ParamDef[]) {
    if (!active) return
    const nextProfile = setOperationProfileParams(profile.version === 2 ? profile : emptyModelOperationParamProfile(), active.operation, nextParams)
    onChange(serializeModelOperationParamProfile(nextProfile))
  }

  function update(index: number, patch: Partial<ParamDef>) {
    updateParams(activeParams.map((param, i) => i === index ? { ...param, ...patch } : param))
  }

  function remove(index: number) {
    updateParams(activeParams.filter((_, i) => i !== index))
  }

  function add() {
    const candidate = nextOperationBuilderParam(activeParams, adapterParams)
    const template = paramTemplateFor(candidate.key)
    const next = {
      ...candidate,
      label: template ? paramTemplateLabel(template.key, candidate.label || template.label, t) : candidate.label,
    }
    updateParams([...activeParams, next])
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('admin.params.title')}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
            {t('admin.params.operationBuilderHint', { defaultValue: '按 operation 维护模型参数契约；adapter 负责把这些 canonical 参数解释成 provider 请求。' })}
          </p>
        </div>
        <button type="button" onClick={add} disabled={!active} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40">
          <Plus size={11} /> {t('admin.params.add')}
        </button>
      </div>

      {operations.length === 0 ? (
        <p className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted-foreground/70">
          {t('admin.params.noOperations', { defaultValue: '请先在模型能力配置中选择 operation。' })}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {operations.map((item) => {
            const selected = item.operation === activeOperation
            const count = operationCounts.get(item.operation) ?? 0
            return (
              <button
                key={`${item.capability}:${item.operation}`}
                type="button"
                onClick={() => setActiveOperation(item.operation)}
                className={[
                  'rounded-md border px-2 py-1 text-left text-[11px] transition-colors',
                  selected ? 'border-ring bg-ring/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                <span className="block max-w-44 truncate">{operationLabel(item.operation, t)}</span>
                <span className="block font-mono text-[10px] opacity-70">{count} params</span>
              </button>
            )
          })}
        </div>
      )}

      {active && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">{active.capability} / {active.operation}</span>
            <span>{adapter ? adapter.display_name : t('admin.params.noAdapterDefaults')}</span>
          </div>
          {activeParams.length === 0 && (
            <p className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted-foreground/70">
              {t('admin.params.emptyOperation', { defaultValue: '当前 operation 未配置模型参数；留空时会继承 adapter 对该 operation 的默认参数。' })}
            </p>
          )}
          {activeParams.map((param, index) => (
            <div key={`${param.key}-${index}`} className="space-y-2 rounded border border-border bg-background p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="mb-0.5 block text-xs text-muted-foreground">{t('admin.params.abstractParam')}</Label>
                  <select
                    value={paramTemplateFor(param.key) ? param.key : '__custom'}
                    onChange={(event) => {
                      const template = PARAM_TEMPLATES[event.target.value]
                      if (template) update(index, { ...template, label: paramTemplateLabel(template.key, template.label, t) })
                    }}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {adapterParams.map((template) => (
                      <option key={template.key} value={template.key}>{paramTemplateLabel(template.key, template.label, t)}</option>
                    ))}
                    {Object.values(PARAM_TEMPLATES).filter((template) => !adapterParamKeys.has(template.key)).map((template) => (
                      <option key={template.key} value={template.key}>{paramTemplateLabel(template.key, template.label, t)}</option>
                    ))}
                    {!paramTemplateFor(param.key) && <option value="__custom">{param.label || param.key}</option>}
                  </select>
                </div>
                <div>
                  <Label className="mb-0.5 block text-xs text-muted-foreground">{t('admin.params.displayName')}</Label>
                  <Input className="text-xs" value={param.label} onChange={(event) => update(index, { label: event.target.value })} placeholder={t('admin.params.displayNamePlaceholder')} />
                </div>
              </div>
              <ParamControlFields param={param} onChange={(patch) => update(index, patch)} onRemove={() => remove(index)} t={t} />
              <ParamRuleSummary param={param} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ParamControlFields({
  param,
  onChange,
  onRemove,
  t,
}: {
  param: ParamDef
  onChange: (patch: Partial<ParamDef>) => void
  onRemove: () => void
  t: (key: string, values?: Record<string, unknown>) => string
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <Label className="mb-0.5 block text-xs text-muted-foreground">{t('admin.params.controlType')}</Label>
        <select
          value={param.type}
          onChange={(event) => onChange({
            type: event.target.value as ParamDef['type'],
            options: event.target.value === 'select' ? (param.options?.length ? param.options : ['16:9', '9:16']) : undefined,
          })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="select">{t('admin.params.controlTypes.select')}</option>
          <option value="number">{t('admin.params.controlTypes.number')}</option>
          <option value="boolean">{t('admin.params.controlTypes.boolean')}</option>
          <option value="string">{t('admin.params.controlTypes.string')}</option>
        </select>
      </div>
      {param.type === 'select' && (
        <>
          <div className="min-w-48 flex-1">
            <Label className="mb-0.5 block text-xs text-muted-foreground">{t('admin.params.options')}</Label>
            <Input
              className="font-mono text-xs"
              value={(param.options ?? []).join(', ')}
              onChange={(event) => onChange({ options: splitOptions(event.target.value) })}
              placeholder="16:9, 9:16, 1:1"
            />
          </div>
          <div className="w-32">
            <Label className="mb-0.5 block text-xs text-muted-foreground">{t('admin.params.defaultValue')}</Label>
            <Input className="font-mono text-xs" value={String(param.default ?? '')} onChange={(event) => onChange({ default: event.target.value })} />
          </div>
        </>
      )}
      {param.type === 'number' && (
        <>
          {(['default', 'min', 'max', 'step'] as const).map((key) => (
            <div key={key} className="w-20">
              <Label className="mb-0.5 block text-xs text-muted-foreground">{key}</Label>
              <Input
                type="number"
                className="text-xs"
                value={String(param[key] ?? '')}
                onChange={(event) => onChange({ [key]: event.target.value === '' ? undefined : Number(event.target.value) } as Partial<ParamDef>)}
              />
            </div>
          ))}
        </>
      )}
      {param.type === 'boolean' && (
        <label className="flex h-8 cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={Boolean(param.default)} onChange={(event) => onChange({ default: event.target.checked })} className="rounded" />
          {t('admin.params.defaultOn')}
        </label>
      )}
      {param.type === 'string' && (
        <div className="w-48">
          <Label className="mb-0.5 block text-xs text-muted-foreground">{t('admin.params.defaultValue')}</Label>
          <Input className="font-mono text-xs" value={String(param.default ?? '')} onChange={(event) => onChange({ default: event.target.value })} />
        </div>
      )}
      <Button type="button" variant="ghost" size="icon" intent="danger" onClick={onRemove} className="h-8 w-8" title={t('common.delete')}>
        <Trash2 size={14} />
      </Button>
    </div>
  )
}

function ParamRuleSummary({ param }: { param: ParamDef }) {
  const ruleLabels = [
    param.conflicts_with?.length ? `conflicts ${param.conflicts_with.length}` : '',
    param.conditional_enum?.length ? `conditional enum ${param.conditional_enum.length}` : '',
    param.conditional_const?.length ? `conditional const ${param.conditional_const.length}` : '',
    param.requires_value?.length ? `requires value ${param.requires_value.length}` : '',
  ].filter(Boolean)
  if (ruleLabels.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
      {ruleLabels.map((label) => (
        <span key={label} className="rounded border border-border bg-card px-1.5 py-0.5">{label}</span>
      ))}
    </div>
  )
}
