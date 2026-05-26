import { stringValue, uniquePositiveNumbers } from './values'
import {
  isCancelledGenerationStatus,
  isCompletedGenerationStatus,
  isFailedGenerationStatus,
} from '../generationStatus'

export function generationJobMessage(jobId: number, normalized: Record<string, unknown>): string {
  const status = stringValue(normalized.status) ?? 'unknown'
  if (isCompletedGenerationStatus(status)) {
    const outputResourceIds = Array.isArray(normalized.output_resource_ids)
      ? uniquePositiveNumbers(normalized.output_resource_ids)
      : []
    if (outputResourceIds.length > 1) return `生成完成，输出资源 ${outputResourceIds.map((id) => `#${id}`).join('、')}。`
    return `生成完成${typeof normalized.output_resource_id === 'number' ? `，输出资源 #${normalized.output_resource_id}` : ''}。`
  }
  if (isFailedGenerationStatus(status)) {
    return `生成失败${typeof normalized.error === 'string' ? `：${normalized.error}` : ''}。`
  }
  if (isCancelledGenerationStatus(status)) return `生成任务 Job #${jobId} 已取消。`
  const progress = typeof normalized.progress === 'number' ? `，进度 ${normalized.progress}%` : ''
  const stage = typeof normalized.stage === 'string' ? `，阶段：${normalized.stage}` : ''
  return `生成任务 Job #${jobId} 仍在进行中，状态：${status}${progress}${stage}。`
}
