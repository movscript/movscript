export {
  createProjectSurfaceRuntime,
  defaultProjectSurfaceCapabilities,
  noopProjectSurfaceNotifier,
  projectSurfaceProjectFromContext,
  withProjectSurfaceProjectRequest,
} from './ProjectSurfaceRuntime.js'
export { PROJECT_SURFACE_ROUTE_KEYS } from '../domain/index.js'
export type {
  EditingServiceGateway,
  GenerationServiceGateway,
  ProjectServiceGateway,
  ProjectSurfaceDataScopeKind,
  ProjectSurfaceDataSpaceSummary,
  ProjectSurfaceDataSpacesResult,
  ProjectSurfaceDiagnosticEndpoints,
  ProjectSurfaceDiagnostics,
  ProjectSurfaceGitAction,
  ProjectSurfaceGitActionInput,
  ProjectSurfaceGitActionResult,
  ProjectSurfaceCapabilities,
  ProjectSurfaceCandidateViewInput,
  ProjectSurfaceGateways,
  ProjectSurfaceNavigator,
  ProjectSurfaceNotifier,
  ProjectSurfaceProjectContext,
  ProjectSurfaceProjectRequest,
  ProjectSurfaceProjectLocation,
  ProjectSurfaceResourceViewInput,
  ProjectSurfaceRouteKey,
  ProjectSurfaceRouteParams,
  ProjectSurfaceRuntime,
  ProjectSurfaceRuntimeInput,
  ProjectSurfaceWorkspaceOperationInput,
  ProjectSurfaceWorkspaceMetadata,
  ResourceServiceGateway,
} from './ProjectSurfaceRuntime.js'
export type { MovScriptContextEnvelope } from '@movscript/shared'
export {
  ProjectSurfaceProvider,
  useOptionalProjectSurfaceRuntime,
  useProjectSurfaceRuntime,
} from './ProjectSurfaceProvider.js'
export type { ProjectSurfaceProviderProps } from './ProjectSurfaceProvider.js'
