import {
  agentResourceDetailPath,
  RESOURCE_SURFACE_ROUTES,
} from './routes.js'
export {
  agentResourceDetailPath,
  RESOURCE_SURFACE_ROUTES,
  resourceSurfacePath,
} from './routes.js'
export type { ResourceSurfaceRouteKey } from './routes.js'

export type AgentSurfaceMode = 'inspect' | 'review' | 'edit'

export type ResourceAgentSurfaceIntent =
  | 'open_resource_library'
  | 'inspect_resource'

export type ResourceAgentSurfaceEntity = {
  project_id?: string | number
  project_uid?: string
  resource_id?: number
}

export type ResourceAgentBrowserSurface = {
  kind: 'browser_url'
  surface: AgentSurfaceMode
  title: string
  route: string
  url: string
  frontend_origin: string
  mcp_api_base_url: string
  api_proxy: {
    base_url: string
    auth: 'agent_mcp_context'
  }
  entity?: ResourceAgentSurfaceEntity
  intent: ResourceAgentSurfaceIntent
  usage: string
}

export type ResourceAgentSurfaceInput = {
  route: string
  title: string
  surface: AgentSurfaceMode
  intent: ResourceAgentSurfaceIntent
  usage: string
  entity?: ResourceAgentSurfaceEntity
  query?: Record<string, string | number | boolean | undefined>
}

export function createResourceAgentBrowserSurface(
  args: Record<string, unknown>,
  input: ResourceAgentSurfaceInput,
): ResourceAgentBrowserSurface {
  const frontendOrigin = resolveResourceFrontendOrigin(args)
  const proxyBaseURL = resolveResourceMCPProxyBaseURL(args)
  const mcpApiBaseURL = `${proxyBaseURL}/agent-api/v1`
  const url = new URL(input.route, frontendOrigin)
  url.searchParams.set('mcpApiBaseURL', mcpApiBaseURL)
  url.searchParams.set('source', 'mcp')
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) continue
    url.searchParams.set(key, String(value))
  }

  return {
    kind: 'browser_url',
    surface: input.surface,
    title: input.title,
    route: input.route,
    url: url.toString(),
    frontend_origin: frontendOrigin,
    mcp_api_base_url: mcpApiBaseURL,
    api_proxy: {
      base_url: mcpApiBaseURL,
      auth: 'agent_mcp_context',
    },
    ...(input.entity ? { entity: input.entity } : {}),
    intent: input.intent,
    usage: input.usage,
  }
}

export function createResourceLibrarySurface(
  args: Record<string, unknown>,
  query?: Record<string, string | number | boolean | undefined>,
): ResourceAgentBrowserSurface {
  return createResourceAgentBrowserSurface(args, {
    route: RESOURCE_SURFACE_ROUTES.agentResources,
    title: 'MovScript resource library',
    surface: 'inspect',
    intent: 'open_resource_library',
    query,
    usage: 'Open url in an agent in-app browser. The page uses the local MovScript MCP proxy, which forwards requests with the active agent context.',
  })
}

export function createResourceDetailSurface(
  args: Record<string, unknown>,
  resourceId: number,
): ResourceAgentBrowserSurface {
  return createResourceAgentBrowserSurface(args, {
    route: agentResourceDetailPath(resourceId),
    title: `MovScript resource #${resourceId}`,
    surface: 'inspect',
    intent: 'inspect_resource',
    entity: { resource_id: resourceId },
    query: { resourceId },
    usage: 'Open this resource detail surface to inspect the RawResource preview, metadata, provenance, and candidate usage context.',
  })
}

export function resolveResourceFrontendOrigin(args: Record<string, unknown>): string {
  return normalizeHTTPOrigin(
    getOptionalString(args, 'frontend_origin')
      ?? getOptionalString(args, 'frontendOrigin')
      ?? process.env.MOVSCRIPT_FRONTEND_ORIGIN
      ?? process.env.VITE_DEV_SERVER_URL
      ?? 'http://127.0.0.1:5173',
  )
}

