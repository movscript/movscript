import {
  MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES,
  canonicalProductionTypeTemplate,
  timelineNamespaceRootDefaultPreviewKind,
  timelineNamespaceTemplateDefaultPreviewKind,
  timelineNamespaceTemplateInitialNamespaces,
  type MovScriptProductionTypeTemplate,
} from '@movscript/domain'

export type ContentCanvasTimelineProfileId = MovScriptProductionTypeTemplate

export interface ContentCanvasTimelineProfileOption {
  value: ContentCanvasTimelineProfileId
  label: string
  description: string
  namespaces: readonly string[]
  initialNamespaces: readonly string[]
  defaultPreviewKind: string
}

export const DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE: ContentCanvasTimelineProfileId = 'video'

export const CONTENT_CANVAS_TIMELINE_PROFILE_OPTIONS: readonly ContentCanvasTimelineProfileOption[] = [
  {
    value: 'video',
    label: '短视频',
    description: '制作类型：短视频；推荐内部层级 hook / proof / demo / cta',
    namespaces: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.video,
    initialNamespaces: timelineNamespaceTemplateInitialNamespaces('video'),
    defaultPreviewKind: timelineNamespaceTemplateDefaultPreviewKind('video'),
  },
  {
    value: 'film',
    label: '电影',
    description: '制作类型：电影；推荐内部层级 act / sequence / beat',
    namespaces: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.film,
    initialNamespaces: timelineNamespaceTemplateInitialNamespaces('film'),
    defaultPreviewKind: timelineNamespaceTemplateDefaultPreviewKind('film'),
  },
  {
    value: 'episode',
    label: '剧集单集',
    description: '制作类型：单集；推荐内部层级 act / sequence / beat',
    namespaces: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.episode,
    initialNamespaces: timelineNamespaceTemplateInitialNamespaces('episode'),
    defaultPreviewKind: timelineNamespaceTemplateDefaultPreviewKind('episode'),
  },
  {
    value: 'lesson',
    label: '课程小节',
    description: '制作类型：课程小节；推荐内部层级 segment',
    namespaces: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.lesson,
    initialNamespaces: timelineNamespaceTemplateInitialNamespaces('lesson'),
    defaultPreviewKind: timelineNamespaceTemplateDefaultPreviewKind('lesson'),
  },
  {
    value: 'custom',
    label: '自定义',
    description: '制作类型：自定义；由用户填写内部时间层级',
    namespaces: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.custom,
    initialNamespaces: timelineNamespaceTemplateInitialNamespaces('custom'),
    defaultPreviewKind: timelineNamespaceTemplateDefaultPreviewKind('custom'),
  },
]

export function contentCanvasTimelineProfileOption(
  value: string | undefined,
): ContentCanvasTimelineProfileOption {
  const normalizedValue = canonicalProductionTypeTemplate(value) ?? DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE
  const option = CONTENT_CANVAS_TIMELINE_PROFILE_OPTIONS.find((item) => item.value === normalizedValue)
    ?? CONTENT_CANVAS_TIMELINE_PROFILE_OPTIONS.find((item) => item.value === DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE)
  if (option) return option
  return {
    value: DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE,
    label: '短视频',
    description: '制作类型：短视频；推荐内部层级 hook / proof / demo / cta',
    namespaces: MOVSCRIPT_PRODUCTION_TYPE_TEMPLATES.video,
    initialNamespaces: timelineNamespaceTemplateInitialNamespaces('video'),
    defaultPreviewKind: timelineNamespaceTemplateDefaultPreviewKind('video'),
  }
}

export function contentCanvasTimelineProfileRootKind(profile: string | undefined): string {
  void profile
  return 'production'
}

export function contentCanvasTimelineProfileInitialNamespaceKinds(profile: string | undefined): readonly string[] {
  const option = contentCanvasTimelineProfileOption(profile)
  return option.initialNamespaces.length ? option.initialNamespaces : [contentCanvasTimelineProfileRootKind(profile)]
}

export function contentCanvasTimelineProfileDefaultPreviewKind(profile: string | undefined): string {
  const option = contentCanvasTimelineProfileOption(profile)
  return option.defaultPreviewKind || contentCanvasTimelineProfileRootKind(profile)
}

export function contentCanvasTimelineRootDefaultPreviewKind(rootKind: string | undefined, profile?: string): string {
  return timelineNamespaceRootDefaultPreviewKind(rootKind, profile)
}

export function contentCanvasTimelineProfileProductionType(profile: string | undefined): ContentCanvasTimelineProfileId {
  return contentCanvasTimelineProfileOption(profile).value
}

export function contentCanvasTimelineProfileNamespaces(profile: string | undefined): readonly string[] {
  if (!profile?.trim()) return contentCanvasTimelineProfileOption(profile).namespaces
  const normalized = canonicalProductionTypeTemplate(profile)
  return normalized ? contentCanvasTimelineProfileOption(normalized).namespaces : []
}

export function contentCanvasParseTimelineNamespaces(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter((item, index, items) => item.length > 0 && items.indexOf(item) === index)
}

export function contentCanvasTimelineProfileChildKind(
  profile: string | undefined,
  parentKind: string | undefined,
): string | undefined {
  const namespaces = contentCanvasTimelineProfileOption(profile).namespaces
  if (parentKind === 'production') return namespaces[0]
  const parentIndex = parentKind ? namespaces.indexOf(parentKind) : -1
  return parentIndex >= 0 ? namespaces[parentIndex + 1] : undefined
}
