import type { AgentRun } from '@/lib/localAgentClient'
import type { ChatGenerationParamAudit, ChatGenerationValidationError } from '@/store/agentStore'

export interface AgentGeneratedResourceRef {
  jobId?: number
  outputResourceId: number
}

export function selectLatestGeneratedResource(run?: AgentRun): AgentGeneratedResourceRef | undefined {
  if (!run?.steps?.length) return undefined
  const refs: AgentGeneratedResourceRef[] = []
  for (const step of run.steps) {
    if (step.type !== 'tool_call') continue
    if (step.toolName !== 'movscript_create_generation_job' && step.toolName !== 'movscript_get_generation_job') continue
    const ref = generatedResourceFromToolResult(step.result)
    if (ref) refs.push(ref)
  }
  return refs.at(-1)
}

export function generationParamAuditsFromRun(run?: AgentRun): ChatGenerationParamAudit[] {
  if (!run?.steps?.length) return []
  return run.steps.flatMap((step) => {
    if (step.type !== 'tool_call') return []
    if (step.toolName !== 'movscript_create_generation_job') return []
    const audit = generationParamAuditFromToolResult(step.result)
    if (!audit) return []
    const data = dataRecord(step.result)
    const dataObj = isRecord(data) ? data : undefined
    const job = readRecord(dataObj, 'job')
    return [{
      ...audit,
      stepId: step.id,
      jobId: numericField(job, 'ID')
        ?? numericField(job, 'id')
        ?? numericField(dataObj, 'jobId')
        ?? numericField(dataObj, 'job_id'),
    }]
  })
}

export function generationValidationErrorsFromRun(run?: AgentRun): ChatGenerationValidationError[] {
  if (!run?.steps?.length) return []
  return run.steps.flatMap((step) => {
    if (step.type !== 'tool_call') return []
    if (step.toolName !== 'movscript_create_generation_job') return []
    const error = generationValidationErrorFromData(step.errorData)
    return error ? [{ ...error, stepId: step.id }] : []
  })
}

function generatedResourceFromToolResult(result: unknown): AgentGeneratedResourceRef | undefined {
  const data = dataRecord(result)
  if (!isRecord(data)) return undefined

  const outputResourceId =
    numericField(data, 'output_resource_id') ??
    numericField(data, 'outputResourceId') ??
    numericField(readRecord(data, 'output_resource'), 'ID') ??
    numericField(readRecord(data, 'output_resource'), 'id') ??
    numericField(readRecord(data, 'outputResource'), 'ID') ??
    numericField(readRecord(data, 'outputResource'), 'id') ??
    numericField(readRecord(data, 'media'), 'id')

  if (!outputResourceId) return undefined
  const job = readRecord(data, 'job')
  return {
    outputResourceId,
    jobId: numericField(data, 'jobId') ?? numericField(data, 'job_id') ?? numericField(job, 'ID') ?? numericField(job, 'id'),
  }
}

