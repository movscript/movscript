import type { AgentCommandRuntime } from '../../../command/commandRouter.js'
import { renderToolCatalogText } from '../../text/contextText.js'
import type { PromptFragmentProvider } from '../promptFragmentProvider.js'

export const commandToolPromptProviders: readonly PromptFragmentProvider[] = [
  {
    id: 'command.contract',
    collect: (input) => shouldIncludeCommandContract(input.command) ? [{
      id: `command.${input.command.name}`,
      kind: 'instruction',
      title: 'Command contract',
      content: [
        `command: ${input.command.rawName ?? input.command.name}`,
        `contextMode: ${input.command.contextMode}`,
        `outputMode: ${input.command.outputMode}`,
        input.command.payload ? `payload: ${input.command.payload}` : undefined,
        input.command.requiredTools.length > 0 ? `requiredTools: ${input.command.requiredTools.join(', ')}` : undefined,
        '',
        input.command.systemContract,
      ].filter(Boolean).join('\n'),
    }] : [],
  },
  {
    id: 'tools.available',
    collect: (input) => [{
      id: 'tools.available',
      kind: 'tool',
      title: 'Tool use',
      content: renderToolCatalogText(input.tools),
    }],
  },
]

function shouldIncludeCommandContract(command: AgentCommandRuntime): boolean {
  if (command.name !== 'chat') return true
  return command.requiredTools.length > 0 || command.outputMode !== 'natural'
}
