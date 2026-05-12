import type { AdapterDef, ModelParamProfile, ParamDef } from '@/types'

export type ParamContractAudit = {
  mode: 'inherit' | 'profile' | 'override' | 'none'
  params: ParamDef[]
  errors: string[]
  warnings: string[]
  schemaRuleCount: number
}

export const PARAM_TEMPLATES: Record<string, ParamDef> = {
  aspect_ratio: { key: 'aspect_ratio', label: 'Aspect Ratio', type: 'select', options: ['16:9', '9:16', '1:1', '4:3', '3:4'], default: '16:9' },
  duration: { key: 'duration', label: 'Duration (seconds)', type: 'select', options: ['5', '6', '8', '10', '15', '20'], default: '5' },
  image_size: { key: 'image_size', label: 'Image Size', type: 'select', options: ['1024x1024', '1536x1024', '1024x1536', '1280x720', '720x1280'], default: '1024x1024' },
  resolution: { key: 'resolution', label: 'Resolution', type: 'select', options: ['480p', '720p', '1080p'], default: '720p' },
  quality: { key: 'quality', label: 'Quality', type: 'select', options: ['auto', 'standard', 'hd', 'high', 'medium', 'low'], default: 'auto' },
  style: { key: 'style', label: 'Style', type: 'select', options: ['vivid', 'natural'], default: 'vivid' },
  seed: { key: 'seed', label: 'Seed', type: 'number', default: -1, min: -1, max: 2147483647, step: 1 },
  prompt_strength: { key: 'prompt_strength', label: 'Prompt Strength', type: 'number', default: 2.5, min: 1, max: 10, step: 0.1 },
  watermark: { key: 'watermark', label: 'Watermark', type: 'boolean', default: false },
  image_count: { key: 'image_count', label: 'Image Count', type: 'number', default: 1, min: 1, max: 15, step: 1 },
  output_format: { key: 'output_format', label: 'Output Format', type: 'select', options: ['jpeg', 'png', 'webp'], default: 'jpeg' },
  web_search: { key: 'web_search', label: 'Web Search', type: 'boolean', default: false },
  fixed_camera: { key: 'fixed_camera', label: 'Fixed Camera', type: 'boolean', default: false },
  audio: { key: 'audio', label: 'Generate Audio', type: 'boolean', default: true },
  return_last_frame: { key: 'return_last_frame', label: 'Return Last Frame', type: 'boolean', default: false },
  service_tier: { key: 'service_tier', label: 'Service Tier', type: 'select', options: ['default', 'flex'], default: 'default' },
  frames: { key: 'frames', label: 'Frames', type: 'number', min: 29, max: 289, step: 4 },
  execution_expires_after: { key: 'execution_expires_after', label: 'Expiration (seconds)', type: 'number', min: 1, step: 1 },
  preset: { key: 'preset', label: 'Preset', type: 'select', options: ['normal', 'fun', 'spicy', 'custom'], default: 'normal' },
  draft: { key: 'draft', label: 'Draft Mode', type: 'boolean', default: false },
  max_tokens: { key: 'max_tokens', label: 'Max Tokens', type: 'number', min: 1, max: 1000000, step: 1 },
  temperature: { key: 'temperature', label: 'Temperature', type: 'number', default: -1, min: -1, max: 2, step: 0.1 },
  json_mode: { key: 'json_mode', label: 'JSON Mode', type: 'boolean', default: false },
  sequential_image_generation: { key: 'sequential_image_generation', label: 'Sequential Images', type: 'select', options: ['disabled', 'auto'], default: 'disabled' },
  optimize_prompt_mode: { key: 'optimize_prompt_mode', label: 'Prompt Optimization', type: 'select', options: ['standard', 'fast'], default: 'standard' },
}

export function parseParamDefs(value: string): ParamDef[] {
  if (!value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((p) => p && typeof p.key === 'string' && typeof p.label === 'string')
      .map(normalizeParamDefForAdmin)
  } catch {
    return []
  }
}

