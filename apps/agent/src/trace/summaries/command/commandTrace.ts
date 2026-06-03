import { createHash } from 'node:crypto'
import type { AgentCommandRuntime } from '../../../context/command/commandRouter.js'
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

function hashString(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
