import {
  copyFiniteNumber,
  integerModelField,
  isJSONScalar,
  stringArrayModelField,
} from '../modelContracts'
import { isRecord } from '../valueUtils'
import { modelCapabilityCandidates } from './routing'
import { normalizeGenerationInputRequirements } from './preflight'
import { backendList } from './utils'
import type { GenerationModelParam, GenerationModelParamContract, GenerationModelParamRules } from './types'

export async function getGenerationModelParamContract(modelConfigId: number, jobType: string): Promise<GenerationModelParamContract | undefined> {
  for (const capability of modelCapabilityCandidates(jobType)) {
    const models = await backendList(`/models?capability=${encodeURIComponent(capability)}`)
    const model = models.find((item) => Number(item?.id ?? item?.ID) === modelConfigId)
    if (!model) continue
    const schema = isRecord(model.params_schema) ? model.params_schema : undefined
    const params = Array.isArray(model.supported_params) ? model.supported_params : undefined
    const supportedParamKeys = new Set<string>(
      params
        ? params.flatMap((param: unknown) => {
            if (!isRecord(param) || typeof param.key !== 'string' || !param.key.trim()) return []
            return [param.key.trim()]
          })
        : Object.keys(isRecord(schema?.properties) ? schema.properties : {}),
    )
    return {
      supportedParamKeys,
      supportedParams: buildGenerationModelParams(params, schema),
      rules: buildGenerationModelParamRules(params),
      inputRequirements: normalizeGenerationInputRequirements(model.input_requirements),
      paramsSchemaLoaded: !!schema,
      ...(Array.isArray(schema?.allOf) ? { paramsSchemaRuleCount: schema.allOf.length } : {}),
    }
  }
  return undefined
}

function buildGenerationModelParams(params: unknown[] | undefined, schema: Record<string, unknown> | undefined): Map<string, GenerationModelParam> {
  const out = new Map<string, GenerationModelParam>()
  const properties = isRecord(schema?.properties) ? schema.properties : {}
  if (params) {
    for (const param of params) {
      const item = compactGenerationModelParam(param)
      if (!item) continue
      mergeSchemaPropertyIntoModelParam(item, properties[item.key])
      out.set(item.key, item)
    }
  }
  for (const [key, property] of Object.entries(properties)) {
    if (out.has(key)) continue
    const item: GenerationModelParam = { key }
    mergeSchemaPropertyIntoModelParam(item, property)
    out.set(key, item)
  }
  return out
}

function compactGenerationModelParam(param: unknown): GenerationModelParam | undefined {
  if (!isRecord(param) || typeof param.key !== 'string' || !param.key.trim()) return undefined
  const out: GenerationModelParam = { key: param.key.trim() }
  if (typeof param.type === 'string' && param.type.trim()) out.type = param.type.trim()
  if (Array.isArray(param.options)) {
    const options = stringArrayModelField(param.options)
    if (options.length > 0) out.options = options
  }
  copyFiniteNumber(out as unknown as Record<string, unknown>, param, 'min')
  copyFiniteNumber(out as unknown as Record<string, unknown>, param, 'max')
  copyFiniteNumber(out as unknown as Record<string, unknown>, param, 'step')
  return out
}

// Exported for MCP contract tests; runtime uses this to normalize compact v1 rules for non-blocking preflight audits.
export function buildGenerationModelParamRules(params: unknown[] | undefined): GenerationModelParamRules {
  const rules: GenerationModelParamRules = { conflicts: [], conditionalEnums: [], conditionalConsts: [], requiresValues: [] }
  const conflictPairs = new Set<string>()
  for (const param of params ?? []) {
    if (!isRecord(param) || typeof param.key !== 'string' || !param.key.trim()) continue
    const key = param.key.trim()
    if (Array.isArray(param.conflicts_with)) {
      for (const other of param.conflicts_with) {
        if (typeof other !== 'string' || !other.trim()) continue
        const otherKey = other.trim()
        const pairKey = [key, otherKey].sort().join('\u0000')
        if (conflictPairs.has(pairKey)) continue
        conflictPairs.add(pairKey)
        rules.conflicts.push({ key, other: otherKey })
      }
    }
    if (Array.isArray(param.conditional_enum)) {
      for (const item of param.conditional_enum) {
        if (!isRecord(item) || typeof item.when_param !== 'string' || !item.when_param.trim() || !isJSONScalar(item.when_value)) continue
        const options = Array.isArray(item.options) ? item.options.filter((option): option is string => typeof option === 'string' && option.trim().length > 0) : []
        if (options.length > 0) rules.conditionalEnums.push({ key, whenParam: item.when_param.trim(), whenValue: item.when_value, options })
      }
    }
    if (Array.isArray(param.conditional_const)) {
      for (const item of param.conditional_const) {
        if (!isRecord(item) || typeof item.when_param !== 'string' || !item.when_param.trim() || !isJSONScalar(item.when_value) || !isJSONScalar(item.value)) continue
        rules.conditionalConsts.push({ key, whenParam: item.when_param.trim(), whenValue: item.when_value, value: item.value })
      }
    }
    if (Array.isArray(param.requires_value)) {
      for (const item of param.requires_value) {
        if (!isRecord(item) || typeof item.param !== 'string' || !item.param.trim() || !isJSONScalar(item.value)) continue
        rules.requiresValues.push({ key, param: item.param.trim(), value: item.value })
      }
    }
  }
  return rules
}

function mergeSchemaPropertyIntoModelParam(out: GenerationModelParam, property: unknown): void {
  if (!isRecord(property)) return
  if (typeof property.type === 'string' && !out.type) out.type = property.type
  if (Array.isArray(property.enum)) {
    const values = property.enum.filter(isJSONScalar)
    if (values.length > 0) {
      if (values.every((value) => typeof value === 'string')) out.options = values
      else out.enum = values
    }
  }
  copyFiniteNumber(out as unknown as Record<string, unknown>, property, 'minimum', 'min')
  copyFiniteNumber(out as unknown as Record<string, unknown>, property, 'maximum', 'max')
  copyFiniteNumber(out as unknown as Record<string, unknown>, property, 'multipleOf', 'step')
}