export function normalizeParamDefForAdmin(p: ParamDef): ParamDef {
  const alias: Record<string, string> = {
    ratio: 'aspect_ratio',
    size: 'image_size',
    guidance_scale: 'prompt_strength',
    max_images: 'image_count',
    camera_fixed: 'fixed_camera',
    generate_audio: 'audio',
  }
  const key = alias[p.key] ?? p.key
  const tmpl = PARAM_TEMPLATES[key]
  if (!tmpl) return p
  return {
    ...tmpl,
    ...p,
    key,
    label: p.label || tmpl.label,
  }
}

export function serializeParamDefs(params: ParamDef[]): string {
  const normalized = params
    .map((p) => {
      p = normalizeParamDefForAdmin(p)
      const key = p.key.trim()
      if (!key) return null
      const label = (p.label || key).trim()
      const next: ParamDef = { key, label, type: p.type || 'select' }
      if (next.type === 'select') {
        next.options = (p.options ?? []).map(String).map((s) => s.trim()).filter(Boolean)
        if (p.default !== undefined && p.default !== '') next.default = String(p.default)
      }
      if (next.type === 'number') {
        if (p.default !== undefined && p.default !== '') next.default = Number(p.default)
        if (p.min !== undefined && String(p.min) !== '') next.min = Number(p.min)
        if (p.max !== undefined && String(p.max) !== '') next.max = Number(p.max)
        if (p.step !== undefined && String(p.step) !== '') next.step = Number(p.step)
      }
      if (next.type === 'boolean') {
        const defaultValue = booleanDefaultForSerialization(p.default)
        if (defaultValue !== undefined) next.default = defaultValue
      }
      if (next.type === 'string') {
        if (p.default !== undefined && p.default !== '') next.default = String(p.default)
      }
      if (p.json_schema && typeof p.json_schema === 'object' && !Array.isArray(p.json_schema)) {
        next.json_schema = p.json_schema
      }
      if (Array.isArray(p.conflicts_with)) {
        next.conflicts_with = p.conflicts_with.map(String).map((s) => s.trim()).filter(Boolean)
      }
      if (Array.isArray(p.conditional_enum)) {
        next.conditional_enum = p.conditional_enum
          .map((item) => ({
            when_param: String(item.when_param ?? '').trim(),
            when_value: item.when_value,
            options: (item.options ?? []).map(String).map((s) => s.trim()).filter(Boolean),
          }))
          .filter((item) => item.when_param && item.options.length > 0)
      }
      if (Array.isArray(p.conditional_const)) {
        next.conditional_const = p.conditional_const
          .map((item) => ({
            when_param: String(item.when_param ?? '').trim(),
            when_value: item.when_value,
            value: item.value,
          }))
          .filter((item) => item.when_param)
      }
      if (Array.isArray(p.requires_value)) {
        next.requires_value = p.requires_value
          .map((item) => ({
            param: String(item.param ?? '').trim(),
            value: item.value,
          }))
          .filter((item) => item.param)
      }
      return next
    })
    .filter(Boolean) as ParamDef[]
  return JSON.stringify(normalized)
}

function booleanDefaultForSerialization(value: ParamDef['default']): boolean | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return undefined
}

export function emptyParamProfile(): ModelParamProfile {
  return { deny: [], override: {}, add: [] }
}

export function parseModelParamProfile(value: string): ModelParamProfile {
  if (!value.trim()) return emptyParamProfile()
  try {
    const parsed = JSON.parse(value)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return emptyParamProfile()
    const raw = parsed as ModelParamProfile
    const profile: ModelParamProfile = {}
    if (Array.isArray(raw.allow)) profile.allow = raw.allow.map(String).filter(Boolean)
    if (Array.isArray(raw.deny)) profile.deny = raw.deny.map(String).filter(Boolean)
    if (raw.override && typeof raw.override === 'object' && !Array.isArray(raw.override)) {
      profile.override = {}
      Object.entries(raw.override).forEach(([key, param]) => {
        if (param && typeof param === 'object') profile.override![key] = normalizeParamDefForAdmin(param as ParamDef)
      })
    }
    if (Array.isArray(raw.add)) profile.add = raw.add.filter((p) => p && typeof p === 'object').map((p) => normalizeParamDefForAdmin(p as ParamDef))
    return profile
  } catch {
    return emptyParamProfile()
  }
}

