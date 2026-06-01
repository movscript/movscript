export type ContextBudgetDegradation = 'dropped_policies' | 'dropped_workflows' | 'dropped_examples'
export type ContextBudgetDecisionAction = 'drop' | 'strip_examples'
export type ContextBudgetDecisionStage = 'low_priority' | 'secondary' | 'examples'

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
  initialPromptChars: number
  finalPromptChars: number
  decisions: ContextBudgetDecision[]
  degraded?: ContextBudgetDegradation
}

export interface ContextBudgetDecision {
  action: ContextBudgetDecisionAction
  stage: ContextBudgetDecisionStage
  partId: string
  partTitle: string
  partKind: string
  reason: string
  originalChars: number
  renderedChars: number
  promptCharsBefore: number
  promptCharsAfter: number
  limitChars: number
  priority?: number
}

export function fitPromptPartsToBudget<T extends ContextBudgetPart>(input: FitPromptPartsInput<T>): FitPromptPartsResult<T> {
  const warnings = input.warnings ?? []
  let current = [...input.parts]
  let degraded: ContextBudgetDegradation | undefined
  const decisions: ContextBudgetDecision[] = []
  let prompt = renderPromptBudgetParts(current)
  const initialPromptChars = prompt.length
  if (prompt.length <= input.limit) return { parts: current, prompt, warnings, initialPromptChars, finalPromptChars: prompt.length, decisions }

  const priorityOfPart = input.priorityOfPart ?? (() => 100)
  const lowPriorityDropPredicate = input.lowPriorityDropPredicate ?? ((part: T) => part.kind === 'skill' && priorityOfPart(part) < 100)
  const lowPriorityDropWarning = input.lowPriorityDropWarning ?? ((part: T) => `prompt.size.exceeded: dropped non-critical skill ${part.id}`)
  const secondaryDropPredicate = input.secondaryDropPredicate ?? ((part: T) => part.kind === 'skill')
  const secondaryDropWarning = input.secondaryDropWarning ?? ((part: T) => `prompt.size.exceeded: dropped skill ${part.id}`)
  const lowPriorityParts = current
    .filter(lowPriorityDropPredicate)
    .sort((a, b) => priorityOfPart(a) - priorityOfPart(b) || b.id.localeCompare(a.id))
  for (const partToDrop of lowPriorityParts) {
    const promptCharsBefore = prompt.length
    const reason = lowPriorityDropWarning(partToDrop)
    current = current.filter((part) => part.id !== partToDrop.id)
    degraded = 'dropped_policies'
    warnings.push(reason)
    prompt = renderPromptBudgetParts(current)
    decisions.push(buildBudgetDecision({
      action: 'drop',
      stage: 'low_priority',
      part: partToDrop,
      reason,
      promptCharsBefore,
      promptCharsAfter: prompt.length,
      limitChars: input.limit,
      priority: priorityOfPart(partToDrop),
    }))
    if (prompt.length <= input.limit) return { parts: current, prompt, warnings, initialPromptChars, finalPromptChars: prompt.length, decisions, degraded }
  }

  const secondaryParts = current
    .filter(secondaryDropPredicate)
    .sort((a, b) => priorityOfPart(a) - priorityOfPart(b) || b.id.localeCompare(a.id))
  for (const partToDrop of secondaryParts) {
    const promptCharsBefore = prompt.length
    const reason = secondaryDropWarning(partToDrop)
    current = current.filter((part) => part.id !== partToDrop.id)
    degraded = 'dropped_workflows'
    warnings.push(reason)
    prompt = renderPromptBudgetParts(current)
    decisions.push(buildBudgetDecision({
      action: 'drop',
      stage: 'secondary',
      part: partToDrop,
      reason,
      promptCharsBefore,
      promptCharsAfter: prompt.length,
      limitChars: input.limit,
      priority: priorityOfPart(partToDrop),
    }))
    if (prompt.length <= input.limit) return { parts: current, prompt, warnings, initialPromptChars, finalPromptChars: prompt.length, decisions, degraded }
  }

  const stripped = current.map((part) => ({ ...part, content: stripPromptExamplesSection(part.content) }))
  const strippedPrompt = renderPromptBudgetParts(stripped)
  if (strippedPrompt.length < prompt.length) {
    const promptCharsBefore = prompt.length
    const reason = input.examplesDropWarning ?? 'prompt.size.exceeded: stripped examples sections'
    current = stripped
    degraded = 'dropped_examples'
    warnings.push(reason)
    prompt = strippedPrompt
    decisions.push(...input.parts.flatMap((part) => {
      const strippedPart = stripped.find((item) => item.id === part.id)
      if (!strippedPart || strippedPart.content === part.content) return []
      return [buildBudgetDecision({
        action: 'strip_examples',
        stage: 'examples',
        part,
        renderedPart: strippedPart,
        reason,
        promptCharsBefore,
        promptCharsAfter: prompt.length,
        limitChars: input.limit,
        priority: priorityOfPart(part),
      })]
    }))
    if (prompt.length <= input.limit) return { parts: current, prompt, warnings, initialPromptChars, finalPromptChars: prompt.length, decisions, degraded }
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

function buildBudgetDecision<T extends ContextBudgetPart>(input: {
  action: ContextBudgetDecisionAction
  stage: ContextBudgetDecisionStage
  part: T
  renderedPart?: T
  reason: string
  promptCharsBefore: number
  promptCharsAfter: number
  limitChars: number
  priority?: number
}): ContextBudgetDecision {
  return {
    action: input.action,
    stage: input.stage,
    partId: input.part.id,
    partTitle: input.part.title,
    partKind: input.part.kind,
    reason: input.reason,
    originalChars: renderPromptBudgetParts([input.part]).length,
    renderedChars: input.renderedPart ? renderPromptBudgetParts([input.renderedPart]).length : 0,
    promptCharsBefore: input.promptCharsBefore,
    promptCharsAfter: input.promptCharsAfter,
    limitChars: input.limitChars,
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
  }
}
