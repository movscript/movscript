import type { CatalogIssue, CatalogRegistry, SkillDefinition, ToolDefinition } from '../registry/shared/types.js'

const PLACEHOLDER_RE = /\{\{(tool|schema|ctx):([^}]+)\}\}/g

export function lintCatalog(registry: CatalogRegistry): CatalogIssue[] {
  const issues: CatalogIssue[] = []
  for (const skill of registry.skills.values()) lintSkill(skill, registry, issues)
  for (const tool of registry.tools.values()) lintTool(tool, issues)
  for (const pack of registry.packs.values()) {
    if (requiresResourcePaths(pack) && pack.skills.length > 0 && (pack.resources?.skills?.length ?? 0) === 0) {
      error(issues, 'pack.resources.skills.missing', `pack ${pack.id} declares skills but does not declare resources.skills paths`, pack.id)
    }
    if (requiresResourcePaths(pack) && pack.tools.length > 0 && (pack.resources?.tools?.length ?? 0) === 0) {
      error(issues, 'pack.resources.tools.missing', `pack ${pack.id} declares tools but does not declare resources.tools paths`, pack.id)
    }
    for (const schema of pack.schemas) if (!registry.schemas.has(schema)) error(issues, 'pack.schema.missing', `pack ${pack.id} references missing schema ${schema}`, pack.id)
    for (const tool of pack.tools) if (!registry.tools.has(tool)) error(issues, 'pack.tool.missing', `pack ${pack.id} references missing tool ${tool}`, pack.id)
    for (const skill of pack.skills) if (!registry.skills.has(skill)) error(issues, 'pack.skill.missing', `pack ${pack.id} references missing skill ${skill}`, pack.id)
    lintPackClosure(pack.id, registry, issues)
  }
  for (const configFile of registry.configFiles.values()) {
    if ('permissions' in configFile) error(issues, 'config_file.permissions.present', `config file ${configFile.id} must not declare permissions`, configFile.id)
    const packSkills = new Set(configFile.enabledPackIds.flatMap((id) => registry.packs.get(id)?.skills ?? []))
    const packTools = new Set(configFile.enabledPackIds.flatMap((id) => registry.packs.get(id)?.tools ?? []))
    for (const id of configFile.skillIds) {
      const skill = registry.skills.get(id)
      if (!skill) error(issues, 'config_file.skill.missing', `config file ${configFile.id} references missing config file skill ${id}`, configFile.id)
      if (!packSkills.has(id)) warning(issues, 'config_file.skill.pack_coverage', `config file ${configFile.id} config file skill ${id} is not covered by enabledPackIds`, configFile.id)
    }
    for (const grant of configFile.toolGrants) {
      const tool = registry.tools.get(grant.name)
      if (!tool) error(issues, 'config_file.tool.missing', `config file ${configFile.id} grants missing tool ${grant.name}`, configFile.id)
      if (!packTools.has(grant.name)) warning(issues, 'config_file.tool.pack_coverage', `config file ${configFile.id} tool grant ${grant.name} is not covered by enabledPackIds`, configFile.id)
      if (tool && approvalRank(grant.approval ?? tool.defaults.approval) < approvalRank(tool.defaults.approval)) {
        warning(issues, 'config_file.approval.weakened', `config file ${configFile.id} weakens approval for ${grant.name}; runtime will keep ${tool.defaults.approval}`, configFile.id)
      }
    }
  }
  return issues
}

function requiresResourcePaths(pack: { id: string; source: string }): boolean {
  return pack.id !== 'core.pack.base' && pack.source !== 'mcp'
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
    for (const ref of skill.toolGrants ?? []) {
      const tool = ref.trim()
      if (tool && !coveredTools.has(tool)) {
        error(issues, 'pack.tool_grant.uncovered', `pack ${pack.id} includes skill ${skill.id} but neither the pack nor its required packs include tool ${tool}`, pack.id)
      }
    }
    for (const ref of skill.schemaRefs ?? []) {
      const schema = stripRef(ref, 'schema://')
      if (!coveredSchemas.has(schema)) {
        error(issues, 'pack.schema_ref.uncovered', `pack ${pack.id} includes skill ${skill.id} but neither the pack nor its required packs include schema ${schema}`, pack.id)
      }
    }
    for (const ref of metadataStringArray(skill.metadata, 'skillRefs')) {
      const referencedSkill = registry.skills.get(ref)
      if (!referencedSkill) {
        error(issues, 'pack.skill_ref.missing', `pack ${pack.id} includes skill ${skill.id} but referenced skill ${ref} is missing`, pack.id)
      } else if (!pack.skills.includes(ref)) {
        error(issues, 'pack.skill_ref.uncovered', `pack ${pack.id} includes skill ${skill.id} but does not include referenced skill ${ref}`, pack.id)
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
  if (skill.loadMode === 'on_demand' && (skill.triggers?.length ?? 0) === 0) {
    error(issues, 'skill.on_demand.triggers.empty', `on-demand skill ${skill.id} must declare triggers`, skill.id)
  }
  lintRiskyToolBoundary(skill, registry, issues)
  if (/^\s*\{\s*"/m.test(skill.instructionTemplate)) {
    warning(issues, 'skill.inline_json_shape', `skill ${skill.id} appears to inline a JSON shape; use schema refs`, skill.id)
  }
  for (const ref of skill.toolGrants ?? []) {
    const name = ref.trim()
    if (!registry.tools.has(name)) error(issues, 'skill.tool_grant.missing', `skill ${skill.id} references missing tool ${name}`, skill.id)
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
}

function lintRiskyToolBoundary(skill: SkillDefinition, registry: CatalogRegistry, issues: CatalogIssue[]): void {
  const riskyRefs = (skill.toolGrants ?? [])
    .map((ref) => ref.trim())
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
      'skill.risky_tool.boundary.missing',
      `skill ${skill.id} references risky tools (${riskyRefs.map((tool) => tool.name).join(', ')}) but is missing boundary sections: ${missing.join(', ')}`,
      skill.id,
    )
  }
}

function lintTool(tool: ToolDefinition, issues: CatalogIssue[]): void {
  if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
    error(issues, 'tool.input_schema.missing', `tool ${tool.name} must declare inputSchema`, tool.name)
  }
  if (/(use when|do not use|when the user asks|use this only|only when the user|recommended .*loop|enter the .*task)/i.test(tool.description)) {
    warning(issues, 'tool.description.polluted', `tool ${tool.name} description includes task-selection language`, tool.name)
  }
  if ((tool.source === 'plugin' || tool.source === 'mcp') && !tool.pluginId && tool.source === 'plugin') {
    error(issues, 'tool.plugin_id.missing', `plugin tool ${tool.name} must declare pluginId`, tool.name)
  }
  if ((tool.source === 'plugin' || tool.source === 'mcp') && tool.risk === 'destructive') {
    error(issues, 'tool.destructive.external', `external tool ${tool.name} cannot use destructive risk`, tool.name)
  }
}

function stripRef(ref: string, prefix: string): string {
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref
}

function metadataStringArray(metadata: SkillDefinition['metadata'], key: string): string[] {
  const value = metadata?.[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : []
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