export function serializeModelParamProfile(profile: ModelParamProfile): string {
  const next: ModelParamProfile = {}
  const allow = (profile.allow ?? []).map(String).map((s) => s.trim()).filter(Boolean)
  const deny = (profile.deny ?? []).map(String).map((s) => s.trim()).filter(Boolean)
  const add = parseParamDefs(serializeParamDefs(profile.add ?? []))
  const overrideEntries = Object.entries(profile.override ?? {})
    .map(([key, param]) => [key.trim(), parseParamDefs(serializeParamDefs([{ ...param, key: param.key || key }]))[0]] as const)
    .filter(([key, param]) => key && param)
  if (allow.length > 0) next.allow = allow
  if (deny.length > 0) next.deny = deny
  if (overrideEntries.length > 0) {
    next.override = {}
    overrideEntries.forEach(([key, param]) => { next.override![key] = param })
  }
  if (add.length > 0) next.add = add
  return JSON.stringify(next)
}

export function buildParamContractAudit(value: string, adapterParams: ParamDef[]): ParamContractAudit {
  const mode: ParamContractAudit['mode'] = !value.trim()
    ? 'inherit'
    : value.trim() === '[]'
      ? 'none'
      : isProfileParamConfig(value)
        ? 'profile'
        : 'override'
  const errors: string[] = []
  const warnings: string[] = []
  let params: ParamDef[] = []
  if (mode === 'inherit') {
    params = adapterParams.map(normalizeParamDefForAdmin)
  } else if (mode === 'override') {
    params = parseParamDefs(value)
    if (value.trim() && params.length === 0) errors.push('custom_supported_params must be a ParamDef array or ModelParamProfile object.')
  } else if (mode === 'profile') {
    validateRawProfileShape(value, errors)
    const profile = parseModelParamProfile(value)
    validateProfileParamReferences(adapterParams, profile, errors)
    params = resolveProfileParams(adapterParams, profile, warnings)
  }
  const normalized = mode === 'profile'
    ? pruneParamRulesForKnownParams(params.map(normalizeParamDefForAdmin))
    : params.map(normalizeParamDefForAdmin)
  validateResolvedParams(normalized, errors)
  return {
    mode,
    params: normalized,
    errors,
    warnings,
    schemaRuleCount: countSchemaRules(normalized),
  }
}

export function adapterParamsForCapabilities(adapter: AdapterDef | undefined, capabilities: string[]): ParamDef[] {
  if (!adapter?.param_sets?.length) return []
  const caps = new Set(capabilities)
  const seen = new Set<string>()
  const params: ParamDef[] = []
  for (const set of adapter.param_sets) {
    if (!caps.has(set.capability)) continue
    for (const raw of set.params ?? []) {
      const p = normalizeParamDefForAdmin(raw)
      if (!p.key || seen.has(p.key)) continue
      seen.add(p.key)
      params.push({ ...p, options: p.options ? [...p.options] : undefined })
    }
  }
  return params
}

export function paramTemplateFor(key: string): ParamDef | null {
  return PARAM_TEMPLATES[key] ?? null
}

export function isProfileParamConfig(value: string): boolean {
  if (!value.trim()) return true
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
  } catch {
    return false
  }
}

