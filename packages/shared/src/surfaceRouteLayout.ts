export type SharedSurfaceArea =
  | 'home'
  | 'project'
  | 'workflow'
  | 'tool'
  | 'editing'
  | 'agent'
  | 'settings'

export type SharedSurfacePrimaryNavKey = 'project' | 'workflow' | 'tool' | 'editing'
export type SharedSurfaceHost = 'desktop' | 'local-web' | 'any'
export type SharedSurfaceScrollMode = 'document' | 'workspace' | 'canvas' | 'hidden'
export type SharedSurfaceShellLayout = 'stacked' | 'flush'
export type SharedSurfaceContentWidth = 'narrow' | 'normal' | 'wide' | 'xwide' | 'full'

export interface SharedSurfacePrimaryNavItem {
  key: SharedSurfacePrimaryNavKey
  labelKey: string
  routeId: string
}

export interface SharedSurfaceRouteDefinition {
  routeId: string
  routeAliases?: readonly string[]
  area: SharedSurfaceArea
  primaryNavKey?: SharedSurfacePrimaryNavKey
  desktopPathPatterns?: readonly string[]
  localPathPatterns?: readonly string[]
  scrollMode: SharedSurfaceScrollMode
  shellLayout: SharedSurfaceShellLayout
  contentWidth?: SharedSurfaceContentWidth
  notes?: string
}

export const sharedSurfacePrimaryNavItems: readonly SharedSurfacePrimaryNavItem[] = [
  { key: 'project', labelKey: 'surfaceNavigation.primary.project', routeId: 'projects' },
  { key: 'workflow', labelKey: 'surfaceNavigation.primary.workflow', routeId: 'canvases' },
  { key: 'tool', labelKey: 'surfaceNavigation.primary.tool', routeId: 'tools.home' },
  { key: 'editing', labelKey: 'surfaceNavigation.primary.editing', routeId: 'editing' },
] as const

