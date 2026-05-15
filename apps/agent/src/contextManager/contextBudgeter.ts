export type ContextBudgetDegradation = 'dropped_policies' | 'dropped_workflows' | 'dropped_examples'

export interface ContextBudgetPart {
  id: string
  kind: string
  title: string
  content: string
}

export interface FitPromptPartsInput<T extends ContextBudgetPart> {
  parts: T[]
  limit: number
  warnings?: string[]
  priorityOfPart?: (part: T) => number
  lowPriorityDropPredicate?: (part: T) => boolean
  lowPriorityDropWarning?: (part: T) => string
  secondaryDropPredicate?: (part: T) => boolean
  secondaryDropWarning?: (part: T) => string
  examplesDropWarning?: string
}

export interface FitPromptPartsResult<T extends ContextBudgetPart> {
  parts: T[]
  prompt: string
  warnings: string[]
  degraded?: ContextBudgetDegradation
}

export function fitPromptPartsToBudget<T extends ContextBudgetPart>(input: FitPromptPartsInput<T>): FitPromptPartsResult<T> {
  const warnings = input.warnings ?? []
  let current = [...input.parts]
  let degraded: ContextBudgetDegradation | undefined
  let prompt = renderPromptBudgetParts(current)
  if (prompt.length <= input.limit) return { parts: current, prompt, warnings }

  const priorityOfPart = input.priorityOfPart ?? (() => 100)
  const lowPriorityDropPredicate = input.lowPriorityDropPredicate ?? ((part: T) => part.kind === 'skill' && priorityOfPart(part) < 100)
  const lowPriorityDropWarning = input.lowPriorityDropWarning ?? ((part: T) => `prompt.size.exceeded: dropped non-critical skill ${part.id}`)
  const secondaryDropPredicate = input.secondaryDropPredicate ?? ((part: T) => part.kind === 'skill')
  const secondaryDropWarning = input.secondaryDropWarning ?? ((part: T) => `prompt.size.exceeded: dropped skill ${part.id}`)
  const lowPriorityParts = current
    .filter(lowPriorityDropPredicate)
    .sort((a, b) => priorityOfPart(a) - priorityOfPart(b) || b.id.localeCompare(a.id))
  for (const partToDrop of lowPriorityParts) {
    current = current.filter((part) => part.id !== partToDrop.id)
    degraded = 'dropped_policies'
    warnings.push(lowPriorityDropWarning(partToDrop))
    prompt = renderPromptBudgetParts(current)
    if (prompt.length <= input.limit) return { parts: current, prompt, warnings, degraded }
  }

  const secondaryParts = current
    .filter(secondaryDropPredicate)
    .sort((a, b) => priorityOfPart(a) - priorityOfPart(b) || b.id.localeCompare(a.id))
  for (const partToDrop of secondaryParts) {
    current = current.filter((part) => part.id !== partToDrop.id)
    degraded = 'dropped_workflows'
    warnings.push(secondaryDropWarning(partToDrop))
    prompt = renderPromptBudgetParts(current)
    if (prompt.length <= input.limit) return { parts: current, prompt, warnings, degraded }
  }

  const stripped = current.map((part) => ({ ...part, content: stripPromptExamplesSection(part.content) }))
  const strippedPrompt = renderPromptBudgetParts(stripped)
  if (strippedPrompt.length < prompt.length) {
    current = stripped
    degraded = 'dropped_examples'
    warnings.push(input.examplesDropWarning ?? 'prompt.size.exceeded: stripped examples sections')
    prompt = strippedPrompt
    if (prompt.length <= input.limit) return { parts: current, prompt, warnings, degraded }
  }

  throw new Error(`prompt.size.exceeded: system prompt ${prompt.length} chars exceeds limit ${input.limit}`)
}

export function renderPromptBudgetParts(parts: ContextBudgetPart[]): string {
  return parts.map((part) => `## ${part.title}\n${part.content}`).join('\n\n')
}

export function stripPromptExamplesSection(content: string): string {
  return content
    .replace(/\n+examples?:[\s\S]*?(?=\n#{1,6}\s|\noutput contract:|$)/gi, '\n')
    .replace(/\n+示例[:：][\s\S]*?(?=\n#{1,6}\s|\noutput contract:|$)/g, '\n')
    .trim()
}