function validateRawProfileShape(value: string, errors: string[]) {
  try {
    const parsed = JSON.parse(value)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return
    const profile = parsed as Record<string, unknown>
    ;(['allow', 'deny'] as const).forEach((field) => {
      const raw = profile[field]
      if (raw === undefined) return
      if (raw === null) {
        errors.push(`Profile ${field} must not be null.`)
        return
      }
      if (!Array.isArray(raw)) {
        errors.push(`Profile ${field} must be an array of parameter keys.`)
        return
      }
      raw.forEach((item, index) => {
        if (typeof item !== 'string') errors.push(`Profile ${field}[${index}] must be a parameter key string.`)
      })
    })
    const override = profile.override
    if (override !== undefined) {
      if (override === null) {
        errors.push('Profile override must not be null.')
      } else if (Array.isArray(override) || typeof override !== 'object') {
        errors.push('Profile override must be an object keyed by parameter name.')
      } else {
        Object.entries(override as Record<string, unknown>).forEach(([key, item]) => {
          if (!item || Array.isArray(item) || typeof item !== 'object') {
            errors.push(`Profile override.${key} must be a parameter definition object.`)
          }
        })
      }
    }
    const add = profile.add
    if (add !== undefined) {
      if (add === null) {
        errors.push('Profile add must not be null.')
      } else if (!Array.isArray(add)) {
        errors.push('Profile add must be an array of parameter definition objects.')
      } else {
        add.forEach((item, index) => {
          if (!item || Array.isArray(item) || typeof item !== 'object') {
            errors.push(`Profile add[${index}] must be a parameter definition object.`)
          }
        })
      }
    }
  } catch {
    // Syntax errors are reported by the generic override/parser branch.
  }
}

export function splitOptions(value: string): string[] {
  return value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
}

function resolveProfileParams(adapterParams: ParamDef[], profile: ModelParamProfile, warnings: string[]): ParamDef[] {
  const allow = new Set((profile.allow ?? []).map(normalizeAdminParamKey).filter(Boolean))
  const deny = new Set((profile.deny ?? []).map(normalizeAdminParamKey).filter(Boolean))
  const out: ParamDef[] = []
  const seen = new Set<string>()
  for (const raw of adapterParams) {
    const param = normalizeParamDefForAdmin(raw)
    const key = normalizeAdminParamKey(param.key)
    if (!key || seen.has(key)) continue
    if (allow.size > 0 && !allow.has(key)) continue
    if (deny.has(key)) continue
    out.push({ ...param, key })
    seen.add(key)
  }
  Object.entries(profile.override ?? {}).forEach(([rawKey, rawParam]) => {
    const param = normalizeParamDefForAdmin({ ...rawParam, key: rawParam.key || rawKey })
    const key = normalizeAdminParamKey(param.key)
    if (!key || deny.has(key) || (allow.size > 0 && !allow.has(key))) return
    const index = out.findIndex((item) => item.key === key)
    if (index >= 0) out[index] = { ...out[index], ...param, key }
    else out.push({ ...param, key })
    seen.add(key)
  })
  for (const raw of profile.add ?? []) {
    const param = normalizeParamDefForAdmin(raw)
    const key = normalizeAdminParamKey(param.key)
    if (!key || deny.has(key) || (allow.size > 0 && !allow.has(key))) continue
    if (seen.has(key)) warnings.push(`Parameter "${key}" is declared more than once; the last declaration wins.`)
    const index = out.findIndex((item) => item.key === key)
    if (index >= 0) out[index] = { ...out[index], ...param, key }
    else out.push({ ...param, key })
    seen.add(key)
  }
  return out
}

function validateProfileParamReferences(adapterParams: ParamDef[], profile: ModelParamProfile, errors: string[]) {
  const known = new Set(adapterParams.map((param) => normalizeAdminParamKey(param.key)).filter(Boolean))
  Object.entries(profile.override ?? {}).forEach(([rawKey, rawParam]) => {
    const key = normalizeAdminParamKey(rawParam.key || rawKey)
    if (key) known.add(key)
  })
  for (const raw of profile.add ?? []) {
    const key = normalizeAdminParamKey(raw.key)
    if (key) known.add(key)
  }
  const allow = validateProfileKeyList('allow', profile.allow ?? [], known, errors)
  const deny = validateProfileKeyList('deny', profile.deny ?? [], known, errors)
  allow.forEach((key) => {
    if (deny.has(key)) errors.push(`Parameter "${key}" is listed in both allow and deny.`)
  })
}

