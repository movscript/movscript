import type { AgentRun } from '@/lib/localAgentClient'
import type { ChatGenerationParamAudit } from '@/store/agentStore'

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
    modelConfigId: numericField(audit, 'model_config_id') ?? numericField(audit, 'modelConfigId'),
    modelContractLoaded: audit.model_contract_loaded === true || audit.modelContractLoaded === true,
    paramsSchemaLoaded: audit.params_schema_loaded === true || audit.paramsSchemaLoaded === true,
    paramsSchemaRuleCount: numericField(audit, 'params_schema_rule_count') ?? numericField(audit, 'paramsSchemaRuleCount'),
    supportedParams: stringArrayField(audit, 'supported_params') ?? stringArrayField(audit, 'supportedParams') ?? [],
    providedExtraParams: stringArrayField(audit, 'provided_extra_params') ?? stringArrayField(audit, 'providedExtraParams') ?? [],
    submittedExtraParams: stringArrayField(audit, 'submitted_extra_params') ?? stringArrayField(audit, 'submittedExtraParams') ?? [],
    droppedExtraParams: stringArrayField(audit, 'dropped_extra_params') ?? stringArrayField(audit, 'droppedExtraParams') ?? [],
    droppedTopLevelParams: stringArrayField(audit, 'dropped_top_level_params') ?? stringArrayField(audit, 'droppedTopLevelParams') ?? [],
    ...(typeof audit.extra_params_parse_error === 'string' ? { extraParamsParseError: audit.extra_params_parse_error } : {}),
    ...(typeof audit.extraParamsParseError === 'string' ? { extraParamsParseError: audit.extraParamsParseError } : {}),
    ...(typeof data.repair_note === 'string' ? { repairNote: data.repair_note } : {}),
    ...(typeof data.repairNote === 'string' ? { repairNote: data.repairNote } : {}),
    ...(typeof resultRecord?.repair_note === 'string' ? { repairNote: resultRecord.repair_note } : {}),
    ...(typeof resultRecord?.repairNote === 'string' ? { repairNote: resultRecord.repairNote } : {}),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
