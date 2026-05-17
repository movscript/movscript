import type { CatalogRegistry, ExpertiseSkill, RuntimeContext, SkillDefinition, WorkflowSkill } from '../catalog/types.js'
import { fitPromptPartsToBudget, renderPromptBudgetParts } from '../contextManager/contextBudgeter.js'
import { isRecord } from '../jsonValue.js'

const PLACEHOLDER_RE = /\{\{(tool|schema|ctx):([^}]+)\}\}/g

export interface ComposedPrompt {
  systemPrompt: string
  parts: Array<{ id: string; kind: SkillDefinition['kind']; title: string; content: string; priority: number }>
  warnings: string[]
  degraded?: 'dropped_policies' | 'dropped_workflows' | 'dropped_examples'
}

export function renderSkill(skill: SkillDefinition, registry: CatalogRegistry, ctx: RuntimeContext): string {
  const rendered = skill.instructionTemplate.replace(PLACEHOLDER_RE, (_, kind: string, ref: string) => {
    if (kind === 'tool') return renderToolRef(ref, registry)
    if (kind === 'schema') return renderSchemaRef(ref, registry)
    if (kind === 'ctx') return String(getPath(ctx.uiContext, ref) ?? '')
    return ''
  })
  if (/\{\{[^}]+\}\}/.test(rendered)) throw new Error(`catalog.ref.missing: unresolved placeholder in ${skill.id}`)
  return [rendered, skill.outputContract ? `Output contract:\n${skill.outputContract}` : ''].filter(Boolean).join('\n\n')
}

export function composePrompt(input: {
  registry: CatalogRegistry
  ctx: RuntimeContext
  persona?: SkillDefinition
  policies: SkillDefinition[]
  workflows: WorkflowSkill[]
  expertise?: ExpertiseSkill[]
}): ComposedPrompt {
  const parts: ComposedPrompt['parts'] = []
  if (input.persona) parts.push(toPart(input.persona, input.registry, input.ctx))
  for (const policy of [...input.policies].sort(byPriority)) parts.push(toPart(policy, input.registry, input.ctx))
  for (const workflow of [...input.workflows].sort(byPriority)) parts.push(toPart(workflow, input.registry, input.ctx))
  for (const expertise of [...(input.expertise ?? [])].sort(byPriority)) parts.push(toPart(expertise, input.registry, input.ctx))
  return fitPromptToLimit(parts, input.ctx.profile.limits?.systemPromptCharLimit)
}

function toPart(skill: SkillDefinition, registry: CatalogRegistry, ctx: RuntimeContext): ComposedPrompt['parts'][number] {
  return {
    id: skill.id,
    kind: skill.kind,
    title: skill.name,
    priority: skill.priority,
    content: renderSkill(skill, registry, ctx),
  }
}

function renderToolRef(ref: string, registry: CatalogRegistry): string {
  const [name, sub] = ref.split('.')
  const tool = registry.tools.get(name)
  if (!tool) throw new Error(`catalog.ref.missing: tool ${name}`)
  if (!sub) return tool.capability ?? tool.description
  if (sub === 'actions') return enumActions(tool.inputSchema).join(', ')
  if (sub === 'errors') return (tool.errorCodes ?? []).join(', ')
  throw new Error(`catalog.ref.missing: unsupported tool ref ${ref}`)
}

function renderSchemaRef(ref: string, registry: CatalogRegistry): string {
  const id = ref.endsWith('.id') ? ref.slice(0, -3) : ref
  const schema = registry.schemas.get(id)
  if (!schema) throw new Error(`catalog.ref.missing: schema ${id}`)
  return ref.endsWith('.id') ? schema.id : schema.promptSummary
}

function enumActions(schema: unknown): string[] {
  if (!isRecord(schema)) return []
  const actions = new Set<string>()
  visit(schema)
  return Array.from(actions)

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!isRecord(value)) return
    const record = value
    if (isRecord(record.action) && typeof record.action.const === 'string') {
      actions.add(record.action.const)
    }
    Object.values(record).forEach(visit)
  }
}

function getPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined
    return current[key]
  }, value)
}

function byPriority(a: SkillDefinition, b: SkillDefinition): number {
  return b.priority - a.priority || a.id.localeCompare(b.id)
}

function fitPromptToLimit(parts: ComposedPrompt['parts'], limit: number | undefined): ComposedPrompt {
  const warnings: string[] = []
  if (!limit) return { parts, systemPrompt: renderPromptBudgetParts(parts), warnings }
  const fitted = fitPromptPartsToBudget({
    parts,
    limit,
    warnings,
    priorityOfPart: (part) => part.priority,
    lowPriorityDropPredicate: (part) => part.kind === 'policy' && part.priority < 100,
    lowPriorityDropWarning: (part) => `prompt.size.exceeded: dropped non-critical policy ${part.id}`,
    secondaryDropPredicate: (part) => part.kind === 'workflow' || part.kind === 'expertise',
    secondaryDropWarning: (part) => `prompt.size.exceeded: dropped ${part.kind} ${part.id}`,
    examplesDropWarning: 'prompt.size.exceeded: stripped schema examples sections',
  })
  return {
    parts: fitted.parts,
    systemPrompt: fitted.prompt,
    warnings: fitted.warnings,
    ...(fitted.degraded ? { degraded: fitted.degraded } : {}),
  }
}
