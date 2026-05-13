import type { CatalogIssue, CatalogRegistry, PolicyScope, SkillDefinition, ToolDefinition } from './types.js'

const PLACEHOLDER_RE = /\{\{(tool|schema|ctx):([^}]+)\}\}/g

export function lintCatalog(registry: CatalogRegistry): CatalogIssue[] {
  const issues: CatalogIssue[] = []
  for (const skill of registry.skills.values()) lintSkill(skill, registry, issues)
  for (const tool of registry.tools.values()) lintTool(tool, issues)
  for (const pack of registry.packs.values()) {
    for (const schema of pack.schemas) if (!registry.schemas.has(schema)) error(issues, 'pack.schema.missing', `pack ${pack.id} references missing schema ${schema}`, pack.id)
    for (const tool of pack.tools) if (!registry.tools.has(tool)) error(issues, 'pack.tool.missing', `pack ${pack.id} references missing tool ${tool}`, pack.id)
    for (const skill of pack.skills) if (!registry.skills.has(skill)) error(issues, 'pack.skill.missing', `pack ${pack.id} references missing skill ${skill}`, pack.id)
    lintPackClosure(pack.id, registry, issues)
  }
  for (const profile of registry.profiles.values()) {
    if ('permissions' in profile) error(issues, 'profile.permissions.present', `profile ${profile.id} must not declare permissions`, profile.id)
    const packSkills = new Set(profile.enabledPacks.flatMap((id) => registry.packs.get(id)?.skills ?? []))
    const packTools = new Set(profile.enabledPacks.flatMap((id) => registry.packs.get(id)?.tools ?? []))
    if (profile.persona) {
      const persona = registry.skills.get(profile.persona)
      if (!persona) error(issues, 'profile.persona.missing', `profile ${profile.id} references missing persona ${profile.persona}`, profile.id)
      else if (persona.kind !== 'persona') error(issues, 'profile.persona.kind', `profile ${profile.id} persona must reference a persona skill`, profile.id)
      if (!packSkills.has(profile.persona)) warning(issues, 'profile.persona.pack_coverage', `profile ${profile.id} persona ${profile.persona} is not covered by enabledPacks`, profile.id)
    }
    for (const id of profile.enabledWorkflows) {
      const workflow = registry.skills.get(id)
      if (!workflow) error(issues, 'profile.workflow.missing', `profile ${profile.id} references missing workflow ${id}`, profile.id)
      else if (workflow.kind !== 'workflow') error(issues, 'profile.workflow.kind', `profile ${profile.id} enabledWorkflows item ${id} is not a workflow`, profile.id)
      if (!packSkills.has(id)) warning(issues, 'profile.workflow.pack_coverage', `profile ${profile.id} workflow ${id} is not covered by enabledPacks`, profile.id)
    }
    for (const id of profile.enabledPolicies) {
      const policy = registry.skills.get(id)
      if (!policy) error(issues, 'profile.policy.missing', `profile ${profile.id} references missing policy ${id}`, profile.id)
      else if (policy.kind !== 'policy') error(issues, 'profile.policy.kind', `profile ${profile.id} enabledPolicies item ${id} is not a policy`, profile.id)
      if (!packSkills.has(id)) warning(issues, 'profile.policy.pack_coverage', `profile ${profile.id} policy ${id} is not covered by enabledPacks`, profile.id)
    }
    for (const grant of profile.toolGrants) {
      const tool = registry.tools.get(grant.name)
      if (!tool) error(issues, 'profile.tool.missing', `profile ${profile.id} grants missing tool ${grant.name}`, profile.id)
      if (!packTools.has(grant.name)) warning(issues, 'profile.tool.pack_coverage', `profile ${profile.id} tool grant ${grant.name} is not covered by enabledPacks`, profile.id)
      if (tool && approvalRank(grant.approval ?? tool.defaults.approval) < approvalRank(tool.defaults.approval)) {
        warning(issues, 'profile.approval.weakened', `profile ${profile.id} weakens approval for ${grant.name}; runtime will keep ${tool.defaults.approval}`, profile.id)
      }
    }
  }
  return issues
}

