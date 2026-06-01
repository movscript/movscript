import type { ToolCall } from '../state/types.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'

export function canExecuteConcurrently(call: ToolCall, registry: ToolRegistry): boolean {
  if (call.name === 'core_work_get' || call.name === 'core_work_list' || call.name === 'core_work_wait') return true
  const tool = registry.get(call.name)
  if (tool?.execution) return tool.execution.concurrencySafe
  return tool?.risk === 'read'
}
