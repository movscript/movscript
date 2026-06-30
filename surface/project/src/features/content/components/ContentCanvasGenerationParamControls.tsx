import { useTranslation } from 'react-i18next'
import { generationParamRequiresValueSatisfied } from '@movscript/core/generation'
import { generationParamLabel } from '@movscript/shared'
import type { ParamDef } from '@movscript/shared'
import { Clock3, Gauge, Hash, Maximize2, RefreshCcw, SlidersHorizontal, ToggleRight, type LucideIcon } from 'lucide-react'
import {
  GenerationParamItem,
  GenerationParamsRow,
} from '@movscript/ui/business/generation'
import { Input, NativeSelect } from '@movscript/ui/primitives'

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
  const visibleParams = params.filter((param) => generationParamRequiresValueSatisfied(param, values))
  if (visibleParams.length === 0) return null

  return (
    <GenerationParamsRow className={className}>
      {visibleParams.map((param) => {
        const value = values[param.key] ?? param.default ?? ''
        const kind = contentCanvasGenerationParamKind(param)
        const Icon = contentCanvasGenerationParamIcon(kind)
        return (
          <GenerationParamItem key={param.key} label={generationParamLabel(param, t)} data-param-kind={kind}>
            <span className="content-canvas-generation-param-control">
              <Icon size={14} aria-hidden="true" />
              {contentCanvasGenerationParamInput({ param, value, kind, onChange })}
            </span>
          </GenerationParamItem>
        )
      })}
    </GenerationParamsRow>
  )
}

function contentCanvasGenerationParamInput({
  param,
  value,
  kind,
  onChange,
}: {
  param: ParamDef
  value: ContentCanvasGenerationParamValue | ''
  kind: ContentCanvasGenerationParamKind
  onChange: (key: string, value: ContentCanvasGenerationParamValue) => void
}) {
  if (param.type === 'boolean') {
    const checked = Boolean(value)
    return (
      <button
        type="button"
        className="content-canvas-generation-param-switch"
        role="switch"
        aria-checked={checked}
        data-state={checked ? 'checked' : 'unchecked'}
        onClick={() => onChange(param.key, !checked)}
      >
        <span />
      </button>
    )
  }

  if (kind === 'seed') {
    return (
      <span className="content-canvas-generation-param-seed">
        <Input
          type="number"
          className="content-canvas-generation-param-input"
          value={value === '' ? '' : Number(value)}
          min={param.min}
          max={param.max}
          step={param.step ?? 1}
          onChange={(event) => onChange(param.key, event.target.value === '' ? '' : Number(event.target.value))}
        />
        <button
          type="button"
          className="content-canvas-generation-param-random"
          aria-label="随机 Seed"
          onClick={() => onChange(param.key, randomSeedValue(param))}
        >
          <RefreshCcw size={13} aria-hidden="true" />
        </button>
      </span>
    )
  }

  if (param.type === 'select' && param.options) {
    return (
      <NativeSelect
        controlSize="sm"
        className="content-canvas-generation-param-select"
        value={String(value)}
        onChange={(event) => onChange(param.key, event.target.value)}
      >
        {param.options.map((option) => (
          <option key={option} value={option}>{contentCanvasGenerationParamOptionLabel(kind, option)}</option>
        ))}
      </NativeSelect>
    )
  }

  if (param.type === 'number') {
    return (
      <Input
        type="number"
        className="content-canvas-generation-param-input"
        value={value === '' ? '' : Number(value)}
        min={param.min}
        max={param.max}
        step={param.step ?? 1}
        onChange={(event) => onChange(param.key, event.target.value === '' ? '' : Number(event.target.value))}
      />
    )
  }

  if (param.type === 'string') {
    return (
      <Input
        type="text"
        className="content-canvas-generation-param-input"
        value={String(value)}
        onChange={(event) => onChange(param.key, event.target.value)}
      />
    )
  }

  return null
}

type ContentCanvasGenerationParamKind = 'aspect' | 'duration' | 'seed' | 'switch' | 'strength' | 'select' | 'number' | 'text'

function contentCanvasGenerationParamKind(param: ParamDef): ContentCanvasGenerationParamKind {
  const key = param.key.trim().toLowerCase()
  const label = param.label.trim().toLowerCase()
  const text = `${key} ${label}`
  if (key === 'seed' || text.includes(' seed')) return 'seed'
  if (text.includes('aspect') || text.includes('ratio') || text.includes('尺寸') || text.includes('画幅') || text.includes('比例')) return 'aspect'
  if (text.includes('duration') || text.includes('秒') || text.includes('时长')) return 'duration'
  if (param.type === 'boolean') return 'switch'
  if (text.includes('motion') || text.includes('strength') || text.includes('quality') || text.includes('强度') || text.includes('质量')) return 'strength'
  if (param.type === 'select') return 'select'
  if (param.type === 'number') return 'number'
  return 'text'
}

function contentCanvasGenerationParamIcon(kind: ContentCanvasGenerationParamKind): LucideIcon {
  if (kind === 'aspect') return Maximize2
  if (kind === 'duration') return Clock3
  if (kind === 'seed') return Hash
  if (kind === 'switch') return ToggleRight
  if (kind === 'strength') return Gauge
  return SlidersHorizontal
}

function contentCanvasGenerationParamOptionLabel(kind: ContentCanvasGenerationParamKind, option: string): string {
  if (kind === 'duration' && /^\d+(?:\.\d+)?$/.test(option.trim())) return `${option}s`
  return option
}

function randomSeedValue(param: ParamDef): number {
  const min = Number.isFinite(param.min) ? Number(param.min) : 1
  const max = Number.isFinite(param.max) ? Number(param.max) : 9999
  return Math.floor(min + Math.random() * Math.max(1, max - min + 1))
}
