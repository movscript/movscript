export {
  PROJECT_SURFACE_ROUTE_DEFINITIONS,
  PROJECT_SURFACE_ROUTE_KEYS,
  PROJECT_SURFACE_ROUTES,
  projectSurfaceRouteBySegment,
  projectSurfaceDescriptor,
  projectSurfacePath,
} from './domain/index.js'
export type {
  ProjectSurfaceName,
  ProjectSurfaceRouteDefinition,
  ProjectSurfaceRouteKey,
  ProjectSurfaceScope,
  SurfaceDescriptor,
  SurfaceDescriptorScope,
} from './domain/index.js'
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
} from '@movscript/resource-surface/data'
export type {
  ResourceLibraryBinding,
  ResourceLibraryResource,
  ResourceLibraryScopeFilter,
  ResourceLibraryTypeFilter,
  ResourceLibraryViewProps,
} from '@movscript/resource-surface/data'
export {
  canvasResourceKeys,
  externalResourceKeys,
  resourceBindingKeys,
  resourceCandidateKeys,
  resourceFolderKeys,
  resourceKeys,
  resourceShareTargetKeys,
  resourceTextKeys,
} from '@movscript/resource-surface/data'
export type { ResourceQueryInvalidator } from '@movscript/resource-surface/data'
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
} from '@movscript/resource-surface/resource-interaction'
export type {
  ResourceDragDataTransfer,
  ResourceDragPayload,
  ResourceDragPayloadResource,
  ResourceDropDataTransfer,
} from '@movscript/resource-surface/resource-interaction'
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
} from '@movscript/resource-surface/resource-interaction'
export type {
  ResourceClientPoint,
  ResourceClientPointEvent,
  ResourceContextMenuSize,
  ResourceDragSourceDataTransfer,
  ResourceDropInteractionDataTransfer,
  ResourceViewportBoundary,
} from '@movscript/resource-surface/resource-interaction'
export {
  createProjectSurfaceRuntime,
  defaultProjectSurfaceCapabilities,
  noopProjectSurfaceNotifier,
  withProjectSurfaceProjectRequest,
} from './runtime/index.js'
export type {
  EditingServiceGateway,
  GenerationServiceGateway,
  ProjectServiceGateway,
  ProjectSurfaceCapabilities,
  ProjectSurfaceGateways,
  ProjectSurfaceNavigator,
  ProjectSurfaceNotifier,
  ProjectSurfaceProjectContext,
  ProjectSurfaceProjectRequest,
  ProjectSurfaceProjectLocation,
  ProjectSurfaceResourceViewInput,
  ProjectSurfaceRouteParams,
  ProjectSurfaceRuntime,
  ProjectSurfaceRuntimeInput,
  ProjectSurfaceServiceEndpoints,
  ProjectSurfaceSourceCommandInput,
  ResourceServiceGateway,
} from './runtime/index.js'

export {
  CONTENT_CANVAS_INSPECTOR_DEFAULT_WIDTH,
  CONTENT_CANVAS_INSPECTOR_MAX_WIDTH,
  CONTENT_CANVAS_INSPECTOR_MIN_WIDTH,
  CONTENT_CANVAS_INSPECTOR_PANE_ID,
  CONTENT_CANVAS_INSPECTOR_WIDTH_STORAGE_KEY,
  CONTENT_CANVAS_STRUCTURE_DEFAULT_WIDTH,
  CONTENT_CANVAS_STRUCTURE_MAX_WIDTH,
  CONTENT_CANVAS_STRUCTURE_MIN_WIDTH,
  CONTENT_CANVAS_STRUCTURE_PANE_ID,
  CONTENT_CANVAS_STRUCTURE_WIDTH_STORAGE_KEY,
  CONTENT_CANVAS_TIMELINE_DEFAULT_HEIGHT,
  CONTENT_CANVAS_TIMELINE_HEIGHT_STORAGE_KEY,
  CONTENT_CANVAS_TIMELINE_MAX_HEIGHT,
  CONTENT_CANVAS_TIMELINE_MIN_HEIGHT,
  CONTENT_CANVAS_TIMELINE_PANE_ID,
  CONTENT_CANVAS_WORKBENCH_PANES,
  CONTENT_CANVAS_WORKBENCH_ROUTE_LAYOUT,
} from './features/content/presentation/contentCanvasLayoutSpec.js'

export {
  AGENT_SURFACE_ROUTES,
  agentGenerationJobPath,
  agentResourceDetailPath,
  candidateIdFromArgs,
  createAgentBrowserSurface,
  createContentCandidatesSurface,
  createGenerationJobSurface,
  createImpactSurface,
  createPreviewTimelineSurface,
  createProjectStatusSurface,
  createPromptSurface,
  createResourceDetailSurface,
  createResourceLibrarySurface,
  projectIdFromArgs,
  resolveFrontendOrigin,
  resolveMCPProxyBaseURL,
} from '@movscript/core/agent'
export type {
  AgentBrowserSurface,
  AgentSurfaceEntity,
  AgentSurfaceInput,
  AgentSurfaceIntent,
  AgentSurfaceMode,
  AgentSurfaceRouteKey,
} from '@movscript/core/agent'
