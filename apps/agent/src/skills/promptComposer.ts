import type { CatalogRegistry, RuntimeContext, SkillDefinition, WorkflowSkill } from '../catalog/types.js'

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
}): ComposedPrompt {
  const parts: ComposedPrompt['parts'] = []
  if (input.persona) parts.push(toPart(input.persona, input.registry, input.ctx))
  for (const policy of [...input.policies].sort(byPriority)) parts.push(toPart(policy, input.registry, input.ctx))
  for (const workflow of [...input.workflows].sort(byPriority)) parts.push(toPart(workflow, input.registry, input.ctx))
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
  if (!schema || typeof schema !== 'object') return []
  const actions = new Set<string>()
  visit(schema)
  return Array.from(actions)

  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const record = value as Record<string, unknown>
    if (record.action && typeof record.action === 'object' && 'const' in record.action && typeof (record.action as Record<string, unknown>).const === 'string') {
      actions.add((record.action as Record<string, string>).const)
    }
    Object.values(record).forEach(visit)
  }
}

function getPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[key]
  }, value)
}

function byPriority(a: SkillDefinition, b: SkillDefinition): number {
  return b.priority - a.priority || a.id.localeCompare(b.id)
}

function fitPromptToLimit(parts: ComposedPrompt['parts'], limit: number | undefined): ComposedPrompt {
  const warnings: string[] = []
  let current = [...parts]
  let degraded: ComposedPrompt['degraded']
  let prompt = renderParts(current)
  if (!limit || prompt.length <= limit) return { parts: current, systemPrompt: prompt, warnings }

  const lowPriorityPolicies = current
    .filter((part) => part.kind === 'policy')
    .filter((part) => originalPriority(parts, part.id) < 100)
    .sort((a, b) => originalPriority(parts, a.id) - originalPriority(parts, b.id) || b.id.localeCompare(a.id))
  for (const policy of lowPriorityPolicies) {
    current = current.filter((part) => part.id !== policy.id)
    degraded = 'dropped_policies'
    warnings.push(`prompt.size.exceeded: dropped non-critical policy ${policy.id}`)
    prompt = renderParts(current)
    if (prompt.length <= limit) return { parts: current, systemPrompt: prompt, warnings, degraded }
  }

  const workflows = current
    .filter((part) => part.kind === 'workflow')
    .sort((a, b) => originalPriority(parts, a.id) - originalPriority(parts, b.id) || b.id.localeCompare(a.id))
  for (const workflow of workflows) {
    current = current.filter((part) => part.id !== workflow.id)
    degraded = 'dropped_workflows'
    warnings.push(`prompt.size.exceeded: dropped workflow ${workflow.id}`)
    prompt = renderParts(current)
    if (prompt.length <= limit) return { parts: current, systemPrompt: prompt, warnings, degraded }
  }

  const stripped = current.map((part) => ({ ...part, content: stripExamplesSection(part.content) }))
  const strippedPrompt = renderParts(stripped)
  if (strippedPrompt.length < prompt.length) {
    current = stripped
    degraded = 'dropped_examples'
    warnings.push('prompt.size.exceeded: stripped schema examples sections')
    prompt = strippedPrompt
    if (prompt.length <= limit) return { parts: current, systemPrompt: prompt, warnings, degraded }
  }

  throw new Error(`prompt.size.exceeded: system prompt ${prompt.length} chars exceeds limit ${limit}`)
}

function renderParts(parts: ComposedPrompt['parts']): string {
  return parts.map((part) => `## ${part.title}\n${part.content}`).join('\n\n')
}

function originalPriority(parts: ComposedPrompt['parts'], id: string): number {
  const part = parts.find((candidate) => candidate.id === id)
  return part?.priority ?? 0
}

function stripExamplesSection(content: string): string {
  return content
    .replace(/\n+examples?:[\s\S]*?(?=\n#{1,6}\s|\noutput contract:|$)/gi, '\n')
    .replace(/\n+示例[:：][\s\S]*?(?=\n#{1,6}\s|\noutput contract:|$)/g, '\n')
    .trim()
}
