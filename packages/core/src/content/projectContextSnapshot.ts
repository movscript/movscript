export interface ProjectContextSnapshotEntity {
  id?: string | number
  path?: string
  record?: Record<string, unknown>
}

export interface ProjectNamespaceVocabularySnapshot {
  timelineTemplate?: unknown
  timelineNamespaces?: unknown[]
  settingNamespaces?: unknown[]
  diagnostics?: unknown[]
}

export interface BuildProjectContextSnapshotInput {
  standardsEntity?: ProjectContextSnapshotEntity
  namespaceVocabulary?: ProjectNamespaceVocabularySnapshot
}

const PROJECT_CONTEXT_STYLE_REFERENCE_RULE_KEY = 'style_reference_images'
const PROJECT_CONTEXT_CORE_STANDARDS = [
  { key: 'aspect_ratio', label: '画幅比例', promptRole: 'context' },
  { key: 'visual_style', label: '视觉风格', promptRole: 'style' },
  { key: 'shot_size_system', label: '镜头大小体系', promptRole: 'style' },
  { key: 'camera_language', label: '镜头语言', promptRole: 'style' },
  { key: 'lighting_style', label: '灯光规则', promptRole: 'style' },
  { key: 'color_palette', label: '色彩规则', promptRole: 'style' },
  { key: 'pacing_rules', label: '节奏规则', promptRole: 'constraint' },
  { key: 'negative_rules', label: '负面规则', promptRole: 'negative' },
] as const

type ProjectContextPromptRole = typeof PROJECT_CONTEXT_CORE_STANDARDS[number]['promptRole'] | 'quality_gate'
type ProjectContextCoreStandard = {
  key: string
  label: string
  prompt_role: ProjectContextPromptRole
  required?: boolean
  value: string
  filled?: boolean
}
type ProjectContextRule = ProjectContextCoreStandard & {
  id: string
  category: string
  enabled: boolean
  required: boolean
  order: number
}

export function buildProjectContextSnapshot(input: BuildProjectContextSnapshotInput): Record<string, unknown> {
  const entity = input.standardsEntity
  const standards = entity?.record ?? {}
  const namespaceVocabulary = input.namespaceVocabulary ?? {
    timelineTemplate: undefined,
    timelineNamespaces: [],
    settingNamespaces: [],
    diagnostics: [],
  }
  const projectStyle = parseProjectStyle(standards.project_style)
  const core = PROJECT_CONTEXT_CORE_STANDARDS.map((item) => {
    const value = projectContextFieldText(item.key === 'aspect_ratio'
      ? standards.aspect_ratio ?? projectStyle.aspect_ratio
      : item.key === 'visual_style'
        ? standards.visual_style ?? projectStyle.visual_style
        : projectStyle[item.key] ?? standards[item.key])
    return {
      key: item.key,
      label: item.label,
      prompt_role: item.promptRole,
      required: true,
      value,
      filled: Boolean(value),
    }
  })
  const customRules = normalizeProjectContextRules(projectStyle.custom_rules)
  const enabledRules = customRules.filter((rule) => rule.enabled && rule.value)
  const promptPreview = buildProjectContextPromptPreview(core, enabledRules)
  const styleReferenceResourceIds = Array.from(new Set(
    enabledRules.flatMap((rule) => rule.key === PROJECT_CONTEXT_STYLE_REFERENCE_RULE_KEY ? extractProjectContextResourceIds(rule.value) : []),
  ))

  return {
    schema: 'movscript.project_context_snapshot.v1',
    kind: 'project_context_snapshot',
    source: {
      entity_kind: 'project_standards',
      entity_id: entity?.id ?? standards.id ?? 'project_standards',
      path: entity?.path ?? 'project_standards.json',
      updated_at: standards.updated_at,
    },
    namespace_vocabulary: {
      timeline_template: namespaceVocabulary.timelineTemplate,
      timeline_namespaces: namespaceVocabulary.timelineNamespaces,
      setting_namespaces: namespaceVocabulary.settingNamespaces,
      diagnostics: namespaceVocabulary.diagnostics,
    },
    standards_hash: stableProjectContextHash({
      aspect_ratio: standards.aspect_ratio,
      visual_style: standards.visual_style,
      project_style: projectStyle,
      namespace_vocabulary: namespaceVocabulary,
    }),
    core_standards: core,
    missing_core_keys: core.filter((item) => !item.filled).map((item) => item.key),
    missing_core_labels: core.filter((item) => !item.filled).map((item) => item.label),
    custom_rules: customRules,
    enabled_rules: enabledRules,
    style_reference_resource_ids: styleReferenceResourceIds,
    prompt_preview: promptPreview,
    agent_guidance: [
      'Read this snapshot before planning, content-unit work, or generation that depends on project house style or constraints.',
      'Use namespace_vocabulary for project-specific timeline/setting terms; do not infer concrete parent relationships from vocabulary templates.',
      'Do not modify project standards just because fields are missing; only use domain_upsert_project_standards when the user asks to add, remove, or change standards.',
      'When visual generation supports reference images, pass style_reference_resource_ids as house-style reference_resource_ids.',
    ],
  }
}

