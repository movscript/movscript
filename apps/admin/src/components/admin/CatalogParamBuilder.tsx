import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ParamDef } from '@/types'
import {
  PARAM_TEMPLATES,
  paramTemplateFor,
  parseParamDefs,
  serializeParamDefs,
  splitOptions,
} from '@admin/lib/modelParamContract'
import { Button, Input, Label } from '@movscript/ui/primitives'

function paramTemplateLabel(key: string, fallback: string, t: (key: string, values?: Record<string, unknown>) => string) {
  return t(`admin.params.templates.${key}`, { defaultValue: fallback })
}

export function CatalogParamBuilder({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { t } = useTranslation()
  const params = parseParamDefs(value)
  const update = (index: number, patch: Partial<ParamDef>) => {
    const next = params.map((param, i) => i === index ? { ...param, ...patch } : param)
    onChange(serializeParamDefs(next))
  }
  const remove = (index: number) => onChange(serializeParamDefs(params.filter((_, i) => i !== index)))
  const add = () => onChange(serializeParamDefs([
    ...params,
    { ...PARAM_TEMPLATES.aspect_ratio, label: paramTemplateLabel('aspect_ratio', PARAM_TEMPLATES.aspect_ratio.label, t) },
  ]))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('admin.params.title')}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
            {t('admin.params.builderHint', { defaultValue: '用列表维护模型支持的参数；保存时会自动生成后端需要的参数契约。' })}
          </p>
        </div>
        <button type="button" onClick={add} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Plus size={11} /> {t('admin.params.add')}
        </button>
      </div>
      {params.length === 0 && (
        <p className="rounded border border-dashed border-border px-3 py-2 text-xs text-muted-foreground/70">
          {t('admin.params.empty')}
        </p>
      )}
      {params.map((param, index) => (
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
                {Object.values(PARAM_TEMPLATES).map((template) => (
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
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="mb-0.5 block text-xs text-muted-foreground">{t('admin.params.controlType')}</Label>
              <select
                value={param.type}
                onChange={(event) => update(index, {
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
                    onChange={(event) => update(index, { options: splitOptions(event.target.value) })}
                    placeholder="16:9, 9:16, 1:1"
                  />
                </div>
                <div className="w-32">
                  <Label className="mb-0.5 block text-xs text-muted-foreground">{t('admin.params.defaultValue')}</Label>
                  <Input className="font-mono text-xs" value={String(param.default ?? '')} onChange={(event) => update(index, { default: event.target.value })} />
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
                      onChange={(event) => update(index, { [key]: event.target.value === '' ? undefined : Number(event.target.value) } as Partial<ParamDef>)}
                    />
                  </div>
                ))}
              </>
            )}
            {param.type === 'boolean' && (
              <label className="flex h-8 cursor-pointer items-center gap-2 text-xs">
                <input type="checkbox" checked={Boolean(param.default)} onChange={(event) => update(index, { default: event.target.checked })} className="rounded" />
                {t('admin.params.defaultOn')}
              </label>
            )}
            {param.type === 'string' && (
              <div className="w-48">
                <Label className="mb-0.5 block text-xs text-muted-foreground">{t('admin.params.defaultValue')}</Label>
                <Input className="font-mono text-xs" value={String(param.default ?? '')} onChange={(event) => update(index, { default: event.target.value })} />
              </div>
            )}
            <Button type="button" variant="ghost" size="sm" intent="danger" onClick={() => remove(index)} className="h-8 px-2 text-xs">
              {t('common.delete')}
            </Button>
          </div>
          <ParamRuleSummary param={param} />
        </div>
      ))}
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
