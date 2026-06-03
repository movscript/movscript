export type TextSectionBudgetDegradation = 'dropped_low_priority_skills' | 'dropped_skills' | 'dropped_examples'
export type TextSectionBudgetDecisionAction = 'drop' | 'strip_examples'
export type TextSectionBudgetDecisionStage = 'low_priority' | 'secondary' | 'examples'

export interface TextSectionBudgetPart {
  id: string
  kind: string
  title: string
  content: string
}

export interface FitTextSectionsInput<T extends TextSectionBudgetPart> {
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

export interface FitTextSectionsResult<T extends TextSectionBudgetPart> {
  parts: T[]
  text: string
  warnings: string[]
  initialTextChars: number
  finalTextChars: number
  decisions: TextSectionBudgetDecision[]
  degraded?: TextSectionBudgetDegradation
}

export interface TextSectionBudgetDecision {
  action: TextSectionBudgetDecisionAction
  stage: TextSectionBudgetDecisionStage
  partId: string
  partTitle: string
  partKind: string
  reason: string
  originalChars: number
  renderedChars: number
  textCharsBefore: number
  textCharsAfter: number
  limitChars: number
  priority?: number
}

export function fitTextSectionsToBudget<T extends TextSectionBudgetPart>(input: FitTextSectionsInput<T>): FitTextSectionsResult<T> {
  const warnings = input.warnings ?? []
  let current = [...input.parts]
  let degraded: TextSectionBudgetDegradation | undefined
  const decisions: TextSectionBudgetDecision[] = []
  let text = renderTextSections(current)
  const initialTextChars = text.length
  if (text.length <= input.limit) return { parts: current, text, warnings, initialTextChars, finalTextChars: text.length, decisions }

  const priorityOfPart = input.priorityOfPart ?? (() => 100)
  const lowPriorityDropPredicate = input.lowPriorityDropPredicate ?? ((part: T) => part.kind === 'skill' && priorityOfPart(part) < 100)
  const lowPriorityDropWarning = input.lowPriorityDropWarning ?? ((part: T) => `text_budget.size.exceeded: dropped low-priority section ${part.id}`)
  const secondaryDropPredicate = input.secondaryDropPredicate ?? ((part: T) => part.kind === 'skill')
  const secondaryDropWarning = input.secondaryDropWarning ?? ((part: T) => `text_budget.size.exceeded: dropped section ${part.id}`)
  const lowPriorityParts = current
    .filter(lowPriorityDropPredicate)
    .sort((a, b) => priorityOfPart(a) - priorityOfPart(b) || b.id.localeCompare(a.id))
  for (const partToDrop of lowPriorityParts) {
    const textCharsBefore = text.length
    const reason = lowPriorityDropWarning(partToDrop)
    current = current.filter((part) => part.id !== partToDrop.id)
    degraded = 'dropped_low_priority_skills'
    warnings.push(reason)
    text = renderTextSections(current)
    decisions.push(buildBudgetDecision({
      action: 'drop',
      stage: 'low_priority',
      part: partToDrop,
      reason,
      textCharsBefore,
      textCharsAfter: text.length,
      limitChars: input.limit,
      priority: priorityOfPart(partToDrop),
    }))
    if (text.length <= input.limit) return { parts: current, text, warnings, initialTextChars, finalTextChars: text.length, decisions, degraded }
  }

  const secondaryParts = current
    .filter(secondaryDropPredicate)
    .sort((a, b) => priorityOfPart(a) - priorityOfPart(b) || b.id.localeCompare(a.id))
  for (const partToDrop of secondaryParts) {
    const textCharsBefore = text.length
    const reason = secondaryDropWarning(partToDrop)
    current = current.filter((part) => part.id !== partToDrop.id)
    degraded = 'dropped_skills'
    warnings.push(reason)
    text = renderTextSections(current)
    decisions.push(buildBudgetDecision({
      action: 'drop',
      stage: 'secondary',
      part: partToDrop,
      reason,
      textCharsBefore,
      textCharsAfter: text.length,
      limitChars: input.limit,
      priority: priorityOfPart(partToDrop),
    }))
    if (text.length <= input.limit) return { parts: current, text, warnings, initialTextChars, finalTextChars: text.length, decisions, degraded }
  }

  const stripped = current.map((part) => ({ ...part, content: stripTextExamplesSection(part.content) }))
  const strippedPrompt = renderTextSections(stripped)
  if (strippedPrompt.length < text.length) {
    const textCharsBefore = text.length
    const reason = input.examplesDropWarning ?? 'text_budget.size.exceeded: stripped examples sections'
    current = stripped
    degraded = 'dropped_examples'
    warnings.push(reason)
    text = strippedPrompt
    decisions.push(...input.parts.flatMap((part) => {
      const strippedPart = stripped.find((item) => item.id === part.id)
      if (!strippedPart || strippedPart.content === part.content) return []
      return [buildBudgetDecision({
        action: 'strip_examples',
        stage: 'examples',
        part,
        renderedPart: strippedPart,
        reason,
        textCharsBefore,
        textCharsAfter: text.length,
        limitChars: input.limit,
        priority: priorityOfPart(part),
      })]
    }))
    if (text.length <= input.limit) return { parts: current, text, warnings, initialTextChars, finalTextChars: text.length, decisions, degraded }
  }

  throw new Error(`text_budget.size.exceeded: rendered text ${text.length} chars exceeds limit ${input.limit}`)
}

export function renderTextSections(parts: TextSectionBudgetPart[]): string {
  return parts.map((part) => `## ${part.title}\n${part.content}`).join('\n\n')
}

export function stripTextExamplesSection(content: string): string {
  return content
    .replace(/\n+examples?:[\s\S]*?(?=\n#{1,6}\s|\noutput contract:|$)/gi, '\n')
    .replace(/\n+示例[:：][\s\S]*?(?=\n#{1,6}\s|\noutput contract:|$)/g, '\n')
    .trim()
}

function buildBudgetDecision<T extends TextSectionBudgetPart>(input: {
  action: TextSectionBudgetDecisionAction
  stage: TextSectionBudgetDecisionStage
  part: T
  renderedPart?: T
  reason: string
  textCharsBefore: number
  textCharsAfter: number
  limitChars: number
  priority?: number
}): TextSectionBudgetDecision {
  return {
    action: input.action,
    stage: input.stage,
    partId: input.part.id,
    partTitle: input.part.title,
    partKind: input.part.kind,
    reason: input.reason,
    originalChars: renderTextSections([input.part]).length,
    renderedChars: input.renderedPart ? renderTextSections([input.renderedPart]).length : 0,
    textCharsBefore: input.textCharsBefore,
    textCharsAfter: input.textCharsAfter,
    limitChars: input.limitChars,
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
  }
}