export function resolveResourceMCPProxyBaseURL(args: Record<string, unknown>): string {
  const explicit = getOptionalString(args, 'mcp_base_url') ?? getOptionalString(args, 'mcpBaseURL')
  if (explicit) return normalizeHTTPOrigin(explicit)
  const endpoint = process.env.MOVSCRIPT_MCP_ENDPOINT
  if (endpoint) {
    try {
      const url = new URL(endpoint)
      return normalizeHTTPOrigin(url.origin)
    } catch {
      // Fall through to the default local MCP origin.
    }
  }
  const port = process.env.MOVSCRIPT_MCP_PORT || '28765'
  return normalizeHTTPOrigin(`http://127.0.0.1:${port}`)
}

function getOptionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeHTTPOrigin(value: string): string {
  const url = new URL(value.trim())
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Expected http(s) URL, got ${value}`)
  }
  return url.origin
}

export {
  createScriptVersion,
  listScriptVersionLines,
  listScriptVersions,
} from './features/infrastructure/scriptVersions.js'
export type {
  CreateScriptVersionPayload,
  ScriptVersion,
  ScriptVersionLine,
  ScriptVersionSourceType,
} from './features/infrastructure/scriptVersions.js'
export {
  adjacentResource,
  DEFAULT_RESOURCE_LIBRARY_PAGE_SIZE,
  paginateResources,
  projectScopeResources,
  RESOURCE_LIBRARY_PAGE_SIZE_OPTIONS,
  RESOURCE_LIBRARY_SCOPE_TABS,
  RESOURCE_LIBRARY_TYPE_TABS,
  resourceIDs,
  resourceScopeFilterFromParam,
  resourceTypeFilterFromParam,
} from './resourceLibrary.js'
export type {
  ResourceLibraryBinding,
  ResourceLibraryResource,
  ResourceLibraryScopeFilter,
  ResourceLibraryTypeFilter,
  ResourceLibraryViewProps,
} from './resourceLibrary.js'
export {
  canvasResourceKeys,
  externalResourceKeys,
  resourceBindingKeys,
  resourceCandidateKeys,
  resourceFolderKeys,
  resourceKeys,
  resourceShareTargetKeys,
  resourceTextKeys,
} from './resourceQueryKeys.js'
export type { ResourceQueryInvalidator } from './resourceQueryKeys.js'
export {
  CANVAS_RESOURCE_DRAG_TYPE,
  RESOURCE_ID_DRAG_TYPE,
  hasResourceDragPayload,
  readResourceDragPayload,
  readResourceFromDragPayload,
  readResourceIdDragPayload,
  resourceDropAcceptsPayload,
  resolveResourceDropResource,
  writeResourceDragPayload,
} from './resourceDragPayload.js'
export type {
  ResourceDragDataTransfer,
  ResourceDragPayload,
  ResourceDragPayloadResource,
  ResourceDropDataTransfer,
} from './resourceDragPayload.js'
export {
  __resetResourceMediaCacheForTests,
  __resetResourceTextCacheForTests,
  acquireCachedInlineImageMediaUrl,
  acquireCachedResourceMediaUrl,
  blobToDataURL,
  configureResourceMediaBrowser,
  downloadResource,
  isResourceFileUrl,
  loadCachedResourceBlob,
  loadCachedResourceDataURL,
  loadResourceBlob,
  loadResourceDataURL,
  loadResourceFileBlob,
  loadResourceFileDataURL,
  loadResourceTextUrl,
  loadResourceUrlBlob,
  resolveResourceFileImageUrl,
  resolveResourceFileUrl,
  resolveResourceUrl,
  resourceFileImageUrl,
  resourceFileUrl,
  resourceMediaCacheKey,
} from './resourceMediaBrowser.js'
export type {
  CachedMediaUrl,
  ResourceBlobLoadOptions,
  ResourceMediaBrowserConfig,
} from './resourceMediaBrowser.js'
export {
  ResourceFileAudio,
  ResourceFileImage,
  ResourceFileVideo,
  ResourceAudio,
  ResourceImage,
  ResourceVideo,
  UrlImage,
  UrlMediaPreview,
  UrlVideo,
  isHlsResource,
} from './resourceMediaComponents.js'
export type {
  ResourceFileAudioProps,
  ResourceFileImageProps,
  ResourceFileVideoProps,
  ResourceAudioProps,
  ResourceImageProps,
  ResourceVideoProps,
  UrlImageProps,
  UrlVideoProps,
} from './resourceMediaComponents.js'
export {
  AuthedAudio,
  AuthedImage,
  AuthedVideo,
} from './resourceAuthMedia.js'
export {
  HlsVideo,
  isHlsSource,
} from './resourceHlsVideo.js'
export type { HlsVideoProps } from './resourceHlsVideo.js'
export { MediaViewer } from './resourceMediaViewer.js'
export type { MediaViewerProps } from './resourceMediaViewer.js'
export {
  ResourceLibraryPicker,
} from './resourceLibraryPicker.js'
export type {
  ResourceLibraryPickerProps,
  ResourceTypeFilter,
} from './resourceLibraryPicker.js'
export {
  ResourceLibraryPickerHeader,
  ResourceLibraryPickerList,
  ResourceLibraryPickerPanel,
  ResourceLibraryPickerRow,
  ResourceLibraryPickerToolbar,
} from './resourceLibraryPickerUi.js'
export type {
  ResourceLibraryPickerItem,
  ResourceLibraryPickerOption,
} from './resourceLibraryPickerUi.js'
export {
  ResourceCandidateAttachPanel,
  candidateResourceFromRawResource,
} from './resourceCandidateAttachPanel.js'
export type {
  CandidateResourceRef,
  ResourceCandidateAttachPanelProps,
} from './resourceCandidateAttachPanel.js'
export {
  GENERATED_BINDING_TARGETS,
  attachedGeneratedCandidateIdsAfterResults,
  generatedBindingErrorMessage,
  generatedBindingTargetLabel,
  generatedCandidateAttachSummary,
  generatedKeyframeCandidateTargetId,
  generatedTargetRecordDescription,
  generatedTargetRecordId,
  generatedTargetRecordLabel,
  generatedTargetRecordMeta,
  generatedTargetSearchText,
  isGeneratedCandidateTargetRecord,
  isGeneratedKeyframeCandidateRecord,
  pendingGeneratedCandidateAttachments,
} from './resourceCandidateBinding.js'
export type {
  GeneratedBindingTarget,
  GeneratedCandidateAttachSummary,
  GeneratedCandidateAttachSummaryStatus,
} from './resourceCandidateBinding.js'
export {
  compactResourceMediaDiagnosticElementRect,
  compactResourceMediaDiagnosticRect,
  compactResourceMediaDiagnosticSrc,
  RESOURCE_MEDIA_DIAGNOSTIC_STORAGE_KEY,
  resourceMediaDiagnosticsEnabled,
} from './resourceMediaDiagnostics.js'
export type { ResourceMediaDiagnosticEnvironment } from './resourceMediaDiagnostics.js'
export {
  RESOURCE_CONTEXT_MENU_DEFAULT_SIZE,
  RESOURCE_CONTEXT_MENU_SAFE_INSET,
  RESOURCE_INTERACTIVE_TARGET_SELECTOR,
  acceptResourceDropDragOver,
  isResourceInteractiveDragTarget,
  resourceContextMenuPositionFromClient,
  resourceContextMenuPositionFromEvent,
  resourceViewportBoundaryFromWindow,
  startResourceDragSource,
} from './resourceInteraction.js'
export type {
  ResourceClientPoint,
  ResourceClientPointEvent,
  ResourceContextMenuSize,
  ResourceDragSourceDataTransfer,
  ResourceDropInteractionDataTransfer,
  ResourceViewportBoundary,
} from './resourceInteraction.js'
export {
  agentSurfaceParams,
  arrayValue,
  createAgentSurfaceDataAdapter,
  fetchAgentSurfaceSnapshot,
  invalidateAgentSurfaceQueries,
  numberValue,
  postAgentSurfaceAction,
  recordValue,
  stringValue,
} from './data.js'
export type {
  AgentSurfaceHTTPClient,
  AgentSurfaceParamValue,
  AgentSurfaceParams,
  AgentSurfaceQueryClient,
  AgentSurfaceSnapshot,
} from './data.js'