function generationParamAuditFromToolResult(result: unknown): Omit<ChatGenerationParamAudit, 'stepId' | 'jobId'> | undefined {
  const data = dataRecord(result)
  if (!isRecord(data)) return undefined
  const audit = readRecord(data, 'param_validation')
  if (!audit) return undefined
  const resultRecord = isRecord(result) ? result : undefined
  return {
    auditVersion: numericField(audit, 'audit_version') ?? numericField(audit, 'auditVersion'),
    modelConfigId: numericField(audit, 'model_config_id') ?? numericField(audit, 'modelConfigId'),
    modelContractLoaded: audit.model_contract_loaded === true || audit.modelContractLoaded === true,
    paramsSchemaLoaded: audit.params_schema_loaded === true || audit.paramsSchemaLoaded === true,
    paramsSchemaRuleCount: numericField(audit, 'params_schema_rule_count') ?? numericField(audit, 'paramsSchemaRuleCount'),
    supportedParams: stringArrayField(audit, 'supported_params') ?? stringArrayField(audit, 'supportedParams') ?? [],
    providedExtraParams: stringArrayField(audit, 'provided_extra_params') ?? stringArrayField(audit, 'providedExtraParams') ?? [],
    submittedExtraParams: stringArrayField(audit, 'submitted_extra_params') ?? stringArrayField(audit, 'submittedExtraParams') ?? [],
    droppedExtraParams: stringArrayField(audit, 'dropped_extra_params') ?? stringArrayField(audit, 'droppedExtraParams') ?? [],
    droppedTopLevelParams: stringArrayField(audit, 'dropped_top_level_params') ?? stringArrayField(audit, 'droppedTopLevelParams') ?? [],
    ...(stringRecordField(audit, 'drop_reasons') ? { dropReasons: stringRecordField(audit, 'drop_reasons') } : {}),
    ...(stringRecordField(audit, 'dropReasons') ? { dropReasons: stringRecordField(audit, 'dropReasons') } : {}),
    ...(stringRecordField(audit, 'renamed_extra_params') ? { renamedExtraParams: stringRecordField(audit, 'renamed_extra_params') } : {}),
    ...(stringRecordField(audit, 'renamedExtraParams') ? { renamedExtraParams: stringRecordField(audit, 'renamedExtraParams') } : {}),
    ...(typeof audit.extra_params_parse_error === 'string' ? { extraParamsParseError: audit.extra_params_parse_error } : {}),
    ...(typeof audit.extraParamsParseError === 'string' ? { extraParamsParseError: audit.extraParamsParseError } : {}),
    ...(preflightErrorsField(audit, 'preflight_errors') ? { preflightErrors: preflightErrorsField(audit, 'preflight_errors') } : {}),
    ...(preflightErrorsField(audit, 'preflightErrors') ? { preflightErrors: preflightErrorsField(audit, 'preflightErrors') } : {}),
    ...(inputRequirementsField(audit, 'input_requirements') ? { inputRequirements: inputRequirementsField(audit, 'input_requirements') } : {}),
    ...(inputRequirementsField(audit, 'inputRequirements') ? { inputRequirements: inputRequirementsField(audit, 'inputRequirements') } : {}),
    ...(submittedInputsField(audit, 'submitted_inputs') ? { submittedInputs: submittedInputsField(audit, 'submitted_inputs') } : {}),
    ...(submittedInputsField(audit, 'submittedInputs') ? { submittedInputs: submittedInputsField(audit, 'submittedInputs') } : {}),
    ...(inputPreflightErrorsField(audit, 'input_preflight_errors') ? { inputPreflightErrors: inputPreflightErrorsField(audit, 'input_preflight_errors') } : {}),
    ...(inputPreflightErrorsField(audit, 'inputPreflightErrors') ? { inputPreflightErrors: inputPreflightErrorsField(audit, 'inputPreflightErrors') } : {}),
    ...(typeof data.repair_note === 'string' ? { repairNote: data.repair_note } : {}),
    ...(typeof data.repairNote === 'string' ? { repairNote: data.repairNote } : {}),
    ...(typeof resultRecord?.repair_note === 'string' ? { repairNote: resultRecord.repair_note } : {}),
    ...(typeof resultRecord?.repairNote === 'string' ? { repairNote: resultRecord.repairNote } : {}),
  }
}

function generationValidationErrorFromData(value: unknown): Omit<ChatGenerationValidationError, 'stepId'> | undefined {
  if (!isRecord(value) || value.type !== 'backend_http_error' || value.status !== 400) return undefined
  const code = typeof value.code === 'string' ? value.code : undefined
  const message = typeof value.message === 'string'
    ? value.message
    : typeof value.error === 'string'
      ? value.error
      : undefined
  if (!code || !message) return undefined
  const allowedValues = Array.isArray(value.allowed_values)
    ? value.allowed_values.filter(isJSONScalar)
    : Array.isArray(value.allowedValues)
      ? value.allowedValues.filter(isJSONScalar)
      : undefined
  const suggestedFix = recordField(value, 'suggested_fix') ?? recordField(value, 'suggestedFix')
  const requiredMin = integerField(value, 'required_min') ?? integerField(value, 'requiredMin')
  const allowedMax = integerField(value, 'allowed_max') ?? integerField(value, 'allowedMax')
  const actualCount = integerField(value, 'actual_count') ?? integerField(value, 'actualCount')
  return {
    code,
    message,
    ...(typeof value.field === 'string' && value.field.trim().length > 0 ? { field: value.field } : {}),
    ...(allowedValues && allowedValues.length > 0 ? { allowedValues } : {}),
    ...(suggestedFix ? { suggestedFix } : {}),
    ...(requiredMin !== undefined ? { requiredMin } : {}),
    ...(allowedMax !== undefined ? { allowedMax } : {}),
    ...(actualCount !== undefined ? { actualCount } : {}),
  }
}

