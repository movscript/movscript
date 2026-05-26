import type { GenerationToolServer } from '../../../src/shared/contracts/generationTools'
export {
  getOptionalNumeric,
  getOptionalString,
  numericValue,
} from '../paramValues'
import { getOptionalString } from '../paramValues'

export function getRequiredOperation(args: Record<string, unknown>, allowed: string[]): string {
  const operation = getOptionalString(args, 'operation')?.trim()
  if (!operation || !allowed.includes(operation)) {
    throw new Error(`operation must be one of: ${allowed.join(', ')}`)
  }
  return operation
}

export function getOptionalGenerationToolServerScope(args: Record<string, unknown>): GenerationToolServer['scope'] | undefined {
  const scope = (getOptionalString(args, 'server_scope') ?? getOptionalString(args, 'serverScope'))?.trim().toLowerCase()
  if (!scope) return undefined
  if (scope === 'local' || scope === 'org' || scope === 'admin') return scope
  throw new Error('server_scope must be one of: local, org, admin')
}