export const sharedSurfaceRouteDefinitions: readonly SharedSurfaceRouteDefinition[] = [
  route({
    routeId: 'home',
    area: 'home',
    desktopPathPatterns: ['/'],
    localPathPatterns: ['/'],
    scrollMode: 'document',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'projects',
    area: 'project',
    primaryNavKey: 'project',
    desktopPathPatterns: ['/projects'],
    localPathPatterns: ['/projects', '/studio'],
    scrollMode: 'document',
    shellLayout: 'stacked',
    contentWidth: 'xwide',
  }),
  route({
    routeId: 'project.overview',
    routeAliases: ['project.home', 'studio.overview'],
    area: 'project',
    primaryNavKey: 'project',
    desktopPathPatterns: ['/project/home', '/studio/:projectId/overview'],
    localPathPatterns: ['/studio/:projectId/overview'],
    scrollMode: 'document',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'project.settings',
    routeAliases: ['studio.settings'],
    area: 'project',
    primaryNavKey: 'project',
    desktopPathPatterns: ['/project/settings', '/studio/:projectId/settings'],
    localPathPatterns: ['/studio/:projectId/settings'],
    scrollMode: 'document',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'project.scripts',
    routeAliases: ['studio.scripts'],
    area: 'project',
    primaryNavKey: 'project',
    desktopPathPatterns: ['/project/scripts/workbench', '/studio/:projectId/scripts'],
    localPathPatterns: ['/studio/:projectId/scripts'],
    scrollMode: 'workspace',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'project.standards',
    routeAliases: ['studio.standards'],
    area: 'project',
    primaryNavKey: 'project',
    desktopPathPatterns: ['/project/standards', '/studio/:projectId/standards'],
    localPathPatterns: ['/studio/:projectId/standards'],
    scrollMode: 'workspace',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'project.content',
    routeAliases: ['studio.content'],
    area: 'workflow',
    primaryNavKey: 'workflow',
    desktopPathPatterns: ['/project/content', '/studio/:projectId/content'],
    localPathPatterns: ['/studio/:projectId/content'],
    scrollMode: 'canvas',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'project.content.canvas',
    routeAliases: ['studio.contentCanvas'],
    area: 'workflow',
    primaryNavKey: 'workflow',
    desktopPathPatterns: ['/project/content/canvas', '/studio/:projectId/content/canvas'],
    localPathPatterns: ['/studio/:projectId/content/canvas'],
    scrollMode: 'canvas',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'project.content.preview',
    routeAliases: ['studio.contentPreview'],
    area: 'workflow',
    primaryNavKey: 'workflow',
    desktopPathPatterns: ['/project/content/preview', '/studio/:projectId/content/preview'],
    localPathPatterns: ['/studio/:projectId/content/preview'],
    scrollMode: 'canvas',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'project.setting.preview',
    routeAliases: ['studio.settingPreview'],
    area: 'workflow',
    primaryNavKey: 'workflow',
    desktopPathPatterns: ['/project/settings/preview', '/studio/:projectId/settings/preview'],
    localPathPatterns: ['/studio/:projectId/settings/preview'],
    scrollMode: 'canvas',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'studio.editDesk',
    area: 'editing',
    primaryNavKey: 'editing',
    desktopPathPatterns: ['/studio/:projectId/edit-desk'],
    localPathPatterns: ['/studio/:projectId/edit-desk'],
    scrollMode: 'workspace',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'tools.home',
    area: 'tool',
    primaryNavKey: 'tool',
    desktopPathPatterns: ['/tools'],
    localPathPatterns: ['/tools'],
    scrollMode: 'document',
    shellLayout: 'stacked',
    contentWidth: 'full',
  }),
  route({
    routeId: 'tools.image',
    routeAliases: ['tools.refImageGen'],
    area: 'tool',
    primaryNavKey: 'tool',
    desktopPathPatterns: ['/tools/image', '/tools/ref-image-gen'],
    localPathPatterns: ['/tools/image', '/tools/ref-image-gen'],
    scrollMode: 'workspace',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'tools.video',
    routeAliases: ['tools.refVideoGen'],
    area: 'tool',
    primaryNavKey: 'tool',
    desktopPathPatterns: ['/tools/video', '/tools/ref-video-gen'],
    localPathPatterns: ['/tools/video', '/tools/ref-video-gen'],
    scrollMode: 'workspace',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'tools.audio',
    routeAliases: ['tools.audioGen', 'tools.audioChat', 'tools.audioTranscribe', 'tools.audioTranslate', 'tools.musicGen', 'tools.audioSfx'],
    area: 'tool',
    primaryNavKey: 'tool',
    desktopPathPatterns: ['/tools/audio', '/tools/audio-gen', '/tools/audio-chat', '/tools/audio-transcribe', '/tools/audio-translate', '/tools/music-gen', '/tools/audio-sfx'],
    localPathPatterns: ['/tools/audio', '/tools/audio-gen', '/tools/audio-transcribe', '/tools/audio-translate', '/tools/music-gen', '/tools/audio-sfx'],
    scrollMode: 'workspace',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'tools.text',
    area: 'tool',
    primaryNavKey: 'tool',
    desktopPathPatterns: ['/tools/text'],
    localPathPatterns: ['/tools/text'],
    scrollMode: 'workspace',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'tools.provider',
    routeAliases: ['tools.privateAssets', 'tools.plugin'],
    area: 'tool',
    primaryNavKey: 'tool',
    desktopPathPatterns: ['/provider-assets', '/tools/private-assets', '/tools/plugin/:pluginId'],
    localPathPatterns: ['/provider-assets', '/tools/private-assets', '/tools/plugin/:pluginId'],
    scrollMode: 'workspace',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'tools.specialized',
    routeAliases: ['tools.motionImitation', 'tools.styleTransfer', 'tools.multiAngle', 'tools.voiceClone', 'tools.voiceDesign'],
    area: 'tool',
    primaryNavKey: 'tool',
    desktopPathPatterns: ['/tools/motion-imitation', '/tools/style-transfer', '/tools/multi-angle', '/tools/voice-clone', '/tools/voice-design'],
    localPathPatterns: ['/tools/motion-imitation', '/tools/style-transfer', '/tools/multi-angle', '/tools/voice-clone', '/tools/voice-design'],
    scrollMode: 'workspace',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'resources',
    area: 'tool',
    primaryNavKey: 'tool',
    desktopPathPatterns: ['/resources'],
    localPathPatterns: ['/resources'],
    scrollMode: 'document',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'resources.external',
    area: 'tool',
    primaryNavKey: 'tool',
    desktopPathPatterns: ['/resources/external'],
    localPathPatterns: ['/resources/external'],
    scrollMode: 'document',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'shotLibrary',
    area: 'tool',
    primaryNavKey: 'tool',
    desktopPathPatterns: ['/shot-library'],
    localPathPatterns: ['/shot-library'],
    scrollMode: 'document',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'jobs',
    area: 'tool',
    primaryNavKey: 'tool',
    desktopPathPatterns: ['/jobs'],
    localPathPatterns: ['/jobs'],
    scrollMode: 'document',
    shellLayout: 'stacked',
  }),
  route({
    routeId: 'canvases',
    routeAliases: ['canvas.list'],
    area: 'workflow',
    primaryNavKey: 'workflow',
    desktopPathPatterns: ['/canvases'],
    localPathPatterns: ['/canvases'],
    scrollMode: 'document',
    shellLayout: 'flush',
    contentWidth: 'normal',
  }),
  route({
    routeId: 'canvas.editor',
    area: 'workflow',
    primaryNavKey: 'workflow',
    desktopPathPatterns: ['/canvases/:canvasId'],
    localPathPatterns: ['/canvases/:canvasId'],
    scrollMode: 'canvas',
    shellLayout: 'flush',
  }),
  route({
    routeId: 'editing',
    area: 'editing',
    primaryNavKey: 'editing',
    desktopPathPatterns: ['/editing'],
    localPathPatterns: ['/editing'],
    scrollMode: 'document',
    shellLayout: 'flush',
  }),
  route({
    routeId: 'editing.project',
    area: 'editing',
    primaryNavKey: 'editing',
    desktopPathPatterns: ['/editing/:editingProjectId'],
    localPathPatterns: ['/editing/:editingProjectId'],
    scrollMode: 'workspace',
    shellLayout: 'flush',
  }),
  route({
    routeId: 'agent.resources',
    area: 'agent',
    desktopPathPatterns: ['/agent/resources'],
    localPathPatterns: ['/agent/resources'],
    scrollMode: 'document',
    shellLayout: 'flush',
  }),
  route({
    routeId: 'agent.resourceDetail',
    area: 'agent',
    desktopPathPatterns: ['/agent/resources/:resourceId'],
    localPathPatterns: ['/agent/resources/:resourceId'],
    scrollMode: 'document',
    shellLayout: 'flush',
  }),
  route({
    routeId: 'agent.contentPrompt',
    area: 'agent',
    desktopPathPatterns: ['/agent/content/prompt'],
    localPathPatterns: ['/agent/content/prompt'],
    scrollMode: 'workspace',
    shellLayout: 'flush',
  }),
  route({
    routeId: 'agent.contentCandidates',
    area: 'agent',
    desktopPathPatterns: ['/agent/content/candidates'],
    localPathPatterns: ['/agent/content/candidates'],
    scrollMode: 'workspace',
    shellLayout: 'flush',
  }),
  route({
    routeId: 'agent.generationJob',
    area: 'agent',
    desktopPathPatterns: ['/agent/generation/jobs/:jobId'],
    localPathPatterns: ['/agent/generation/jobs/:jobId'],
    scrollMode: 'document',
    shellLayout: 'flush',
  }),
  route({
    routeId: 'agent.previewTimeline',
    area: 'agent',
    desktopPathPatterns: ['/agent/preview-timeline'],
    localPathPatterns: ['/agent/preview-timeline'],
    scrollMode: 'workspace',
    shellLayout: 'flush',
  }),
  route({
    routeId: 'agent.impact',
    area: 'agent',
    desktopPathPatterns: ['/agent/impact'],
    localPathPatterns: ['/agent/impact'],
    scrollMode: 'workspace',
    shellLayout: 'flush',
  }),
  route({
    routeId: 'agent.projectStatus',
    area: 'agent',
    desktopPathPatterns: ['/agent/project-status'],
    localPathPatterns: ['/agent/project-status'],
    scrollMode: 'document',
    shellLayout: 'flush',
  }),
] as const