function lintPackClosure(packId: string, registry: CatalogRegistry, issues: CatalogIssue[]): void {
  const pack = registry.packs.get(packId)
  if (!pack) return
  const coveredPacks = collectPackClosure(packId, registry)
  const coveredSchemas = new Set<string>()
  const coveredTools = new Set<string>()
  for (const id of coveredPacks) {
    const item = registry.packs.get(id)
    if (!item) continue
    for (const schema of item.schemas) coveredSchemas.add(schema)
    for (const tool of item.tools) coveredTools.add(tool)
  }

  for (const skillId of pack.skills) {
    const skill = registry.skills.get(skillId)
    if (!skill) continue
    for (const ref of skill.toolRefs ?? []) {
      const tool = stripRef(ref, 'tool://')
      if (!coveredTools.has(tool)) {
        error(issues, 'pack.tool_ref.uncovered', `pack ${pack.id} includes skill ${skill.id} but neither the pack nor its required packs include tool ${tool}`, pack.id)
      }
    }
    for (const ref of skill.schemaRefs ?? []) {
      const schema = stripRef(ref, 'schema://')
      if (!coveredSchemas.has(schema)) {
        error(issues, 'pack.schema_ref.uncovered', `pack ${pack.id} includes skill ${skill.id} but neither the pack nor its required packs include schema ${schema}`, pack.id)
      }
    }
  }
}

function collectPackClosure(packId: string, registry: CatalogRegistry): Set<string> {
  const visited = new Set<string>()
  visit(packId)
  return visited

  function visit(id: string): void {
    if (visited.has(id)) return
    visited.add(id)
    const pack = registry.packs.get(id)
    if (!pack) return
    for (const required of Object.keys(pack.requires?.packs ?? {})) visit(required)
  }
}

