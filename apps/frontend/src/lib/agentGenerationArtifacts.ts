import type { AgentRun } from '@/lib/localAgentClient'

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

function generatedResourceFromToolResult(result: unknown): AgentGeneratedResourceRef | undefined {
  const data = isRecord(result) && isRecord(result.data) ? result.data : result
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
