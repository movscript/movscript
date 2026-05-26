import type { GenerationModelParamContract } from './types'
import type { GenerationParamPreflightError } from './preflightTypes'
import {
  numericParamValue,
  paramHasValue,
  scalarValuesEqual,
} from './preflightScalar'

export function preflightGenerationParams(params: Record<string, unknown>, modelParamContract: GenerationModelParamContract | undefined): GenerationParamPreflightError[] {
  if (!modelParamContract || Object.keys(params).length === 0) return []
  return [
    ...preflightSupportedParamValues(params, modelParamContract),
    ...preflightParamRuleCombinations(params, modelParamContract),
  ]
}

function preflightSupportedParamValues(params: Record<string, unknown>, modelParamContract: GenerationModelParamContract): GenerationParamPreflightError[] {
  const errors: GenerationParamPreflightError[] = []
  for (const [key, value] of Object.entries(params)) {
    const param = modelParamContract.supportedParams.get(key)
    if (!param) continue
    const enumValues = param.enum ?? param.options
    if (enumValues && enumValues.length > 0 && !enumValues.some((item) => scalarValuesEqual(item, value))) {
      errors.push({
        code: 'INVALID_PARAMETER_OPTION',
        field: key,
        message: `parameter "${key}" is not in the local model contract options`,
        allowed_values: enumValues,
        suggested_fix: { [key]: enumValues[0] },
      })
      continue
    }
    if (param.type === 'number') {
      const number = numericParamValue(value)
      if (number === undefined) {
        errors.push({ code: 'INVALID_PARAMETER_TYPE', field: key, message: `parameter "${key}" should be a number` })
        continue
      }
      if (param.min !== undefined && number < param.min) {
        errors.push({ code: 'INVALID_PARAMETER_RANGE', field: key, message: `parameter "${key}" is below the local model contract minimum` })
      }
      if (param.max !== undefined && number > param.max) {
        errors.push({ code: 'INVALID_PARAMETER_RANGE', field: key, message: `parameter "${key}" is above the local model contract maximum` })
      }
    } else if ((param.type === 'select' || param.type === 'string') && typeof value !== 'string') {
      errors.push({ code: 'INVALID_PARAMETER_TYPE', field: key, message: `parameter "${key}" should be a string` })
    } else if (param.type === 'boolean' && typeof value !== 'boolean') {
      errors.push({ code: 'INVALID_PARAMETER_TYPE', field: key, message: `parameter "${key}" should be a boolean` })
    }
  }
  return errors
}

function preflightParamRuleCombinations(params: Record<string, unknown>, modelParamContract: GenerationModelParamContract): GenerationParamPreflightError[] {
  const errors: GenerationParamPreflightError[] = []
  for (const rule of modelParamContract.rules.conflicts) {
    if (paramHasValue(params[rule.key]) && paramHasValue(params[rule.other])) {
      errors.push({
        code: 'INVALID_PARAMETER_COMBINATION',
        field: rule.key,
        message: `parameter "${rule.key}" conflicts with "${rule.other}" in the local model contract`,
        suggested_fix: { [rule.other]: null },
      })
    }
  }
  for (const rule of modelParamContract.rules.conditionalEnums) {
    if (!scalarValuesEqual(rule.whenValue, params[rule.whenParam])) continue
    const value = params[rule.key]
    if (!paramHasValue(value) || rule.options.some((option) => scalarValuesEqual(option, value))) continue
    errors.push({
      code: 'INVALID_PARAMETER_COMBINATION',
      field: rule.key,
      message: `parameter "${rule.key}" is not allowed for "${rule.whenParam}" in the local model contract`,
      allowed_values: rule.options,
      suggested_fix: { [rule.key]: rule.options[0] },
    })
  }
  for (const rule of modelParamContract.rules.conditionalConsts) {
    if (!scalarValuesEqual(rule.whenValue, params[rule.whenParam])) continue
    const value = params[rule.key]
    if (!paramHasValue(value) || scalarValuesEqual(rule.value, value)) continue
    errors.push({
      code: 'INVALID_PARAMETER_COMBINATION',
      field: rule.key,
      message: `parameter "${rule.key}" must match the required value for "${rule.whenParam}" in the local model contract`,
      allowed_values: [rule.value],
      suggested_fix: { [rule.key]: rule.value },
    })
  }
  for (const rule of modelParamContract.rules.requiresValues) {
    if (!paramHasValue(params[rule.key]) || scalarValuesEqual(rule.value, params[rule.param])) continue
    errors.push({
      code: 'INVALID_PARAMETER_COMBINATION',
      field: rule.key,
      message: `parameter "${rule.key}" requires "${rule.param}" in the local model contract`,
      allowed_values: [rule.value],
      suggested_fix: { [rule.param]: rule.value },
    })
  }
  return errors
}