function validateProfileKeyList(field: 'allow' | 'deny', values: string[], known: Set<string>, errors: string[]): Set<string> {
  const seen = new Set<string>()
  values.forEach((value) => {
    const key = normalizeAdminParamKey(value)
    if (!key) {
      errors.push(`Profile ${field} contains an empty parameter key.`)
      return
    }
    if (seen.has(key)) errors.push(`Profile ${field} contains duplicated parameter "${key}".`)
    if (!known.has(key)) errors.push(`Profile ${field} references unknown parameter "${key}".`)
    seen.add(key)
  })
  return seen
}

function validateResolvedParams(params: ParamDef[], errors: string[]) {
  const seen = new Set<string>()
  const keys = new Set(params.map((param) => normalizeAdminParamKey(param.key)).filter(Boolean))
  const byKey = new Map(params.map((param) => [normalizeAdminParamKey(param.key), param] as const).filter(([key]) => !!key))
  params.forEach((param, index) => {
    const key = normalizeAdminParamKey(param.key)
    if (!key) errors.push(`Parameter ${index + 1} is missing a key.`)
    if (!String(param.label ?? '').trim()) errors.push(`Parameter "${key || index + 1}" label is required.`)
    if (key && seen.has(key)) errors.push(`Parameter "${key}" is duplicated.`)
    if (key) seen.add(key)
    if (!['select', 'number', 'boolean', 'string'].includes(param.type)) errors.push(`Parameter "${key || index + 1}" has unsupported type "${param.type}".`)
    if (param.type === 'select' && (!param.options || param.options.length === 0)) errors.push(`Select parameter "${key}" needs at least one option.`)
    if (param.type === 'select') validateStringOptions(param.options ?? [], `Select parameter "${key}" options`, errors)
    if (param.type === 'number' && param.min !== undefined && param.max !== undefined && Number(param.min) > Number(param.max)) errors.push(`Number parameter "${key}" has min greater than max.`)
    if (param.type === 'number' && param.step !== undefined && Number(param.step) < 0) errors.push(`Number parameter "${key}" has negative step.`)
    validateParamDefault(param, key, errors)
    validateParamJSONSchema(param, key, errors)
    ;(param.conflicts_with ?? []).forEach((other) => {
      if (!keys.has(normalizeAdminParamKey(other))) errors.push(`Parameter "${key}" conflicts with unknown parameter "${other}".`)
    })
    ;(param.conditional_enum ?? []).forEach((rule) => {
      const whenKey = normalizeAdminParamKey(rule.when_param)
      if (!keys.has(whenKey)) errors.push(`Parameter "${key}" conditional enum references unknown parameter "${rule.when_param}".`)
      else validateParamRuleValue(byKey.get(whenKey), rule.when_value, `Parameter "${key}" conditional enum when_value`, errors)
      if (!rule.options?.length) errors.push(`Parameter "${key}" conditional enum needs options.`)
      validateStringOptions(rule.options ?? [], `Parameter "${key}" conditional enum options`, errors)
      ;(rule.options ?? []).forEach((option) => validateParamRuleValue(param, option, `Parameter "${key}" conditional enum option`, errors))
    })
    ;(param.conditional_const ?? []).forEach((rule) => {
      const whenKey = normalizeAdminParamKey(rule.when_param)
      if (!keys.has(whenKey)) errors.push(`Parameter "${key}" conditional const references unknown parameter "${rule.when_param}".`)
      else validateParamRuleValue(byKey.get(whenKey), rule.when_value, `Parameter "${key}" conditional const when_value`, errors)
      validateParamRuleValue(param, rule.value, `Parameter "${key}" conditional const value`, errors)
    })
    ;(param.requires_value ?? []).forEach((rule) => {
      const requiredKey = normalizeAdminParamKey(rule.param)
      if (!keys.has(requiredKey)) errors.push(`Parameter "${key}" requires unknown parameter "${rule.param}".`)
      else validateParamRuleValue(byKey.get(requiredKey), rule.value, `Parameter "${key}" requires_value value`, errors)
    })
  })
}

