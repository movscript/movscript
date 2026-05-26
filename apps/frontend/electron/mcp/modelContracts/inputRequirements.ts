import { isRecord } from '../valueUtils'
import { integerModelField } from './utils'

export function summarizeInputRequirementsForAgent(value: unknown): Record<string, Record<string, number>> {
  const source = isRecord(value) ? value : {}
  return {
    image: summarizeInputRequirementForAgent(source.image),
    video: summarizeInputRequirementForAgent(source.video),
  }
}

function summarizeInputRequirementForAgent(value: unknown): Record<string, number> {
  const source = isRecord(value) ? value : {}
  const min = integerModelField(source, 'min', 0, 0)
  const max = integerModelField(source, 'max', -1, 0)
  if (max !== -1 && min > max) return { min: 0, max: 0 }
  return {
    min,
    max,
  }
}
