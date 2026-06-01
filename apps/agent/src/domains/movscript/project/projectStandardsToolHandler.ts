import type { RuntimeToolHandler } from '../../../ports/runtime/runtimeToolHandlerPort.js'
import type { AgentRun, JSONValue } from '../../../state/types.js'
import { isJSONRecord } from '../../../jsonValue.js'
import { isValidAgentProjectId } from '../../../context/runtimeContext.js'

export function createMovscriptProjectStandardsToolHandler(): RuntimeToolHandler {
  return {
    toolNames: ['movscript_project_standards_get'],
    async execute({ args, run, projectStandardsPort }) {
      const projectId = projectIdField(args.projectId)
        ?? projectIdField(args.project_id)
        ?? projectIdFromRunContext(run)
      if (projectId === undefined) throw new Error('get_project_standards requires projectId')
      const contextProject = projectFromRunContext(run, projectId)
      const loaded = await projectStandardsPort.loadProject({
        projectId,
        run,
        ...(contextProject ? { fallbackProject: contextProject } : {}),
      })
      return {
        result: buildProjectStandardsToolResult(projectId, loaded.project, {
          source: loaded.source,
          backendRead: loaded.backendRead,
        }) as unknown as JSONValue,
      }
    },
  }
}

function projectIdField(value: JSONValue | undefined): number | undefined {
  return isValidAgentProjectId(value) ? value : undefined
}

function projectIdFromRunContext(run: AgentRun): number | undefined {
  const context = isJSONRecord(run.metadata?.context) ? run.metadata.context : undefined
  const project = isJSONRecord(context?.project) ? context.project : undefined
  const pageContext = isJSONRecord(context?.pageContext) ? context.pageContext : undefined
  return projectIdField(project?.id)
    ?? projectIdField(project?.ID)
    ?? projectIdField(pageContext?.pageEntityType === 'project' ? pageContext.pageEntityId : undefined)
}

function projectFromRunContext(run: AgentRun, projectId: number): Record<string, JSONValue> | undefined {
  const context = isJSONRecord(run.metadata?.context) ? run.metadata.context : undefined
  const project = isJSONRecord(context?.project) ? context.project : undefined
  const candidateId = projectIdField(project?.id) ?? projectIdField(project?.ID)
  return candidateId === projectId ? project : undefined
}

function buildProjectStandardsToolResult(
  projectId: number,
  project: Record<string, JSONValue> | undefined,
  meta: {
    source: 'backend' | 'run_context' | 'unavailable'
    backendRead?: { performed: boolean; skippedReason?: string; response?: JSONValue }
  },
): Record<string, JSONValue> {
  const warnings: string[] = []
  if (!project) {
    if (meta.backendRead?.skippedReason) warnings.push(meta.backendRead.skippedReason)
    return {
      loaded: false,
      projectId,
      source: meta.source,
      standards: null,
      warnings,
      message: 'Project standards are unavailable because no backend project record or run context project snapshot was available.',
    }
  }

  const projectStyleRaw = project.project_style ?? project.projectStyle
  const parsedStyle = parseProjectStyle(projectStyleRaw)
  if (parsedStyle.warning) warnings.push(parsedStyle.warning)
  if (meta.backendRead?.skippedReason && meta.source !== 'backend') warnings.push(meta.backendRead.skippedReason)

  const aspectRatio = stringField(project.aspect_ratio) ?? stringField(project.aspectRatio) ?? stringField(parsedStyle.style.aspect_ratio)
  const visualStyle = stringField(project.visual_style) ?? stringField(project.visualStyle) ?? stringField(parsedStyle.style.visual_style)
  const core = compactJSONRecord({
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    ...(visualStyle ? { visual_style: visualStyle } : {}),
    ...pickProjectStyleCore(parsedStyle.style),
  })
  const customRules = normalizeProjectStandardsRules(parsedStyle.style.custom_rules)
  const enabledCustomRules = customRules.filter((rule) => rule.enabled !== false)
  const promptSections = groupProjectStandardsRules(enabledCustomRules)
  const styleReferenceResourceIds = collectStyleReferenceResourceIds(enabledCustomRules)

  return {
    loaded: true,
    projectId,
    projectName: stringField(project.name) ?? stringField(project.title) ?? '',
    source: meta.source,
    standards: compactJSONRecord({
      core,
      custom_rules: customRules,
      enabled_custom_rules: enabledCustomRules,
      prompt_sections: promptSections,
      style_reference_resource_ids: styleReferenceResourceIds,
      project_style: parsedStyle.style,
      ...(typeof projectStyleRaw === 'string' ? { project_style_raw: projectStyleRaw } : {}),
      ...(stringField(project.UpdatedAt) ? { updated_at: stringField(project.UpdatedAt) } : {}),
      ...(stringField(project.updated_at) ? { updated_at: stringField(project.updated_at) } : {}),
    }),
    warnings,
    message: 'Project standards loaded. Use these standards for project-scoped creative planning, writing, prompt, asset, production, and generation work. If standards.style_reference_resource_ids is non-empty and an image/video generation tool supports reference_resource_ids, pass those ids as visual style references.',
  }
}