function validateStringOptions(options: string[], label: string, errors: string[]) {
  const seen = new Set<string>()
  options.forEach((option) => {
    if (option.trim() === '') errors.push(`${label} contains an empty option.`)
    if (seen.has(option)) errors.push(`${label} contains duplicate option "${option}".`)
    seen.add(option)
  })
}

function validateParamDefault(param: ParamDef, key: string, errors: string[]) {
  if (param.default === undefined) return
  if (param.type === 'select') {
    if (typeof param.default !== 'string') errors.push(`Select parameter "${key}" default must be a string option.`)
    else if (param.options?.length && !param.options.includes(param.default)) errors.push(`Select parameter "${key}" default is not in options.`)
  }
  if (param.type === 'number') {
    if (typeof param.default !== 'number' || Number.isNaN(param.default)) errors.push(`Number parameter "${key}" default must be a number.`)
    else {
      if (param.min !== undefined && param.default < Number(param.min)) errors.push(`Number parameter "${key}" default is less than min.`)
      if (param.max !== undefined && param.default > Number(param.max)) errors.push(`Number parameter "${key}" default is greater than max.`)
    }
  }
  if (param.type === 'boolean' && typeof param.default !== 'boolean') errors.push(`Boolean parameter "${key}" default must be a boolean.`)
  if (param.type === 'string' && typeof param.default !== 'string') errors.push(`String parameter "${key}" default must be a string.`)
}

function validateParamJSONSchema(param: ParamDef, key: string, errors: string[]) {
  const schema = param.json_schema
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return
  const enumValue = schema.enum
  if (enumValue !== undefined) {
    if (!Array.isArray(enumValue) || enumValue.length === 0 || enumValue.some((item) => !isScalarJSONSchemaValue(item))) {
      errors.push(`Parameter "${key}" json_schema.enum must be a non-empty scalar array.`)
    } else if (param.default !== undefined && !enumValue.some((item) => scalarValuesMatch(item, param.default))) {
      errors.push(`Parameter "${key}" default is not in json_schema.enum.`)
    }
  }
  const min = schemaNumberKeyword(schema, 'minimum', key, errors)
  const max = schemaNumberKeyword(schema, 'maximum', key, errors)
  const multipleOf = schemaNumberKeyword(schema, 'multipleOf', key, errors)
  if (min !== undefined && max !== undefined && min > max) errors.push(`Parameter "${key}" json_schema.minimum is greater than maximum.`)
  if (multipleOf !== undefined && multipleOf <= 0) errors.push(`Parameter "${key}" json_schema.multipleOf must be greater than zero.`)
  if (param.default !== undefined && typeof param.default === 'number' && !Number.isNaN(param.default)) {
    if (min !== undefined && param.default < min) errors.push(`Parameter "${key}" default is less than json_schema.minimum.`)
    if (max !== undefined && param.default > max) errors.push(`Parameter "${key}" default is greater than json_schema.maximum.`)
    if (multipleOf !== undefined && multipleOf > 0 && Math.abs((param.default / multipleOf) - Math.round(param.default / multipleOf)) > 1e-9) {
      errors.push(`Parameter "${key}" default is not a multiple of json_schema.multipleOf.`)
    }
  }
}

