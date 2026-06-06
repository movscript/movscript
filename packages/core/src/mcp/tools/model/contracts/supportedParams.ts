import { isRecord } from '../../shared/record.js'
import {
  copyFiniteNumber,
  isJSONScalar,
  stringArrayModelField,
} from './utils'

export function summarizeSupportedParamsForAgent(supportedParams: unknown[], schema: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  const properties = isRecord(schema?.properties) ? schema.properties : undefined
  const params = supportedParams
    .map((param) => summarizeSupportedParamDefForAgent(param, properties))
    .filter((param): param is Record<string, unknown> => !!param)
  if (params.length > 0) return params

  if (!properties) return []
  return Object.entries(properties)
    .map(([key, property]) => summarizeSchemaPropertyForAgent(key, property))
    .filter((param): param is Record<string, unknown> => !!param)
}

function summarizeSupportedParamDefForAgent(param: unknown, schemaProperties: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!isRecord(param) || typeof param.key !== 'string' || !param.key.trim()) return undefined
  const out: Record<string, unknown> = { key: param.key.trim() }
  if (typeof param.label === 'string' && param.label.trim()) out.label = param.label.trim()
  if (typeof param.type === 'string' && param.type.trim()) out.type = param.type.trim()
  if (Array.isArray(param.options)) {
    const options = stringArrayModelField(param.options)
    if (options.length > 0) out.options = options
  }
  if (param.default !== undefined) out.default = param.default
  copyFiniteNumber(out, param, 'min')
  copyFiniteNumber(out, param, 'max')
  copyFiniteNumber(out, param, 'step')
  copyStringArray(out, param, 'conflicts_with')
  copyConditionalEnumRules(out, param)
  copyConditionalConstRules(out, param)
  copyRequiresValueRules(out, param)
  mergeSchemaPropertySummary(out, schemaProperties?.[out.key as string])
  return out
}

function summarizeSchemaPropertyForAgent(key: string, property: unknown): Record<string, unknown> | undefined {
  const trimmedKey = key.trim()
  if (!trimmedKey || !isRecord(property)) return undefined
  const out: Record<string, unknown> = { key: trimmedKey }
  if (typeof property.type === 'string' && property.type.trim()) out.type = property.type.trim()
  copySchemaEnum(out, property)
  if (property.default !== undefined) out.default = property.default
  copyFiniteNumber(out, property, 'minimum', 'min')
  copyFiniteNumber(out, property, 'maximum', 'max')
  copyFiniteNumber(out, property, 'multipleOf', 'step')
  if (typeof property.description === 'string' && property.description.trim()) out.description = property.description.trim()
  return out
}

function mergeSchemaPropertySummary(out: Record<string, unknown>, property: unknown): void {
  if (!isRecord(property)) return
  copySchemaEnum(out, property)
  copyFiniteNumber(out, property, 'minimum', 'min')
  copyFiniteNumber(out, property, 'maximum', 'max')
  copyFiniteNumber(out, property, 'multipleOf', 'step')
  if (property.default !== undefined && out.default === undefined) out.default = property.default
  if (typeof property.description === 'string' && property.description.trim()) out.description = property.description.trim()
}

function copySchemaEnum(out: Record<string, unknown>, property: Record<string, unknown>): void {
  if (!Array.isArray(property.enum)) return
  const values = property.enum.filter(isJSONScalar)
  if (values.length === 0) return
  if (values.every((value) => typeof value === 'string')) out.options = values
  else out.enum = values
}

function copyStringArray(out: Record<string, unknown>, source: Record<string, unknown>, key: string): void {
  const value = source[key]
  if (!Array.isArray(value)) return
  const items = stringArrayModelField(value)
  if (items.length > 0) out[key] = items
}

function copyConditionalEnumRules(out: Record<string, unknown>, source: Record<string, unknown>): void {
  const value = source.conditional_enum
  if (!Array.isArray(value)) return
  const rules = value.flatMap((item) => {
    if (!isRecord(item)) return []
    const whenParam = typeof item.when_param === 'string' ? item.when_param.trim() : ''
    const options = Array.isArray(item.options) ? item.options.filter((option): option is string => typeof option === 'string') : []
    if (!whenParam || !isJSONScalar(item.when_value) || options.length === 0) return []
    return [{
      when_param: whenParam,
      when_value: item.when_value,
      options,
    }]
  })
  if (rules.length > 0) out.conditional_enum = rules
}

function copyConditionalConstRules(out: Record<string, unknown>, source: Record<string, unknown>): void {
  const value = source.conditional_const
  if (!Array.isArray(value)) return
  const rules = value.flatMap((item) => {
    if (!isRecord(item)) return []
    const whenParam = typeof item.when_param === 'string' ? item.when_param.trim() : ''
    if (!whenParam || !isJSONScalar(item.when_value) || !isJSONScalar(item.value)) return []
    return [{
      when_param: whenParam,
      when_value: item.when_value,
      value: item.value,
    }]
  })
  if (rules.length > 0) out.conditional_const = rules
}

function copyRequiresValueRules(out: Record<string, unknown>, source: Record<string, unknown>): void {
  const value = source.requires_value
  if (!Array.isArray(value)) return
  const rules = value.flatMap((item) => {
    if (!isRecord(item)) return []
    const param = typeof item.param === 'string' ? item.param.trim() : ''
    if (!param || !isJSONScalar(item.value)) return []
    return [{
      param,
      value: item.value,
    }]
  })
  if (rules.length > 0) out.requires_value = rules
}
