import { useTranslation } from 'react-i18next'
import { generationParamLabel } from '@movscript/shared'
import type { ParamDef } from '@movscript/shared'
import {
  GenerationParamItem,
  GenerationParamsRow,
} from '@movscript/ui/business/generation'
import { CheckboxField, Input, NativeSelect } from '@movscript/ui/primitives'

export type ContentCanvasGenerationParamValue = string | number | boolean

export interface ContentCanvasGenerationParamControlsProps {
  params: ParamDef[]
  values: Record<string, ContentCanvasGenerationParamValue>
  onChange: (key: string, value: ContentCanvasGenerationParamValue) => void
  className?: string
}

export function ContentCanvasGenerationParamControls({
  params,
  values,
  onChange,
  className,
}: ContentCanvasGenerationParamControlsProps) {
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