function validateParamRuleValue(param: ParamDef | undefined, value: unknown, label: string, errors: string[]) {
  if (!param) return
  if (param.type === 'select') {
    if (typeof value !== 'string') errors.push(`${label} must be a string option.`)
    else if (param.options?.length && !param.options.includes(value)) errors.push(`${label} is not in options.`)
  }
  if (param.type === 'number') {
    if (typeof value !== 'number' || Number.isNaN(value)) errors.push(`${label} must be a number.`)
    else {
      if (param.min !== undefined && value < Number(param.min)) errors.push(`${label} is less than min.`)
      if (param.max !== undefined && value > Number(param.max)) errors.push(`${label} is greater than max.`)
    }
  }
  if (param.type === 'boolean' && typeof value !== 'boolean') errors.push(`${label} must be a boolean.`)
  if (param.type === 'string' && typeof value !== 'string') errors.push(`${label} must be a string.`)
  validateValueAgainstParamJSONSchema(param, value, label, errors)
}

function validateValueAgainstParamJSONSchema(param: ParamDef, value: unknown, label: string, errors: string[]) {
  const schema = param.json_schema
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return
  const enumValue = schema.enum
  if (Array.isArray(enumValue) && enumValue.length > 0 && enumValue.every(isScalarJSONSchemaValue) && !enumValue.some((item) => scalarValuesMatch(item, value))) {
    errors.push(`${label} is not in json_schema.enum.`)
  }
  const min = typeof schema.minimum === 'number' ? schema.minimum : undefined
  const max = typeof schema.maximum === 'number' ? schema.maximum : undefined
  const multipleOf = typeof schema.multipleOf === 'number' ? schema.multipleOf : undefined
  if (typeof value !== 'number' || Number.isNaN(value)) return
  if (min !== undefined && value < min) errors.push(`${label} is less than json_schema.minimum.`)
  if (max !== undefined && value > max) errors.push(`${label} is greater than json_schema.maximum.`)
  if (multipleOf !== undefined && multipleOf > 0 && Math.abs((value / multipleOf) - Math.round(value / multipleOf)) > 1e-9) {
    errors.push(`${label} is not a multiple of json_schema.multipleOf.`)
  }
}

function schemaNumberKeyword(schema: Record<string, unknown>, field: 'minimum' | 'maximum' | 'multipleOf', key: string, errors: string[]): number | undefined {
  const value = schema[field]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || Number.isNaN(value)) {
    errors.push(`Parameter "${key}" json_schema.${field} must be a number.`)
    return undefined
  }
  return value
}

function isScalarJSONSchemaValue(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function scalarValuesMatch(left: unknown, right: unknown): boolean {
  return left === right || (typeof left === 'number' && typeof right === 'number' && Number(left) === Number(right))
}

function pruneParamRulesForKnownParams(params: ParamDef[]): ParamDef[] {
  const keys = new Set(params.map((param) => normalizeAdminParamKey(param.key)).filter(Boolean))
  return params.map((param) => ({
    ...param,
    conflicts_with: (param.conflicts_with ?? []).map(normalizeAdminParamKey).filter((key) => key && keys.has(key)),
    conditional_enum: (param.conditional_enum ?? []).filter((rule) => keys.has(normalizeAdminParamKey(rule.when_param))),
    conditional_const: (param.conditional_const ?? []).filter((rule) => keys.has(normalizeAdminParamKey(rule.when_param))),
    requires_value: (param.requires_value ?? []).filter((rule) => keys.has(normalizeAdminParamKey(rule.param))),
  }))
}

function countSchemaRules(params: ParamDef[]): number {
  return params.reduce((sum, param) =>
    sum
    + (param.conflicts_with?.length ?? 0)
    + (param.conditional_enum?.length ?? 0)
    + (param.conditional_const?.length ?? 0)
    + (param.requires_value?.length ?? 0), 0)
}

function normalizeAdminParamKey(key: string | undefined): string {
  if (!key) return ''
  return normalizeParamDefForAdmin({ key, label: key, type: 'select' }).key
}