function lintSkill(skill: SkillDefinition, registry: CatalogRegistry, issues: CatalogIssue[]): void {
  if (skill.kind === 'workflow' && skill.triggers.length === 0) {
    error(issues, 'skill.workflow.triggers.empty', `workflow ${skill.id} must declare triggers`, skill.id)
  }
  if (skill.kind === 'workflow') lintWorkflowBoundary(skill, registry, issues)
  if (skill.kind === 'persona' && ((skill.toolRefs?.length ?? 0) > 0 || (skill.schemaRefs?.length ?? 0) > 0)) {
    warning(issues, 'skill.persona.refs', `persona ${skill.id} should not reference tools or schemas`, skill.id)
  }
  if (skill.kind === 'persona' && /调用\s*(tool|工具|movscript_)/i.test(skill.instructionTemplate)) {
    warning(issues, 'skill.persona.workflow_text', `persona ${skill.id} appears to contain workflow/tool steps`, skill.id)
  }
  if (/^\s*\{\s*"/m.test(skill.instructionTemplate)) {
    warning(issues, 'skill.inline_json_shape', `skill ${skill.id} appears to inline a JSON shape; use schema refs`, skill.id)
  }
  for (const ref of skill.toolRefs ?? []) {
    const name = stripRef(ref, 'tool://')
    if (!registry.tools.has(name)) error(issues, 'skill.tool_ref.missing', `skill ${skill.id} references missing tool ${name}`, skill.id)
  }
  for (const ref of skill.schemaRefs ?? []) {
    const id = stripRef(ref, 'schema://')
    const schema = registry.schemas.get(id)
    if (!schema) error(issues, 'skill.schema_ref.missing', `skill ${skill.id} references missing schema ${id}`, skill.id)
    else if (schema.status === 'deprecated') warning(issues, 'skill.schema_ref.deprecated', `skill ${skill.id} references deprecated schema ${id}`, skill.id)
  }
  let match: RegExpExecArray | null
  PLACEHOLDER_RE.lastIndex = 0
  while ((match = PLACEHOLDER_RE.exec(skill.instructionTemplate)) !== null) {
    const kind = match[1]
    const ref = match[2]
    if (kind === 'tool') {
      const name = ref.split('.')[0]
      if (!registry.tools.has(name)) error(issues, 'skill.placeholder.tool_missing', `skill ${skill.id} placeholder references missing tool ${name}`, skill.id)
    }
    if (kind === 'schema') {
      const id = ref.replace(/\.id$/, '')
      if (!registry.schemas.has(id)) error(issues, 'skill.placeholder.schema_missing', `skill ${skill.id} placeholder references missing schema ${id}`, skill.id)
    }
  }
  if (skill.kind === 'policy') lintPolicyScope(skill.scope, registry, issues, skill.id)
}

function lintWorkflowBoundary(skill: Extract<SkillDefinition, { kind: 'workflow' }>, registry: CatalogRegistry, issues: CatalogIssue[]): void {
  const riskyRefs = skill.toolRefs
    .map((ref) => stripRef(ref, 'tool://'))
    .map((name) => registry.tools.get(name))
    .filter((tool): tool is ToolDefinition => !!tool && (tool.risk === 'write' || tool.risk === 'generate' || tool.risk === 'destructive'))
  if (riskyRefs.length === 0) return
  const requiredSections = [
    { label: 'Goal/目标', markers: ['Goal:', '目标：'] },
    { label: 'Boundary/边界', markers: ['Boundary:', '边界：'] },
    { label: 'Process/流程', markers: ['Process:', '流程：'] },
    { label: 'Output/输出', markers: ['Output:', '输出：'] },
    { label: 'Never/绝不', markers: ['Never:', '绝不：'] },
  ]
  const missing = requiredSections
    .filter((section) => !section.markers.some((marker) => skill.instructionTemplate.includes(marker)))
    .map((section) => section.label)
  if (missing.length > 0) {
    error(
      issues,
      'skill.workflow.boundary.missing',
      `workflow ${skill.id} references risky tools (${riskyRefs.map((tool) => tool.name).join(', ')}) but is missing boundary sections: ${missing.join(', ')}`,
      skill.id,
    )
  }
}

function lintTool(tool: ToolDefinition, issues: CatalogIssue[]): void {
  if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
    error(issues, 'tool.input_schema.missing', `tool ${tool.name} must declare inputSchema`, tool.name)
  }
  if (/(use when|do not use|when the user asks|use this only|only when the user|recommended .*loop|enter the .*workflow)/i.test(tool.description)) {
    warning(issues, 'tool.description.polluted', `tool ${tool.name} description includes workflow language`, tool.name)
  }
  if ((tool.source === 'plugin' || tool.source === 'mcp') && !tool.pluginId && tool.source === 'plugin') {
    error(issues, 'tool.plugin_id.missing', `plugin tool ${tool.name} must declare pluginId`, tool.name)
  }
  if ((tool.source === 'plugin' || tool.source === 'mcp') && tool.risk === 'destructive') {
    error(issues, 'tool.destructive.external', `external tool ${tool.name} cannot use destructive risk`, tool.name)
  }
}

function lintPolicyScope(scope: PolicyScope | undefined, registry: CatalogRegistry, issues: CatalogIssue[], id: string): void {
  if (!scope || scope === 'global' || !scope.workflow) return
  for (const workflowId of scope.workflow) {
    const workflow = registry.skills.get(workflowId)
    if (!workflow || workflow.kind !== 'workflow') error(issues, 'policy.scope.workflow_missing', `policy ${id} scope references missing workflow ${workflowId}`, id)
  }
}

function stripRef(ref: string, prefix: string): string {
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref
}

function approvalRank(value: 'never' | 'on_write' | 'always'): number {
  if (value === 'always') return 2
  if (value === 'on_write') return 1
  return 0
}

function error(issues: CatalogIssue[], code: string, message: string, resourceId?: string): void {
  issues.push({ level: 'error', code, message, ...(resourceId ? { resourceId } : {}) })
}

function warning(issues: CatalogIssue[], code: string, message: string, resourceId?: string): void {
  issues.push({ level: 'warning', code, message, ...(resourceId ? { resourceId } : {}) })
}
