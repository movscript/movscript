import { createHash } from 'node:crypto'
import type { AgentCommandRuntime } from '../../../context/command/commandRouter.js'
import type { GenerationDebugCommandSpec } from '../../../context/diagnostics/commands/localDiagnosticCommands.js'
import type { JSONValue } from '../../../state/shared/types.js'

export function summarizeAgentCommandTrace(command: AgentCommandRuntime): Record<string, JSONValue> {
  return {
    name: command.name,
    ...(command.rawName ? { rawName: command.rawName } : {}),
    contextMode: command.contextMode,
    outputMode: command.outputMode,
    requiredTools: command.requiredTools,
    requiredToolCount: command.requiredTools.length,
    payloadChars: command.payload.length,
    payloadHash: hashString(command.payload),
    payloadMode: 'summary',
    systemContractChars: command.systemContract.length,
    systemContractHash: hashString(command.systemContract),
    systemContractMode: 'summary',
  }
}

export function summarizeGenerationDebugCommandTrace(command: GenerationDebugCommandSpec): Record<string, JSONValue> {
  return {
    outputType: command.outputType,
    jobType: command.jobType,
    sourceKey: command.sourceKey,
    timeoutMs: command.timeoutMs,
    referenceResourceCount: command.referenceResourceIds.length,
    referenceResourceIds: command.referenceResourceIds,
    promptChars: command.prompt.length,
    promptHash: hashString(command.prompt),
    promptMode: 'summary',
    extraParamsChars: stableStringify(command.extraParams).length,
    extraParamsHash: hashString(stableStringify(command.extraParams)),
    extraParamsMode: 'summary',
    ...(command.aspectRatio ? { aspectRatio: command.aspectRatio } : {}),
    ...(command.duration !== undefined ? { duration: command.duration } : {}),
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableJSON(value))
}

function stableJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJSON)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableJSON(item)]),
  )
}

function hashString(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