function parseProjectStyle(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function projectContextFieldText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => projectContextFieldText(item)).filter(Boolean).join('；')
  if (isRecord(value)) {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function normalizeProjectContextRules(value: unknown): ProjectContextRule[] {
  const rules = Array.isArray(value) ? value.filter(isRecord) : []
  return rules
    .map((rule, index) => {
      const key = projectContextFieldText(rule.key).toLowerCase().replace(/\s+/g, '_')
      const label = projectContextFieldText(rule.label ?? rule.name ?? rule.key) || `扩展规范 ${index + 1}`
      const ruleValue = projectContextFieldText(rule.value ?? rule.content ?? rule.description)
      return {
        id: projectContextFieldText(rule.id) || `rule_${key || index}_${index}`,
        key: key || label.toLowerCase().replace(/\s+/g, '_'),
        label,
        category: projectContextFieldText(rule.category) || '通用',
        value: ruleValue,
        prompt_role: normalizeProjectContextPromptRole(rule.prompt_role ?? rule.promptRole ?? rule.role),
        enabled: typeof rule.enabled === 'boolean' ? rule.enabled : true,
        required: typeof rule.required === 'boolean' ? rule.required : false,
        order: numberValue(rule.order) ?? (index + 1) * 10,
      }
    })
    .filter((rule) => rule.key || rule.label || rule.value)
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
}

function normalizeProjectContextPromptRole(value: unknown): ProjectContextPromptRole {
  if (value === 'context' || value === 'style' || value === 'constraint' || value === 'negative' || value === 'quality_gate') return value
  return 'constraint'
}

function buildProjectContextPromptPreview(
  core: ProjectContextCoreStandard[],
  rules: ProjectContextRule[],
): string {
  const items = [
    ...core.filter((item) => item.value),
    ...rules.filter((item) => item.value),
  ]
  const sections = [
    { role: 'context', title: '项目背景规范' },
    { role: 'style', title: '视觉与表达规范' },
    { role: 'constraint', title: '必须遵守' },
    { role: 'negative', title: '禁止出现' },
    { role: 'quality_gate', title: '质检口径' },
  ].flatMap((section) => {
    const sectionItems = items.filter((item) => item.prompt_role === section.role)
    if (sectionItems.length === 0) return []
    return [`${section.title}：`, ...sectionItems.map((item) => `- ${item.label}：${item.value}`)]
  })
  return sections.length > 0 ? `项目规范：\n${sections.join('\n')}` : '项目规范：\n- 暂无已启用规范。'
}

function extractProjectContextResourceIds(value: string): number[] {
  const ids = new Set<number>()
  for (const pattern of [/resource#(\d+)/gi, /reference_resource_ids\s*[:=]\s*\[?([0-9,\s]+)\]?/gi]) {
    for (const match of value.matchAll(pattern)) {
      const idText = match[1] ?? ''
      for (const part of idText.split(',')) {
        const id = Number(part.trim())
        if (Number.isInteger(id) && id > 0) ids.add(id)
      }
    }
  }
  return Array.from(ids)
}

function stableProjectContextHash(value: unknown): string {
  const text = stableStringify(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}