function dataRecord(result: unknown): unknown {
  return isRecord(result) && isRecord(result.data) ? result.data : result
}

function readRecord(source: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  if (!source) return undefined
  const value = source[key]
  return isRecord(value) ? value : undefined
}

function numericField(source: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!source) return undefined
  const value = source[key]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function stringArrayField(source: Record<string, unknown> | undefined, key: string): string[] | undefined {
  if (!source) return undefined
  const value = source[key]
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function stringRecordField(source: Record<string, unknown> | undefined, key: string): Record<string, string> | undefined {
  if (!source) return undefined
  const value = source[key]
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value).filter((entry): entry is [string, string] => (
    typeof entry[0] === 'string' && entry[0].trim().length > 0
    && typeof entry[1] === 'string' && entry[1].trim().length > 0
  ))
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function preflightErrorsField(source: Record<string, unknown> | undefined, key: string): ChatGenerationParamAudit['preflightErrors'] | undefined {
  if (!source) return undefined
  const value = source[key]
  if (!Array.isArray(value)) return undefined
  const errors = value.flatMap((item) => {
    if (!isRecord(item) || typeof item.code !== 'string' || typeof item.field !== 'string' || typeof item.message !== 'string') return []
    const allowedValues = Array.isArray(item.allowed_values)
      ? item.allowed_values.filter(isJSONScalar)
      : Array.isArray(item.allowedValues)
        ? item.allowedValues.filter(isJSONScalar)
        : undefined
    const suggestedFix = recordField(item, 'suggested_fix') ?? recordField(item, 'suggestedFix')
    return [{
      code: item.code,
      field: item.field,
      message: item.message,
      ...(allowedValues && allowedValues.length > 0 ? { allowedValues } : {}),
      ...(suggestedFix ? { suggestedFix } : {}),
    }]
  })
  return errors.length > 0 ? errors : undefined
}

function inputRequirementsField(source: Record<string, unknown> | undefined, key: string): ChatGenerationParamAudit['inputRequirements'] | undefined {
  if (!source) return undefined
  const value = readRecord(source, key)
  const image = inputRequirementField(readRecord(value, 'image'))
  const video = inputRequirementField(readRecord(value, 'video'))
  return image && video ? { image, video } : undefined
}

function inputRequirementField(source: Record<string, unknown> | undefined): { min: number, max: number } | undefined {
  const min = integerField(source, 'min')
  const max = integerField(source, 'max')
  return min !== undefined && min >= 0 && max !== undefined && max >= -1 ? { min, max } : undefined
}

function submittedInputsField(source: Record<string, unknown> | undefined, key: string): ChatGenerationParamAudit['submittedInputs'] | undefined {
  if (!source) return undefined
  const value = readRecord(source, key)
  const image = integerField(value, 'image')
  const video = integerField(value, 'video')
  return image !== undefined && image >= 0 && video !== undefined && video >= 0 ? { image, video } : undefined
}

function inputPreflightErrorsField(source: Record<string, unknown> | undefined, key: string): ChatGenerationParamAudit['inputPreflightErrors'] | undefined {
  if (!source) return undefined
  const value = source[key]
  if (!Array.isArray(value)) return undefined
  const errors: NonNullable<ChatGenerationParamAudit['inputPreflightErrors']> = value.flatMap((item) => {
    if (!isRecord(item) || item.code !== 'INVALID_INPUT_COUNT' || (item.field !== 'image' && item.field !== 'video') || typeof item.message !== 'string') return []
    const field = item.field
    const requiredMin = integerField(item, 'required_min') ?? integerField(item, 'requiredMin')
    const allowedMax = integerField(item, 'allowed_max') ?? integerField(item, 'allowedMax')
    const actualCount = integerField(item, 'actual_count') ?? integerField(item, 'actualCount')
    if (requiredMin === undefined || allowedMax === undefined || actualCount === undefined) return []
    return [{
      code: item.code,
      field,
      message: item.message,
      requiredMin,
      allowedMax,
      actualCount,
    }]
  })
  return errors.length > 0 ? errors : undefined
}

function recordField(source: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = source[key]
  return isRecord(value) ? value : undefined
}

function integerField(source: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!source) return undefined
  const value = source[key]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(parsed) ? parsed : undefined
}

function isJSONScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
