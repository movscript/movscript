import type { PromptFragmentProvider } from '../promptFragmentProvider.js'

export const warningPromptProviders: readonly PromptFragmentProvider[] = [
  {
    id: 'context.warnings',
    collect: (input) => input.warnings.length > 0 ? [{
      id: 'context.warnings',
      kind: 'instruction',
      title: 'Runtime warnings',
      content: input.warnings.join('\n'),
    }] : [],
  },
]