export function sharedSurfaceRouteForRouteId(routeId: string): SharedSurfaceRouteDefinition | undefined {
  return sharedSurfaceRouteDefinitions.find((definition) => (
    definition.routeId === routeId || definition.routeAliases?.includes(routeId)
  ))
}

export function sharedSurfaceRouteForPathname(
  pathname: string,
  options: { host?: SharedSurfaceHost } = {},
): SharedSurfaceRouteDefinition | undefined {
  const host = options.host ?? 'any'
  const normalizedPathname = normalizeSharedSurfacePathname(pathname)
  return sharedSurfaceRouteDefinitions.find((definition) => (
    patternsForHost(definition, host).some((pattern) => sharedSurfacePathMatches(pattern, normalizedPathname))
  ))
}

export function sharedSurfaceAreaForRouteId(routeId: string): SharedSurfaceArea | undefined {
  return sharedSurfaceRouteForRouteId(routeId)?.area
}

export function sharedSurfaceAreaForPathname(
  pathname: string,
  options: { host?: SharedSurfaceHost } = {},
): SharedSurfaceArea | undefined {
  return sharedSurfaceRouteForPathname(pathname, options)?.area
}

export function sharedSurfacePrimaryNavKeyForPathname(
  pathname: string,
  options: { host?: SharedSurfaceHost } = {},
): SharedSurfacePrimaryNavKey | undefined {
  return sharedSurfaceRouteForPathname(pathname, options)?.primaryNavKey
}

export function sharedSurfacePathMatches(pattern: string, pathname: string): boolean {
  return sharedSurfacePathPatternRegExp(pattern).test(normalizeSharedSurfacePathname(pathname))
}

function route(definition: SharedSurfaceRouteDefinition): SharedSurfaceRouteDefinition {
  return definition
}

function patternsForHost(
  definition: SharedSurfaceRouteDefinition,
  host: SharedSurfaceHost,
): readonly string[] {
  if (host === 'desktop') return definition.desktopPathPatterns ?? []
  if (host === 'local-web') return definition.localPathPatterns ?? []
  return [...(definition.desktopPathPatterns ?? []), ...(definition.localPathPatterns ?? [])]
}

function normalizeSharedSurfacePathname(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] ?? '/'
  if (!pathOnly || pathOnly === '/') return '/'
  return pathOnly.endsWith('/') ? pathOnly.slice(0, -1) : pathOnly
}

function sharedSurfacePathPatternRegExp(pattern: string): RegExp {
  const normalizedPattern = normalizeSharedSurfacePathname(pattern)
  const segments = normalizedPattern.split('/').filter(Boolean)
  if (segments.length === 0) return /^\/$/
  const source = segments.map((segment) => {
    if (segment === '*') return '.*'
    if (segment.startsWith(':')) return '[^/]+'
    return escapeRegExp(segment)
  }).join('/')
  return new RegExp(`^/${source}$`)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
