import type { GenerationExtraParamAudit } from './extraParams'
import type { GenerationInputKind, GenerationModelParamContract } from './types'
import type { GenerationInputPreflightError, GenerationParamPreflightError } from './preflight'

export function buildGenerationParamValidationAudit(
  modelConfigId: number,
  modelParamContract: GenerationModelParamContract | undefined,
  extraParamAudit: GenerationExtraParamAudit,
  options: {
    aspectRatioRequested?: string
    aspectRatioSubmitted?: string
    preflightErrors?: GenerationParamPreflightError[]
    submittedInputs?: Record<GenerationInputKind, number>
    inputPreflightErrors?: GenerationInputPreflightError[]
  },
): Record<string, unknown> {
  const supportedParamKeys = modelParamContract?.supportedParamKeys
  const droppedTopLevelParams: string[] = []
  if (options.aspectRatioRequested && !options.aspectRatioSubmitted) {
    droppedTopLevelParams.push('aspect_ratio')
  }
  const dropReasons: Record<string, string> = {}
  for (const key of extraParamAudit.droppedKeys) {
    dropReasons[key] = extraParamAudit.dropReasons?.[key] ?? 'unsupported_extra_param'
  }
  for (const key of droppedTopLevelParams) {
    dropReasons[key] = 'unsupported_top_level_param'
  }
  if (extraParamAudit.parseError) {
    dropReasons.extra_params = 'parse_error'
  }
  return {
    audit_version: 1,
    model_config_id: modelConfigId,
    model_contract_loaded: modelParamContract !== undefined,
    params_schema_loaded: modelParamContract?.paramsSchemaLoaded === true,
    ...(modelParamContract?.paramsSchemaRuleCount !== undefined ? { params_schema_rule_count: modelParamContract.paramsSchemaRuleCount } : {}),
    ...(modelParamContract ? { input_requirements: modelParamContract.inputRequirements } : {}),
    ...(options.submittedInputs ? { submitted_inputs: options.submittedInputs } : {}),
    ...(supportedParamKeys ? { supported_params: Array.from(supportedParamKeys).sort() } : {}),
    submitted_extra_params: extraParamAudit.submittedKeys.sort(),
    ...(extraParamAudit.providedKeys.length > 0 ? { provided_extra_params: extraParamAudit.providedKeys.sort() } : {}),
    ...(extraParamAudit.droppedKeys.length > 0 ? { dropped_extra_params: extraParamAudit.droppedKeys.sort() } : {}),
    ...(droppedTopLevelParams.length > 0 ? { dropped_top_level_params: droppedTopLevelParams } : {}),
    ...(Object.keys(dropReasons).length > 0 ? { drop_reasons: dropReasons } : {}),
    ...(extraParamAudit.renamedKeys && Object.keys(extraParamAudit.renamedKeys).length > 0 ? { renamed_extra_params: extraParamAudit.renamedKeys } : {}),
    ...(extraParamAudit.parseError ? { extra_params_parse_error: extraParamAudit.parseError } : {}),
    ...(options.preflightErrors && options.preflightErrors.length > 0 ? { preflight_errors: options.preflightErrors } : {}),
    ...(options.inputPreflightErrors && options.inputPreflightErrors.length > 0 ? { input_preflight_errors: options.inputPreflightErrors } : {}),
  }
}
