import { useTranslation } from 'react-i18next'
import {
  GenerationParamItem,
  GenerationParamsRow,
} from '@movscript/ui/business/generation'
import { CheckboxField, Input, NativeSelect } from '@movscript/ui/primitives'

import { generationParamLabel } from '@/shared/domain/paramLabels'
import type { ParamDef } from '@/types'

export type GenerationParamValue = string | number | boolean

export interface GenerationParamControlsProps {
  params: ParamDef[]
  values: Record<string, GenerationParamValue>
  onChange: (key: string, value: GenerationParamValue) => void
  className?: string
}

export function GenerationParamControls({
  params,
  values,
  onChange,
  className,
}: GenerationParamControlsProps) {
  const { t } = useTranslation()
  if (params.length === 0) return null

  return (
    <GenerationParamsRow className={className}>
      {params.map((param) => {
        const value = values[param.key] ?? param.default ?? ''
        return (
          <GenerationParamItem key={param.key} label={generationParamLabel(param, t)}>
            {param.type === 'select' && param.options ? (
              <NativeSelect
                controlSize="sm"
                className="type-label"
                value={String(value)}
                onChange={(event) => onChange(param.key, event.target.value)}
              >
                {param.options.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </NativeSelect>
            ) : param.type === 'number' ? (
              <Input
                type="number"
                className="h-8 w-20 type-label"
                value={value === '' ? '' : Number(value)}
                min={param.min}
                max={param.max}
                step={param.step ?? 1}
                onChange={(event) => onChange(param.key, event.target.value === '' ? '' : Number(event.target.value))}
              />
            ) : param.type === 'boolean' ? (
              <CheckboxField
                controlSize="sm"
                variant="subtle"
                checked={Boolean(value)}
                onCheckedChange={(checked) => onChange(param.key, checked)}
              />
            ) : param.type === 'string' ? (
              <Input
                type="text"
                className="h-8 w-36 type-label"
                value={String(value)}
                onChange={(event) => onChange(param.key, event.target.value)}
              />
            ) : null}
          </GenerationParamItem>
        )
      })}
    </GenerationParamsRow>
  )
}