function parseProjectStyle(value: JSONValue | undefined): { style: Record<string, JSONValue>; warning?: string } {
  if (isJSONRecord(value)) return { style: value }
  if (typeof value !== 'string' || !value.trim()) return { style: {} }
  try {
    const parsed = JSON.parse(value) as JSONValue
    if (isJSONRecord(parsed)) return { style: parsed }
    return { style: {}, warning: 'project_style was present but was not a JSON object.' }
  } catch (error) {
    return {
      style: {},
      warning: `project_style could not be parsed as JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

function pickProjectStyleCore(style: Record<string, JSONValue>): Record<string, JSONValue> {
  const out: Record<string, JSONValue> = {}
  for (const key of [
    'shot_size_system',
    'camera_language',
    'lighting_style',
    'color_palette',
    'pacing_rules',
    'negative_rules',
  ]) {
    const value = style[key]
    if (projectStandardValueText(value)) out[key] = value
  }
  return out
}

function normalizeProjectStandardsRules(value: JSONValue | undefined): Array<Record<string, JSONValue>> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!isJSONRecord(item)) return []
    const label = stringField(item.label) ?? stringField(item.name) ?? stringField(item.key) ?? `custom_rule_${index + 1}`
    const key = stringField(item.key) ?? label.toLowerCase().replace(/\s+/g, '_')
    const ruleValue = projectStandardValueText(item.value ?? item.content ?? item.description)
    if (!ruleValue) return []
    const role = normalizeProjectStandardsPromptRole(item.prompt_role ?? item.promptRole ?? item.role)
    return [compactJSONRecord({
      id: stringField(item.id) ?? `rule_${key}_${index + 1}`,
      key,
      label,
      category: stringField(item.category) ?? '',
      value: ruleValue,
      prompt_role: role,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      required: typeof item.required === 'boolean' ? item.required : false,
      order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : (index + 1) * 10,
    })]
  })
    .sort((a, b) => (numberField(a.order) ?? 0) - (numberField(b.order) ?? 0) || String(a.label ?? '').localeCompare(String(b.label ?? '')))
}

function groupProjectStandardsRules(rules: Array<Record<string, JSONValue>>): Record<string, JSONValue> {
  const sections: Record<string, JSONValue[]> = {
    context: [],
    style: [],
    constraint: [],
    negative: [],
    quality_gate: [],
  }
  for (const rule of rules) {
    const role = normalizeProjectStandardsPromptRole(rule.prompt_role)
    sections[role]!.push(rule)
  }
  return compactJSONRecord(sections)
}

function collectStyleReferenceResourceIds(rules: Array<Record<string, JSONValue>>): string[] {
  const ids = new Set<string>()
  for (const rule of rules) {
    const role = normalizeProjectStandardsPromptRole(rule.prompt_role)
    const text = [
      stringField(rule.key),
      stringField(rule.label),
      stringField(rule.category),
      projectStandardValueText(rule.value),
    ].filter(Boolean).join('\n')
    if (role !== 'style' && !/(style|visual|reference|参考|画风|风格)/i.test(text)) continue
    for (const id of extractReferenceResourceIds(text)) ids.add(id)
  }
  return Array.from(ids)
}

function extractReferenceResourceIds(value: string): string[] {
  const ids = new Set<string>()
  const text = value.trim()
  const resourcePattern = /(?:resource|resource_id|resourceId|资源)\s*#?\s*(\d+)/gi
  for (const match of text.matchAll(resourcePattern)) {
    if (match[1]) ids.add(match[1])
  }
  const listPattern = /(?:reference_resource_ids?|resource_ids?|resources?)\s*[:=]\s*([0-9,\s#]+)/gi
  for (const match of text.matchAll(listPattern)) {
    const list = match[1] ?? ''
    for (const id of list.match(/\d+/g) ?? []) ids.add(id)
  }
  return Array.from(ids)
}

function normalizeProjectStandardsPromptRole(value: JSONValue | undefined): 'context' | 'style' | 'constraint' | 'negative' | 'quality_gate' {
  return value === 'context' || value === 'style' || value === 'constraint' || value === 'negative' || value === 'quality_gate'
    ? value
    : 'constraint'
}

function projectStandardValueText(value: JSONValue | undefined): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => projectStandardValueText(item)).filter(Boolean).join('; ')
  return ''
}

function compactJSONRecord(value: Record<string, JSONValue>): Record<string, JSONValue> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (item === undefined || item === null) return false
    if (typeof item === 'string') return item.trim().length > 0
    if (Array.isArray(item)) return item.length > 0
    if (isJSONRecord(item)) return Object.keys(item).length > 0
    return true
  })) as Record<string, JSONValue>
}

function stringField(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function numberField(value: JSONValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}
