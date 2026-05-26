export { backendList } from '../backendList'
export {
  getOptionalNumeric,
  getOptionalString,
  numericValue,
} from '../paramValues'
export { entityId, resolveToolProjectId } from '../toolValues'

export function resourceAttachMessage(input: {
  resourceIds: number[]
  attachedResourceIds: number[]
  skippedResourceIds: number[]
  targetLabel: string
}): string {
  const firstAttachedResourceId = input.attachedResourceIds[0] ?? input.resourceIds[0]
  if (input.attachedResourceIds.length === 0) {
    return `资源 ${input.resourceIds.map((id) => `#${id}`).join('、')} 已在${input.targetLabel} 的候选集中，未重复添加。`
  }
  if (input.attachedResourceIds.length === 1 && input.skippedResourceIds.length === 0) {
    return `资源 #${firstAttachedResourceId} 已加入${input.targetLabel} 的候选集。`
  }
  return `资源 ${input.attachedResourceIds.map((id) => `#${id}`).join('、')} 已加入${input.targetLabel} 的候选集${input.skippedResourceIds.length > 0 ? `；已跳过重复资源 ${input.skippedResourceIds.map((id) => `#${id}`).join('、')}` : ''}。`
}
