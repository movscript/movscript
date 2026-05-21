import { isJSONRecord } from '../jsonValue.js'
import { MCPError, type MCPClient } from '../mcpClient.js'
import type { JSONValue } from '../state/types.js'

export async function callMCPToolWithGenerationRepair(
  mcpClient: Pick<MCPClient, 'callTool'>,
  toolName: string,
  args: Record<string, JSONValue>,
  options: { signal?: AbortSignal },
): Promise<JSONValue> {
  try {
    return await mcpClient.callTool(toolName, args, options)
  } catch (error) {
    const repairedArgs = generationRepairArgs(toolName, args, error)
    if (!repairedArgs) throw error
    const result = await mcpClient.callTool(toolName, repairedArgs, options)
    return appendGenerationRepairNote(result, repairedArgs.repair_note)
  }
}

function generationRepairArgs(toolName: string, args: Record<string, JSONValue>, error: unknown): Record<string, JSONValue> | undefined {
  if (toolName !== 'movscript_create_generation_job') return undefined
  if (!(error instanceof MCPError)) return undefined
  const data = isJSONRecord(error.data) ? error.data : undefined
  if (!data || data.type !== 'backend_http_error' || data.status !== 400) return undefined
  if (!isRepairableGenerationValidationCode(data.code)) return undefined
  const suggestedFix = isJSONRecord(data.suggested_fix) ? data.suggested_fix : undefined
  if (!suggestedFix) return undefined
  const repaired = applyGenerationSuggestedFix(args, suggestedFix)
  if (!repaired) return undefined
  return {
    ...repaired,
    repair_note: 'Retried once with backend suggested_fix after generation parameter validation failed.',
  }
}

function isRepairableGenerationValidationCode(code: unknown): boolean {
  return code === 'UNSUPPORTED_PARAMETER'
    || code === 'INVALID_PARAMETER_TYPE'
    || code === 'INVALID_PARAMETER_OPTION'
    || code === 'INVALID_PARAMETER_RANGE'
    || code === 'INVALID_PARAMETER_COMBINATION'
}

function applyGenerationSuggestedFix(args: Record<string, JSONValue>, suggestedFix: Record<string, JSONValue>): Record<string, JSONValue> | undefined {
  let changed = false
  const next: Record<string, JSONValue> = { ...args }
  const extraParams = isJSONRecord(args.extra_params) ? { ...args.extra_params } : {}

  for (const [key, value] of Object.entries(suggestedFix)) {
    if (!isGenerationRepairValue(value) && value !== null) continue
    switch (key) {
      case 'aspect_ratio':
        if (value === null) {
          if ('aspect_ratio' in next) {
            delete next.aspect_ratio
            changed = true
          }
        } else if (next.aspect_ratio !== value) {
          next.aspect_ratio = value
          changed = true
        }
        break
      case 'duration':
        if (value === null) {
          if ('duration' in next) {
            delete next.duration
            changed = true
          }
        } else if (next.duration !== value) {
          next.duration = value
          changed = true
        }
        break
      default:
        if (value === null) {
          if (key in extraParams) {
            delete extraParams[key]
            changed = true
          }
        } else if (extraParams[key] !== value) {
          extraParams[key] = value
          changed = true
        }
        break
    }
  }

  if (!changed) return undefined
  if (Object.keys(extraParams).length > 0) {
    next.extra_params = extraParams
  } else if ('extra_params' in next) {
    delete next.extra_params
  }
  return next
}

function appendGenerationRepairNote(result: JSONValue, repairNote: JSONValue | undefined): JSONValue {
  if (typeof repairNote !== 'string' || !repairNote.trim()) return result
  if (!isJSONRecord(result)) return result
  if (isJSONRecord(result.data)) {
    return {
      ...result,
      data: {
        ...result.data,
        repair_note: repairNote,
      },
    }
  }
  return {
    ...result,
    repair_note: repairNote,
  }
}

function isGenerationRepairValue(value: JSONValue): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}
