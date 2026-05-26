import {
  isCancelledGenerationStatus,
  isCompletedGenerationStatus,
  isFailedGenerationStatus,
  stringValue,
} from '../generation'
import { uniquePositiveNumberArray } from './utils'

export function buildWaitGenerationJobsResult(input: {
  jobIds: number[]
  jobs: Record<string, unknown>[]
  mode: 'all' | 'any'
  timedOut: boolean
  timeoutMs: number
  heartbeatMs: number
  done: boolean
}): Record<string, unknown> {
  const completed = input.jobs.filter((job) => isCompletedGenerationStatus(stringValue(job.status) ?? 'unknown'))
  const failed = input.jobs.filter((job) => isFailedGenerationStatus(stringValue(job.status) ?? 'unknown'))
  const cancelled = input.jobs.filter((job) => isCancelledGenerationStatus(stringValue(job.status) ?? 'unknown'))
  const pending = input.jobs.filter((job) => job.terminal !== true)
  const outputResourceIds = uniquePositiveNumberArray(input.jobs.flatMap((job) => (
    Array.isArray(job.output_resource_ids) ? job.output_resource_ids : [job.output_resource_id]
  )))
  const status = input.timedOut
    ? 'timeout'
    : pending.length > 0
      ? 'partial'
      : failed.length > 0
        ? 'failed'
        : cancelled.length > 0 && completed.length === 0
          ? 'cancelled'
          : 'completed'
  return {
    status,
    done: input.done,
    mode: input.mode,
    jobIds: input.jobIds,
    jobs: input.jobs,
    completed,
    pending,
    failed,
    cancelled,
    ...(outputResourceIds.length > 0 ? { output_resource_ids: outputResourceIds } : {}),
    timeout_ms: input.timeoutMs,
    heartbeat_ms: input.heartbeatMs,
    terminal: input.done,
    message: waitGenerationJobsMessage({ status, completed, pending, failed, cancelled, outputResourceIds }),
  }
}

function waitGenerationJobsMessage(input: {
  status: string
  completed: Record<string, unknown>[]
  pending: Record<string, unknown>[]
  failed: Record<string, unknown>[]
  cancelled: Record<string, unknown>[]
  outputResourceIds: number[]
}): string {
  if (input.status === 'timeout') {
    return `等待生成任务超时，仍有 ${input.pending.length} 个任务在后台运行。`
  }
  if (input.status === 'failed') {
    return `生成任务等待完成，其中 ${input.failed.length} 个失败。`
  }
  if (input.status === 'cancelled') {
    return `生成任务等待完成，其中 ${input.cancelled.length} 个已取消。`
  }
  if (input.outputResourceIds.length > 0) {
    return `生成任务完成，输出资源 ${input.outputResourceIds.map((id) => `#${id}`).join('、')}。`
  }
  return `生成任务等待完成，成功 ${input.completed.length} 个。`
}
