import { createHash } from 'node:crypto'
import type { AgentMessage, CompiledPromptPreview } from '../../../state/shared/types.js'
import type { NormalizedClientInput } from '../../input/client/normalizeClientInput.js'
import { renderTextSections, type TextSectionBudgetPart } from '../../../shared/text/textSectionBudgeter.js'
import { isPromptHistoryMessage } from '../hygiene/promptHygiene.js'
import { promptFragmentForDebugPart, type PromptDebugPartLike, type PromptFragment } from '../registry/promptFragments.js'

export interface PromptBundlePart extends TextSectionBudgetPart, PromptDebugPartLike {}

export interface PromptBundleSection extends PromptBundlePart {
  chars: number
  contentHash: string
  fragment: PromptFragment
}

export interface PromptBundleUserTurn {
  message: string
  clientInput?: NormalizedClientInput
}

export interface PromptBundle {
  schema: 'movscript.prompt-bundle.v1'
  id: string
  sections: PromptBundleSection[]
  sectionPrompt: string
  history: AgentMessage[]
  user: PromptBundleUserTurn
}

export interface BuildPromptBundleInput<T extends PromptBundlePart = PromptBundlePart> {
  approvedParts: T[]
  promptFragments?: PromptFragment[]
  history: AgentMessage[]
  userMessage: string
  clientInput?: NormalizedClientInput
}

export function buildPromptBundle<T extends PromptBundlePart>(input: BuildPromptBundleInput<T>): PromptBundle {
  const fragmentById = new Map(input.promptFragments?.map((fragment) => [fragment.id, fragment]) ?? [])
  const sections = input.approvedParts.map((part) => {
    const fragment = fragmentById.get(part.id) ?? promptFragmentForDebugPart(part)
    return {
      id: part.id,
      kind: part.kind,
      title: part.title,
      content: part.content,
      chars: renderTextSections([part]).length,
      contentHash: fragment.contentHash,
      fragment,
    }
  })
  const sectionPrompt = renderTextSections(sections)
  const history = input.history.filter(isPromptHistoryMessage)
  const user: PromptBundleUserTurn = {
    message: input.userMessage,
    ...(input.clientInput ? { clientInput: input.clientInput } : {}),
  }
  const hash = stableHash({
    sections: sections.map((section) => ({
      id: section.id,
      kind: section.kind,
      contentHash: section.contentHash,
      authority: section.fragment.instructionAuthority,
      renderMode: section.fragment.renderMode,
    })),
    history: history.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      metadata: message.metadata,
    })),
    user: {
      message: user.message,
      attachmentIds: user.clientInput?.attachments.map((attachment) => attachment.id) ?? [],
    },
  })
  return {
    schema: 'movscript.prompt-bundle.v1',
    id: `pb_${hash.slice('sha256:'.length, 'sha256:'.length + 16)}`,
    sections,
    sectionPrompt,
    history,
    user,
  }
}

export function promptBundleDebugParts(promptBundle: PromptBundle): CompiledPromptPreview['debugParts'] {
  return promptBundle.sections.map((section) => ({
    id: section.id,
    kind: section.kind as CompiledPromptPreview['debugParts'][number]['kind'],
    title: section.title,
    content: section.content,
  }))
}

export function promptBundleFragments(promptBundle: PromptBundle): PromptFragment[] {
  return promptBundle.sections.map((section) => section.fragment)
}

function stableHash(value: unknown): string {
  return `sha256:${hashText(stableStringify(value))}`
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`
}
