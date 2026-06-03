import { renderDebugContextText } from '../../text/contextText.js'
import type { PromptFragmentProvider, PromptFragmentProviderInput } from '../promptFragmentProvider.js'

export const contextPromptProviders: readonly PromptFragmentProvider[] = [
  {
    id: 'context.summary',
    collect: (input) => shouldIncludeFocusContext(input) ? [{
      id: 'context.summary',
      kind: 'context',
      title: 'Focus',
      content: renderDebugContextText(input.context),
    }] : [],
  },
  {
    id: 'thread.continuity',
    collect: (input) => input.threadSummary?.trim() ? [{
      id: 'thread.continuity',
      kind: 'context',
      title: 'Thread Continuity',
      content: input.threadSummary.trim(),
    }] : [],
  },
  {
    id: 'thread.runtime_state',
    collect: (input) => {
      const runtimeStateText = renderRuntimeStateText(input.runtimeState)
      return runtimeStateText ? [{
        id: 'thread.runtime_state',
        kind: 'context',
        title: 'Thread Runtime State',
        content: runtimeStateText,
      }] : []
    },
  },
]

function renderRuntimeStateText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return undefined
  }
}

function shouldIncludeFocusContext(input: PromptFragmentProviderInput): boolean {
  if (input.command.name === 'context') return true
  if (input.context.agentTaskGraph) return true
  return false
}
