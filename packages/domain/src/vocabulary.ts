import type {
  MovScriptDomainDiagnostic,
  MovScriptNamespaceVocabulary,
  MovScriptNormalizedNamespaceVocabulary,
} from './types.js'

export const MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES = {
  video: ['hook', 'proof', 'demo', 'cta'],
  film: ['act', 'sequence', 'beat'],
  episode: ['act', 'sequence', 'beat'],
  lesson: ['segment'],
  custom: [],
} as const

export type MovScriptProductionTypeTemplate = keyof typeof MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES

export const MOVSCRIPT_TIMELINE_NAMESPACE_TEMPLATE_ALIASES = {
  short_video: 'video',
  series: 'episode',
  course: 'lesson',
} as const satisfies Record<string, MovScriptProductionTypeTemplate>

export const MOVSCRIPT_TIMELINE_NAMESPACE_TEMPLATES = {
  ...MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES,
  short_video: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.video,
  series: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.episode,
  course: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.lesson,
} as const

export type MovScriptTimelineNamespaceTemplate = keyof typeof MOVSCRIPT_TIMELINE_NAMESPACE_TEMPLATES

export const MOVSCRIPT_TIMELINE_NAMESPACE_TEMPLATE_STRATEGIES = {
  video: {
    productionType: 'video',
    namespaces: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.video,
    initialNamespaces: ['production'],
    defaultPreviewKind: 'production',
  },
  film: {
    productionType: 'film',
    namespaces: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.film,
    initialNamespaces: ['production'],
    defaultPreviewKind: 'production',
  },
  episode: {
    productionType: 'episode',
    namespaces: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.episode,
    initialNamespaces: ['production'],
    defaultPreviewKind: 'production',
  },
  lesson: {
    productionType: 'lesson',
    namespaces: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.lesson,
    initialNamespaces: ['production'],
    defaultPreviewKind: 'production',
  },
  custom: {
    productionType: 'custom',
    namespaces: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.custom,
    initialNamespaces: ['production'],
    defaultPreviewKind: 'production',
  },
  short_video: {
    productionType: 'video',
    namespaces: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.video,
    initialNamespaces: ['production'],
    defaultPreviewKind: 'production',
  },
  series: {
    productionType: 'episode',
    namespaces: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.episode,
    initialNamespaces: ['production'],
    defaultPreviewKind: 'production',
  },
  course: {
    productionType: 'lesson',
    namespaces: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.lesson,
    initialNamespaces: ['production'],
    defaultPreviewKind: 'production',
  },
} as const

export const MOVSCRIPT_DEFAULT_TIMELINE_NAMESPACES = ['episode', 'act', 'beat'] as const
export const MOVSCRIPT_DEFAULT_SETTING_NAMESPACES = ['character', 'costume', 'state'] as const

export interface MovScriptNamespaceVocabularyFallbacks {
  timelineNamespaces?: readonly string[]
  settingNamespaces?: readonly string[]
}

export function normalizeNamespaceVocabulary(input: unknown): MovScriptNormalizedNamespaceVocabulary {
  const record = isRecord(input) ? input : {}
  const nested = isRecord(record.namespace_vocabulary)
    ? record.namespace_vocabulary
    : isRecord(record.namespaceVocabulary)
      ? record.namespaceVocabulary
      : {}
  const timelineTemplate = stringField(
    nested.timeline_template
      ?? nested.timelineTemplate
      ?? record.timeline_template
      ?? record.timelineTemplate,
  )
  const templateNamespaces = timelineTemplate && isTimelineNamespaceTemplate(timelineTemplate)
    ? [...MOVSCRIPT_TIMELINE_NAMESPACE_TEMPLATES[timelineTemplate]]
    : []
  const timelineNamespaces = uniqueStrings([
    ...templateNamespaces,
    ...stringArray(nested.timeline_namespaces ?? nested.timelineNamespaces),
    ...stringArray(record.timeline_namespaces ?? record.timelineNamespaces),
  ])
  const settingNamespaces = uniqueStrings([
    ...stringArray(nested.setting_namespaces ?? nested.settingNamespaces),
    ...stringArray(record.setting_namespaces ?? record.settingNamespaces),
  ])
  const diagnostics: MovScriptDomainDiagnostic[] = []
  if (timelineTemplate && !isTimelineNamespaceTemplate(timelineTemplate)) {
    diagnostics.push({
      severity: 'warning',
      code: 'namespace_template_unknown',
      message: `unknown timeline namespace template: ${timelineTemplate}`,
      field: 'timeline_template',
    })
  }
  return {
    timelineNamespaces,
    settingNamespaces,
    ...(timelineTemplate ? { timelineTemplate } : {}),
    diagnostics,
  }
}

export function namespaceVocabularyWithFallbacks(
  vocabulary: Partial<MovScriptNamespaceVocabulary> | undefined,
  fallbacks: MovScriptNamespaceVocabularyFallbacks = {},
): MovScriptNamespaceVocabulary {
  return {
    timelineNamespaces: uniqueStrings([
      ...(vocabulary?.timelineNamespaces ?? []),
      ...(fallbacks.timelineNamespaces ?? MOVSCRIPT_DEFAULT_TIMELINE_NAMESPACES),
    ]),
    settingNamespaces: uniqueStrings([
      ...(vocabulary?.settingNamespaces ?? []),
      ...(fallbacks.settingNamespaces ?? MOVSCRIPT_DEFAULT_SETTING_NAMESPACES),
    ]),
    ...(vocabulary?.timelineTemplate ? { timelineTemplate: vocabulary.timelineTemplate } : {}),
  }
}

