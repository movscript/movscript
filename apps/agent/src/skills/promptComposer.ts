import type { CatalogRegistry, RuntimeContext, SkillDefinition, WorkflowSkill } from '../catalog/types.js'

const PLACEHOLDER_RE = /\{\{(tool|schema|ctx):([^}]+)\}\}/g

export interface ComposedPrompt {
  systemPrompt: string
  parts: Array<{ id: string; kind: SkillDefinition['kind']; title: string; content: string }>
  warnings: string[]
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
  return {
    parts,
    systemPrompt: parts.map((part) => `## ${part.title}\n${part.content}`).join('\n\n'),
    warnings: [],
  }
}

function toPart(skill: SkillDefinition, registry: CatalogRegistry, ctx: RuntimeContext): ComposedPrompt['parts'][number] {
  return {
    id: skill.id,
    kind: skill.kind,
    title: skill.name,
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