export function rootTimelineNamespaceKind(vocabulary: Partial<MovScriptNamespaceVocabulary> | undefined): string {
  return firstNamespaceKind(
    vocabulary?.timelineNamespaces,
    MOVSCRIPT_DEFAULT_TIMELINE_NAMESPACES[0],
  )
}

export function rootSettingNamespaceKind(vocabulary: Partial<MovScriptNamespaceVocabulary> | undefined): string {
  return firstNamespaceKind(
    vocabulary?.settingNamespaces,
    MOVSCRIPT_DEFAULT_SETTING_NAMESPACES[0],
  )
}

export function childTimelineNamespaceKind(
  parentKind: string | undefined,
  vocabulary: Partial<MovScriptNamespaceVocabulary> | undefined,
): string {
  const namespaces = namespaceOrder(vocabulary?.timelineNamespaces, MOVSCRIPT_DEFAULT_TIMELINE_NAMESPACES)
  return nextNamespaceKind(parentKind, namespaces, namespaces.at(-1) ?? MOVSCRIPT_DEFAULT_TIMELINE_NAMESPACES.at(-1) ?? 'beat')
}

export function childSettingNamespaceKind(
  parentKind: string | undefined,
  vocabulary: Partial<MovScriptNamespaceVocabulary> | undefined,
): string {
  const namespaces = namespaceOrder(vocabulary?.settingNamespaces, MOVSCRIPT_DEFAULT_SETTING_NAMESPACES)
  return nextNamespaceKind(parentKind, namespaces, namespaces.at(-1) ?? MOVSCRIPT_DEFAULT_SETTING_NAMESPACES.at(-1) ?? 'state')
}

export function nextNamespaceKind(
  parentKind: string | undefined,
  orderedNamespaces: readonly string[],
  fallbackKind: string,
): string {
  const parent = stringField(parentKind)
  const namespaces = namespaceOrder(orderedNamespaces, [fallbackKind])
  const parentIndex = parent ? namespaces.indexOf(parent) : -1
  const nextKind = namespaces[parentIndex + 1]
  if (parentIndex >= 0 && nextKind) return nextKind
  return namespaces.find((kind) => kind !== parent) ?? fallbackKind
}

export function timelineNamespaceTemplateInitialNamespaces(value: string | undefined): readonly string[] {
  const template = value && isTimelineNamespaceTemplate(value) ? value : undefined
  if (!template) return ['production']
  return MOVSCRIPT_TIMELINE_NAMESPACE_TEMPLATE_STRATEGIES[template].initialNamespaces
}

export function timelineNamespaceTemplateDefaultPreviewKind(value: string | undefined): string {
  const template = value && isTimelineNamespaceTemplate(value) ? value : undefined
  if (!template) return 'production'
  return MOVSCRIPT_TIMELINE_NAMESPACE_TEMPLATE_STRATEGIES[template].defaultPreviewKind
}

export function timelineNamespaceRootDefaultPreviewKind(rootKind: string | undefined, template?: string): string {
  if (template?.trim()) return timelineNamespaceTemplateDefaultPreviewKind(template)
  const normalizedRootKind = stringField(rootKind)
  return normalizedRootKind ?? 'production'
}

export function canonicalProductionTypeTemplate(value: string | undefined): MovScriptProductionTypeTemplate | undefined {
  const normalized = stringField(value)
  if (!normalized) return undefined
  if (isProductionTypeTemplate(normalized)) return normalized
  const alias = MOVSCRIPT_TIMELINE_NAMESPACE_TEMPLATE_ALIASES[normalized as keyof typeof MOVSCRIPT_TIMELINE_NAMESPACE_TEMPLATE_ALIASES]
  return alias
}

export function timelineNamespaceTemplateNamespaces(value: string | undefined): readonly string[] {
  const canonical = canonicalProductionTypeTemplate(value)
  if (!canonical) return MOVSCRIPT_DEFAULT_TIMELINE_NAMESPACES
  return MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES[canonical]
}

export function isProductionTypeTemplate(value: string): value is MovScriptProductionTypeTemplate {
  return Object.prototype.hasOwnProperty.call(MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES, value)
}

export function isTimelineNamespaceTemplate(value: string): value is keyof typeof MOVSCRIPT_TIMELINE_NAMESPACE_TEMPLATES {
  return Object.prototype.hasOwnProperty.call(MOVSCRIPT_TIMELINE_NAMESPACE_TEMPLATES, value)
}

function firstNamespaceKind(values: readonly string[] | undefined, fallback: string): string {
  return namespaceOrder(values ?? [], [fallback])[0] ?? fallback
}

function namespaceOrder(values: readonly string[] | undefined, fallback: readonly string[]): string[] {
  const normalized = uniqueStrings([...(values ?? [])])
  return normalized.length ? normalized : uniqueStrings([...fallback])
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
    : []
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
