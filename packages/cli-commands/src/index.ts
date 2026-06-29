import { resolve } from 'node:path'
import {
  backendDelete,
  backendGet,
  backendPatch,
  backendPost,
  backendPut,
  setMovScriptBackendAPIBaseURL,
  setMovScriptBackendDefaultWorkspaceDir,
  setMovScriptBackendRuntimeAuthToken,
} from '@movscript/core/backend/node'
import {
  artifactTools,
  externalResourceTools,
  generationTools,
  modelTools,
  projectTools,
  resourceLibraryTools,
  resourceMediaTools,
  shotLibraryTools,
} from '@movscript/core/mcp'
import {
  artifactGetStream,
  artifactUploadExport,
  artifactUploadHlsStream,
  annotateResourceImage,
  composeResourceVideosToResource,
  addShotsToGroup,
  analyzeVideoShotCuts,
  createShotGroup,
  createProject,
  createResourceVideoContactSheetToResource,
  extractResourceVideoAudioToResource,
  extractResourceVideoFrameToResource,
  extractResourceVideoFramesForVision,
  extractResourceVideoFramesToResources,
  fetchLocalProject,
  getUnifiedGenerationJob,
  getUnifiedGenerationJobs,
  getShotGroup,
  initLocalProject,
  listExternalResourceSources,
  listGenerationCapabilities,
  listModels,
  openResourceLibrary,
  prepareGeneration,
  probeResourceVideo,
  queryResourceLibrary,
  queryShotLibrary,
  readResourceImageForVision,
  registerGenerationResult,
  searchExternalResources,
  submitUnifiedGeneration,
  transformResourceImageToResource,
  trimResourceVideoToResource,
  uploadAgentImageResource,
  uploadAgentImageResources,
} from '@movscript/core/mcp/node'
import {
  findRuntimeEndpoint,
  findRuntimeService,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
  type RuntimeEndpointRecord,
} from '@movscript/runtime-contracts'

export type JSONSchemaObject = Record<string, unknown>
export type AdminCommandMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface AdminCommandSpec {
  commandId: string
  mcpToolName: string
  cliPath: string[]
  description: string
  method: AdminCommandMethod
  inputSchema: JSONSchemaObject
  path: (args: Record<string, unknown>) => string
  payload?: (args: Record<string, unknown>) => Record<string, unknown>
}

export interface SystemCommandSpec {
  commandId: string
  mcpToolName: string
  mcpAliases?: string[]
  cliPath: string[]
  description: string
  inputSchema: JSONSchemaObject
  run: (args: Record<string, unknown>) => Promise<unknown>
}

export interface MovScriptCommandExecution {
  schema: 'movscript.command_result.v1'
  status: 'ok'
  commandId: string
  mcpToolName?: string
  data: unknown
  debug: {
    cli_argv: string[]
    method?: AdminCommandMethod
    path?: string
    cwd: string
    runtime_endpoint?: string
  }
}

const LOCAL_NODE_GATEWAY_SERVICE = 'movscript.local-node.gateway'
const DATA_SERVICE = 'movscript.data.service'

export const adminCommandSpecs: AdminCommandSpec[] = [
  {
    commandId: 'admin.provider_template.list',
    mcpToolName: 'admin_provider_template_list',
    cliPath: ['provider-template', 'list'],
    description: 'Admin-only: list provider templates that can be used to create provider accounts.',
    method: 'GET',
    inputSchema: adminReadSchema(),
    path: (args) => adminPathWithQuery('/admin/provider-templates', args),
  },
  {
    commandId: 'admin.provider.list',
    mcpToolName: 'admin_provider_list',
    cliPath: ['provider', 'list'],
    description: 'Admin-only: list configured AI providers and their public configuration state.',
    method: 'GET',
    inputSchema: adminReadSchema(),
    path: (args) => adminPathWithQuery('/admin/providers', args),
  },
  {
    commandId: 'admin.provider.create',
    mcpToolName: 'admin_provider_create',
    cliPath: ['provider', 'create'],
    description: 'Admin-only: create an AI provider from a backend provider payload.',
    method: 'POST',
    inputSchema: adminWriteSchema(),
    path: () => '/admin/providers',
  },
  {
    commandId: 'admin.provider.credential.create',
    mcpToolName: 'admin_provider_credential_create',
    cliPath: ['provider', 'credential', 'create'],
    description: 'Admin-only: create credentials for an existing AI provider.',
    method: 'POST',
    inputSchema: adminProviderCredentialSchema(true),
    path: (args) => `/admin/providers/${adminRequiredPathArg(args, ['providerID', 'providerId', 'provider_id'])}/credentials`,
  },
  {
    commandId: 'admin.provider.credential.update',
    mcpToolName: 'admin_provider_credential_update',
    cliPath: ['provider', 'credential', 'update'],
    description: 'Admin-only: update one credential key for an existing AI provider.',
    method: 'PATCH',
    inputSchema: adminProviderCredentialSchema(true, true),
    path: (args) => `/admin/providers/${adminRequiredPathArg(args, ['providerID', 'providerId', 'provider_id'])}/credentials/${adminRequiredPathArg(args, ['credentialKey', 'credential_key'])}`,
  },
  {
    commandId: 'admin.provider.credential.set_primary',
    mcpToolName: 'admin_provider_credential_set_primary',
    cliPath: ['provider', 'credential', 'set-primary'],
    description: 'Admin-only: mark a provider credential key as the primary credential.',
    method: 'POST',
    inputSchema: adminProviderCredentialSchema(false, true),
    path: (args) => `/admin/providers/${adminRequiredPathArg(args, ['providerID', 'providerId', 'provider_id'])}/credentials/${adminRequiredPathArg(args, ['credentialKey', 'credential_key'])}/primary`,
  },
  {
    commandId: 'admin.provider.asset_library.get',
    mcpToolName: 'admin_provider_asset_library_get',
    cliPath: ['provider', 'asset-library', 'get'],
    description: 'Admin-only: read provider asset-library settings used for provider-side asset references.',
    method: 'GET',
    inputSchema: adminProviderSchema(),
    path: (args) => `/admin/providers/${adminRequiredPathArg(args, ['providerID', 'providerId', 'provider_id'])}/asset-library`,
  },
  {
    commandId: 'admin.provider.asset_library.update',
    mcpToolName: 'admin_provider_asset_library_update',
    cliPath: ['provider', 'asset-library', 'update'],
    description: 'Admin-only: update provider asset-library settings used for provider-side asset references.',
    method: 'PUT',
    inputSchema: adminProviderSchema(true),
    path: (args) => `/admin/providers/${adminRequiredPathArg(args, ['providerID', 'providerId', 'provider_id'])}/asset-library`,
  },
  {
    commandId: 'admin.model.catalog_template.list',
    mcpToolName: 'admin_model_catalog_template_list',
    cliPath: ['model', 'catalog-template', 'list'],
    description: 'Admin-only: list model catalog templates; pass query.lab to filter by lab.',
    method: 'GET',
    inputSchema: adminReadSchema(),
    path: (args) => adminPathWithQuery('/admin/model-catalog/templates', args),
  },
  {
    commandId: 'admin.model.import.preview',
    mcpToolName: 'admin_model_import_preview',
    cliPath: ['model', 'import', 'preview'],
    description: 'Admin-only: preview importing provider models into catalog entries and route bindings.',
    method: 'POST',
    inputSchema: adminWriteSchema(),
    path: () => '/admin/model-imports/preview',
  },
  {
    commandId: 'admin.model.import.apply',
    mcpToolName: 'admin_model_import_apply',
    cliPath: ['model', 'import', 'apply'],
    description: 'Admin-only: apply a model import into catalog entries and route bindings.',
    method: 'POST',
    inputSchema: adminWriteSchema(),
    path: () => '/admin/model-imports/apply',
  },
  {
    commandId: 'admin.model.catalog.list',
    mcpToolName: 'admin_model_catalog_list',
    cliPath: ['model', 'catalog', 'list'],
    description: 'Admin-only: list model catalog entries with route binding summary.',
    method: 'GET',
    inputSchema: adminReadSchema(),
    path: (args) => adminPathWithQuery('/admin/model-catalog', args),
  },
  {
    commandId: 'admin.model.catalog.create',
    mcpToolName: 'admin_model_catalog_create',
    cliPath: ['model', 'catalog', 'create'],
    description: 'Admin-only: create a model catalog entry.',
    method: 'POST',
    inputSchema: adminWriteSchema(),
    path: () => '/admin/model-catalog',
  },
  {
    commandId: 'admin.model.catalog.update',
    mcpToolName: 'admin_model_catalog_update',
    cliPath: ['model', 'catalog', 'update'],
    description: 'Admin-only: update a model catalog entry.',
    method: 'PUT',
    inputSchema: adminCatalogEntrySchema(true),
    path: (args) => `/admin/model-catalog/${adminRequiredPathArg(args, ['catalogEntryID', 'catalogEntryId', 'catalog_entry_id', 'id'])}`,
  },
  {
    commandId: 'admin.model.catalog.delete',
    mcpToolName: 'admin_model_catalog_delete',
    cliPath: ['model', 'catalog', 'delete'],
    description: 'Admin-only: delete a model catalog entry.',
    method: 'DELETE',
    inputSchema: adminCatalogEntrySchema(false),
    path: (args) => `/admin/model-catalog/${adminRequiredPathArg(args, ['catalogEntryID', 'catalogEntryId', 'catalog_entry_id', 'id'])}`,
  },
  {
    commandId: 'admin.model.route.diagnose',
    mcpToolName: 'admin_model_route_diagnose',
    cliPath: ['model', 'route', 'diagnose'],
    description: 'Admin-only: diagnose route/model/provider readiness for a model operation.',
    method: 'POST',
    inputSchema: adminWriteSchema(),
    path: () => '/admin/model-routes/diagnose',
  },
  {
    commandId: 'admin.model.route_binding.create',
    mcpToolName: 'admin_model_route_binding_create',
    cliPath: ['model', 'route-binding', 'create'],
    description: 'Admin-only: create a route binding for a catalog entry.',
    method: 'POST',
    inputSchema: adminRouteBindingSchema(true),
    path: (args) => `/admin/model-catalog/${adminRequiredPathArg(args, ['catalogEntryID', 'catalogEntryId', 'catalog_entry_id'])}/route-bindings`,
  },
  {
    commandId: 'admin.model.route_binding.update',
    mcpToolName: 'admin_model_route_binding_update',
    cliPath: ['model', 'route-binding', 'update'],
    description: 'Admin-only: update a route binding for a catalog entry.',
    method: 'PUT',
    inputSchema: adminRouteBindingSchema(true, true),
    path: (args) => `/admin/model-catalog/${adminRequiredPathArg(args, ['catalogEntryID', 'catalogEntryId', 'catalog_entry_id'])}/route-bindings/${adminRequiredPathArg(args, ['bindingID', 'bindingId', 'binding_id'])}`,
  },
  {
    commandId: 'admin.model.route_binding.delete',
    mcpToolName: 'admin_model_route_binding_delete',
    cliPath: ['model', 'route-binding', 'delete'],
    description: 'Admin-only: delete a route binding from a catalog entry.',
    method: 'DELETE',
    inputSchema: adminRouteBindingSchema(false, true),
    path: (args) => `/admin/model-catalog/${adminRequiredPathArg(args, ['catalogEntryID', 'catalogEntryId', 'catalog_entry_id'])}/route-bindings/${adminRequiredPathArg(args, ['bindingID', 'bindingId', 'binding_id'])}`,
  },
  {
    commandId: 'admin.generation_tools.settings.get',
    mcpToolName: 'admin_generation_tools_settings_get',
    cliPath: ['generation-tools', 'settings', 'get'],
    description: 'Admin-only: read generation tool server settings.',
    method: 'GET',
    inputSchema: adminReadSchema(),
    path: () => '/admin/settings/generation-tools',
  },
  {
    commandId: 'admin.generation_tools.settings.update',
    mcpToolName: 'admin_generation_tools_settings_update',
    cliPath: ['generation-tools', 'settings', 'update'],
    description: 'Admin-only: update generation tool server settings.',
    method: 'PUT',
    inputSchema: adminWriteSchema(),
    path: () => '/admin/settings/generation-tools',
  },
  {
    commandId: 'admin.resource_access.settings.get',
    mcpToolName: 'admin_resource_access_settings_get',
    cliPath: ['resource-access', 'settings', 'get'],
    description: 'Admin-only: read resource public access profiles, including public tunnel settings.',
    method: 'GET',
    inputSchema: adminReadSchema(),
    path: () => '/admin/settings/resource-access',
  },
  {
    commandId: 'admin.resource_access.settings.update',
    mcpToolName: 'admin_resource_access_settings_update',
    cliPath: ['resource-access', 'settings', 'update'],
    description: 'Admin-only: update resource public access profiles, including public tunnel settings.',
    method: 'PUT',
    inputSchema: adminWriteSchema(),
    path: () => '/admin/settings/resource-access',
  },
  {
    commandId: 'admin.public_tunnel.config.get',
    mcpToolName: 'admin_public_tunnel_config_get',
    cliPath: ['public-tunnel', 'config', 'get'],
    description: 'Admin-only alias: read public tunnel configuration from resource access profiles.',
    method: 'GET',
    inputSchema: adminReadSchema(),
    path: () => '/admin/settings/resource-access',
  },
  {
    commandId: 'admin.public_tunnel.config.update',
    mcpToolName: 'admin_public_tunnel_config_update',
    cliPath: ['public-tunnel', 'config', 'update'],
    description: 'Admin-only alias: update public tunnel configuration through resource access profiles.',
    method: 'PUT',
    inputSchema: adminWriteSchema(),
    path: () => '/admin/settings/resource-access',
  },
  {
    commandId: 'admin.resource_access.resolve_test',
    mcpToolName: 'admin_resource_access_resolve_test',
    cliPath: ['resource-access', 'resolve-test'],
    description: 'Admin-only: resolve a RawResource through ResourceAccessProfile and return a sanitized external URL diagnostic.',
    method: 'POST',
    inputSchema: adminResourceAccessResolveSchema(),
    path: () => '/resource-access/resolve',
    payload: adminResourceAccessPayload,
  },
  {
    commandId: 'admin.resource_access.check_test',
    mcpToolName: 'admin_resource_access_check_test',
    cliPath: ['resource-access', 'check-test'],
    description: 'Admin-only: resolve and check whether a RawResource public URL is externally reachable.',
    method: 'POST',
    inputSchema: adminResourceAccessResolveSchema(),
    path: () => '/resource-access/check',
    payload: adminResourceAccessPayload,
  },
  {
    commandId: 'admin.model.gateway_key.list',
    mcpToolName: 'admin_model_gateway_key_list',
    cliPath: ['model', 'gateway-key', 'list'],
    description: 'Admin-only: list model gateway API keys.',
    method: 'GET',
    inputSchema: adminReadSchema(),
    path: (args) => adminPathWithQuery('/model-gateway/api-keys', args),
  },
  {
    commandId: 'admin.model.gateway_key.create',
    mcpToolName: 'admin_model_gateway_key_create',
    cliPath: ['model', 'gateway-key', 'create'],
    description: 'Admin-only: create a model gateway API key.',
    method: 'POST',
    inputSchema: adminWriteSchema(),
    path: () => '/model-gateway/api-keys',
  },
  {
    commandId: 'admin.model.gateway_key.update',
    mcpToolName: 'admin_model_gateway_key_update',
    cliPath: ['model', 'gateway-key', 'update'],
    description: 'Admin-only: update a model gateway API key.',
    method: 'PATCH',
    inputSchema: adminGatewayKeySchema(true),
    path: (args) => `/model-gateway/api-keys/${adminRequiredPathArg(args, ['keyID', 'keyId', 'key_id', 'id'])}`,
  },
  {
    commandId: 'admin.model.gateway_key.delete',
    mcpToolName: 'admin_model_gateway_key_delete',
    cliPath: ['model', 'gateway-key', 'delete'],
    description: 'Admin-only: delete a model gateway API key.',
    method: 'DELETE',
    inputSchema: adminGatewayKeySchema(false),
    path: (args) => `/model-gateway/api-keys/${adminRequiredPathArg(args, ['keyID', 'keyId', 'key_id', 'id'])}`,
  },
]

export const systemCommandSpecs: SystemCommandSpec[] = [
  {
    commandId: 'system.model.list',
    mcpToolName: 'system_model_list',
    mcpAliases: ['generation_model_list', 'movscript_model_list'],
    cliPath: ['model', 'list'],
    description: 'System: list public generation model contracts for a capability and optional operation.',
    inputSchema: toolInputSchema(modelTools(), 'generation_model_list'),
    run: listModels,
  },
  {
    commandId: 'system.generation.capability.list',
    mcpToolName: 'generation_capability_list',
    cliPath: ['generation', 'capability', 'list'],
    description: 'System: list generation capabilities accepted by generation_prepare and generation_submit.',
    inputSchema: toolInputSchema(generationTools(), 'generation_capability_list'),
    run: listGenerationCapabilities,
  },
  {
    commandId: 'system.generation.prepare',
    mcpToolName: 'generation_prepare',
    cliPath: ['generation', 'prepare'],
    description: 'System: prepare a MovScript generation request and inspect model/prompt readiness.',
    inputSchema: toolInputSchema(generationTools(), 'generation_prepare'),
    run: prepareGeneration,
  },
  {
    commandId: 'system.generation.submit',
    mcpToolName: 'generation_submit',
    cliPath: ['generation', 'submit'],
    description: 'System: submit a MovScript generation job through the unified generation contract.',
    inputSchema: toolInputSchema(generationTools(), 'generation_submit'),
    run: submitUnifiedGeneration,
  },
  {
    commandId: 'system.generation.job.get',
    mcpToolName: 'generation_job_get',
    cliPath: ['generation', 'job', 'get'],
    description: 'System: fetch one MovScript generation job and optional candidate side effects.',
    inputSchema: toolInputSchema(generationTools(), 'generation_job_get'),
    run: getUnifiedGenerationJob,
  },
  {
    commandId: 'system.generation.job.get_batch',
    mcpToolName: 'generation_job_get_batch',
    cliPath: ['generation', 'job', 'get-batch'],
    description: 'System: fetch multiple MovScript generation jobs through the unified generation contract.',
    inputSchema: toolInputSchema(generationTools(), 'generation_job_get_batch'),
    run: getUnifiedGenerationJobs,
  },
  {
    commandId: 'system.generation.result.register',
    mcpToolName: 'generation_result_register',
    cliPath: ['generation', 'result', 'register'],
    description: 'System: register an existing generation RawResource as a content-unit candidate.',
    inputSchema: toolInputSchema(generationTools(), 'generation_result_register'),
    run: registerGenerationResult,
  },
  {
    commandId: 'system.project.create',
    mcpToolName: 'system_project_create',
    mcpAliases: ['movscript_project_create'],
    cliPath: ['project', 'create'],
    description: 'System: create a formal MovScript backend project after explicit user intent.',
    inputSchema: toolInputSchema(projectTools(), 'movscript_project_create'),
    run: createProject,
  },
  {
    commandId: 'system.project.init',
    mcpToolName: 'system_project_init',
    mcpAliases: ['movscript_project_init'],
    cliPath: ['project', 'init'],
    description: 'System: initialize a local MovScript project and bind it to backend project data.',
    inputSchema: toolInputSchema(projectTools(), 'movscript_project_init'),
    run: initLocalProject,
  },
  {
    commandId: 'system.project.open',
    mcpToolName: 'system_project_open',
    mcpAliases: ['movscript_project_open'],
    cliPath: ['project', 'open'],
    description: 'System: open a local MovScript project and bind it to backend project data when metadata exists.',
    inputSchema: toolInputSchema(projectTools(), 'movscript_project_open'),
    run: fetchLocalProject,
  },
  {
    commandId: 'system.project.fetch',
    mcpToolName: 'system_project_fetch',
    mcpAliases: ['movscript_project_fetch'],
    cliPath: ['project', 'fetch'],
    description: 'System: compatibility alias for opening a local MovScript project.',
    inputSchema: toolInputSchema(projectTools(), 'movscript_project_fetch'),
    run: fetchLocalProject,
  },
  {
    commandId: 'system.resource.library.query',
    mcpToolName: 'system_resource_library_query',
    mcpAliases: ['movscript_resource_library_query'],
    cliPath: ['resource', 'library', 'query'],
    description: 'System: query MovScript RawResources from the internal resource library.',
    inputSchema: toolInputSchema(resourceLibraryTools(), 'movscript_resource_library_query'),
    run: queryResourceLibrary,
  },
  {
    commandId: 'system.resource.library.open',
    mcpToolName: 'system_resource_library_open',
    mcpAliases: ['movscript_resource_library_open'],
    cliPath: ['resource', 'library', 'open'],
    description: 'System: return an agent-openable surface URL for the MovScript resource library.',
    inputSchema: toolInputSchema(resourceLibraryTools(), 'movscript_resource_library_open'),
    run: async (args) => openResourceLibrary(args),
  },
  {
    commandId: 'system.artifact.upload_export',
    mcpToolName: 'system_artifact_upload_export',
    cliPath: ['artifact', 'upload-export'],
    description: 'System: upload a completed local export artifact as a neutral RawResource.',
    inputSchema: toolInputSchema(artifactTools(), 'system_artifact_upload_export'),
    run: artifactUploadExport,
  },
  {
    commandId: 'system.artifact.upload_hls_stream',
    mcpToolName: 'system_artifact_upload_hls_stream',
    cliPath: ['artifact', 'upload-hls-stream'],
    description: 'System: upload completed HLS manifest and segments as a neutral MediaStreamArtifact.',
    inputSchema: toolInputSchema(artifactTools(), 'system_artifact_upload_hls_stream'),
    run: artifactUploadHlsStream,
  },
  {
    commandId: 'system.artifact.get_stream',
    mcpToolName: 'system_artifact_get_stream',
    cliPath: ['artifact', 'get-stream'],
    description: 'System: read MediaStreamArtifact metadata and playback URLs from backend hosting.',
    inputSchema: toolInputSchema(artifactTools(), 'system_artifact_get_stream'),
    run: artifactGetStream,
  },
  {
    commandId: 'system.resource.image.read',
    mcpToolName: 'system_resource_image_read',
    mcpAliases: ['movscript_resource_image_read'],
    cliPath: ['resource', 'image', 'read'],
    description: 'System: read a MovScript image RawResource for agent vision.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_image_read'),
    run: readResourceImageForVision,
  },
  {
    commandId: 'system.resource.image.transform_to_resource',
    mcpToolName: 'system_resource_image_transform_to_resource',
    mcpAliases: ['movscript_resource_image_transform_to_resource'],
    cliPath: ['resource', 'image', 'transform-to-resource'],
    description: 'System: transform a MovScript image RawResource and upload the result as a RawResource.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_image_transform_to_resource'),
    run: transformResourceImageToResource,
  },
  {
    commandId: 'system.resource.image.annotate',
    mcpToolName: 'system_resource_image_annotate',
    mcpAliases: ['movscript_resource_image_annotate'],
    cliPath: ['resource', 'image', 'annotate'],
    description: 'System: create a local annotated image artifact for agent guidance.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_image_annotate'),
    run: annotateResourceImage,
  },
  {
    commandId: 'system.resource.video.extract_frames',
    mcpToolName: 'system_resource_video_extract_frames',
    mcpAliases: ['movscript_resource_video_extract_frames'],
    cliPath: ['resource', 'video', 'extract-frames'],
    description: 'System: extract representative video frames for agent vision.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_extract_frames'),
    run: extractResourceVideoFramesForVision,
  },
  {
    commandId: 'system.resource.video.probe',
    mcpToolName: 'system_resource_video_probe',
    mcpAliases: ['movscript_resource_video_probe'],
    cliPath: ['resource', 'video', 'probe'],
    description: 'System: probe a MovScript video RawResource and return media metadata.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_probe'),
    run: probeResourceVideo,
  },
  {
    commandId: 'system.resource.video.extract_frame_to_resource',
    mcpToolName: 'system_resource_video_extract_frame_to_resource',
    mcpAliases: ['movscript_resource_video_extract_frame_to_resource'],
    cliPath: ['resource', 'video', 'extract-frame-to-resource'],
    description: 'System: extract one video frame and upload it as an image RawResource.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_extract_frame_to_resource'),
    run: extractResourceVideoFrameToResource,
  },
  {
    commandId: 'system.resource.video.extract_frames_to_resources',
    mcpToolName: 'system_resource_video_extract_frames_to_resources',
    mcpAliases: ['movscript_resource_video_extract_frames_to_resources'],
    cliPath: ['resource', 'video', 'extract-frames-to-resources'],
    description: 'System: extract multiple video frames and upload them as image RawResources.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_extract_frames_to_resources'),
    run: extractResourceVideoFramesToResources,
  },
  {
    commandId: 'system.resource.video.trim_to_resource',
    mcpToolName: 'system_resource_video_trim_to_resource',
    mcpAliases: ['movscript_resource_video_trim_to_resource'],
    cliPath: ['resource', 'video', 'trim-to-resource'],
    description: 'System: trim a video RawResource into a new video RawResource.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_trim_to_resource'),
    run: trimResourceVideoToResource,
  },
  {
    commandId: 'system.resource.video.compose_to_resource',
    mcpToolName: 'system_resource_video_compose_to_resource',
    mcpAliases: ['movscript_resource_video_compose_to_resource'],
    cliPath: ['resource', 'video', 'compose-to-resource'],
    description: 'System: compose video RawResources in sequence into a new video RawResource.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_compose_to_resource'),
    run: composeResourceVideosToResource,
  },
  {
    commandId: 'system.resource.video.concat_to_resource',
    mcpToolName: 'system_resource_video_concat_to_resource',
    mcpAliases: ['movscript_resource_video_concat_to_resource'],
    cliPath: ['resource', 'video', 'concat-to-resource'],
    description: 'System: concat video RawResources into a new video RawResource.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_concat_to_resource'),
    run: composeResourceVideosToResource,
  },
  {
    commandId: 'system.resource.video.contact_sheet_to_resource',
    mcpToolName: 'system_resource_video_contact_sheet_to_resource',
    mcpAliases: ['movscript_resource_video_contact_sheet_to_resource'],
    cliPath: ['resource', 'video', 'contact-sheet-to-resource'],
    description: 'System: create a contact sheet image RawResource from a video RawResource.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_contact_sheet_to_resource'),
    run: createResourceVideoContactSheetToResource,
  },
  {
    commandId: 'system.resource.video.extract_audio_to_resource',
    mcpToolName: 'system_resource_video_extract_audio_to_resource',
    mcpAliases: ['movscript_resource_video_extract_audio_to_resource'],
    cliPath: ['resource', 'video', 'extract-audio-to-resource'],
    description: 'System: extract audio from a video RawResource into an audio RawResource.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_extract_audio_to_resource'),
    run: extractResourceVideoAudioToResource,
  },
  {
    commandId: 'system.resource.upload',
    mcpToolName: 'system_resource_upload',
    mcpAliases: ['movscript_resource_upload'],
    cliPath: ['resource', 'upload'],
    description: 'System: upload an agent-accessible artifact to the MovScript RawResource library.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_upload'),
    run: uploadAgentImageResource,
  },
  {
    commandId: 'system.resource.upload_batch',
    mcpToolName: 'system_resource_upload_batch',
    mcpAliases: ['movscript_resource_upload_batch'],
    cliPath: ['resource', 'upload-batch'],
    description: 'System: upload multiple agent-accessible artifacts to the MovScript RawResource library.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_upload_batch'),
    run: uploadAgentImageResources,
  },
  {
    commandId: 'system.external_resource.source.list',
    mcpToolName: 'system_external_resource_source_list',
    mcpAliases: ['movscript_external_resource_source_list'],
    cliPath: ['external-resource', 'source', 'list'],
    description: 'System: list configured external media search sources.',
    inputSchema: toolInputSchema(externalResourceTools(), 'movscript_external_resource_source_list'),
    run: listExternalResourceSources,
  },
  {
    commandId: 'system.external_resource.search',
    mcpToolName: 'system_external_resource_search',
    mcpAliases: ['movscript_external_resource_search'],
    cliPath: ['external-resource', 'search'],
    description: 'System: search configured external image/video providers.',
    inputSchema: toolInputSchema(externalResourceTools(), 'movscript_external_resource_search'),
    run: searchExternalResources,
  },
  {
    commandId: 'system.shot.library.query',
    mcpToolName: 'system_shot_library_query',
    mcpAliases: ['movscript_shot_library_query'],
    cliPath: ['shot', 'library', 'query'],
    description: 'System: query the reusable MovScript shot reference library.',
    inputSchema: toolInputSchema(shotLibraryTools(), 'movscript_shot_library_query'),
    run: queryShotLibrary,
  },
  {
    commandId: 'system.shot.group.get',
    mcpToolName: 'system_shot_group_get',
    mcpAliases: ['movscript_shot_group_get'],
    cliPath: ['shot', 'group', 'get'],
    description: 'System: read a MovScript shot reference group and its ordered shots.',
    inputSchema: toolInputSchema(shotLibraryTools(), 'movscript_shot_group_get'),
    run: getShotGroup,
  },
  {
    commandId: 'system.shot.group.create',
    mcpToolName: 'system_shot_group_create',
    mcpAliases: ['movscript_shot_group_create'],
    cliPath: ['shot', 'group', 'create'],
    description: 'System: create a MovScript shot reference group for a video RawResource.',
    inputSchema: toolInputSchema(shotLibraryTools(), 'movscript_shot_group_create'),
    run: createShotGroup,
  },
  {
    commandId: 'system.shot.group.add_shots',
    mcpToolName: 'system_shot_group_add_shots',
    mcpAliases: ['movscript_shot_group_add_shots'],
    cliPath: ['shot', 'group', 'add-shots'],
    description: 'System: append shot references to an existing shot reference group.',
    inputSchema: toolInputSchema(shotLibraryTools(), 'movscript_shot_group_add_shots'),
    run: addShotsToGroup,
  },
  {
    commandId: 'system.video.shot_cuts.analyze',
    mcpToolName: 'system_video_shot_cuts_analyze',
    mcpAliases: ['movscript_video_shot_cuts_analyze'],
    cliPath: ['video', 'shot-cuts', 'analyze'],
    description: 'System: analyze a video RawResource with ffmpeg scene detection and return shot ranges.',
    inputSchema: toolInputSchema(shotLibraryTools(), 'movscript_video_shot_cuts_analyze'),
    run: analyzeVideoShotCuts,
  },
]

export const adminCommandByMCPToolName = new Map(adminCommandSpecs.map((spec) => [spec.mcpToolName, spec]))
export const adminCommandById = new Map(adminCommandSpecs.map((spec) => [spec.commandId, spec]))
export const systemCommandByMCPToolName = new Map(systemCommandSpecs.flatMap((spec) => [
  [spec.mcpToolName, spec],
  ...(spec.mcpAliases ?? []).map((alias) => [alias, spec] as const),
] as const))
export const systemCommandById = new Map(systemCommandSpecs.map((spec) => [spec.commandId, spec]))

export function isAdminMCPToolName(name: string | undefined): boolean {
  return Boolean(name && adminCommandByMCPToolName.has(name))
}

export function isSystemMCPToolName(name: string | undefined): boolean {
  return Boolean(name && systemCommandByMCPToolName.has(name))
}

export async function runMovScriptAdminCommand(
  specOrName: AdminCommandSpec | string,
  args: Record<string, unknown> = {},
): Promise<MovScriptCommandExecution> {
  const spec = typeof specOrName === 'string'
    ? adminCommandByMCPToolName.get(specOrName) ?? adminCommandById.get(specOrName)
    : specOrName
  if (!spec) throw new Error(`Unknown admin command: ${specOrName}`)

  const binding = bindAdminBackendRuntime(args)
  const path = spec.path(args)
  const data = await callAdminBackend(spec, path, args)
  return {
    schema: 'movscript.command_result.v1',
    status: 'ok',
    commandId: spec.commandId,
    mcpToolName: spec.mcpToolName,
    data,
    debug: {
      cli_argv: adminDebugCliArgv(spec, args),
      method: spec.method,
      path,
      cwd: process.cwd(),
      ...(binding.backendEndpoint ? { runtime_endpoint: binding.backendEndpoint } : {}),
    },
  }
}

export async function runMovScriptSystemCommand(
  specOrName: SystemCommandSpec | string,
  args: Record<string, unknown> = {},
): Promise<MovScriptCommandExecution> {
  const spec = typeof specOrName === 'string'
    ? systemCommandByMCPToolName.get(specOrName) ?? systemCommandById.get(specOrName)
    : specOrName
  if (!spec) throw new Error(`Unknown system command: ${specOrName}`)

  const binding = bindBackendRuntime(args)
  const data = await spec.run(args)
  return {
    schema: 'movscript.command_result.v1',
    status: 'ok',
    commandId: spec.commandId,
    mcpToolName: spec.mcpToolName,
    data,
    debug: {
      cli_argv: systemDebugCliArgv(spec, args),
      cwd: process.cwd(),
      ...(binding.backendEndpoint ? { runtime_endpoint: binding.backendEndpoint } : {}),
    },
  }
}

export function unwrapCommandDataWithDebug(execution: MovScriptCommandExecution): unknown {
  if (isRecord(execution.data) && !Array.isArray(execution.data)) {
    return {
      ...execution.data,
      debug: execution.debug,
    }
  }
  return {
    data: execution.data,
    debug: execution.debug,
  }
}

function bindBackendRuntime(args: Record<string, unknown>): { backendEndpoint?: string } {
  const workspaceDir = stringValue(args.workspaceDir ?? args.workspace_dir)
    ?? stringValue(args.projectDir ?? args.project_dir)
    ?? stringValue(args.cwd)
    ?? process.env.MOVSCRIPT_WORKSPACE_DIR
  if (workspaceDir) setMovScriptBackendDefaultWorkspaceDir(resolve(workspaceDir))

  const token = stringValue(args.token)
  if (token) setMovScriptBackendRuntimeAuthToken(token)

  const explicitBackend = stringValue(args.backendBaseURL ?? args.backend_base_url ?? args.server)
  if (explicitBackend) {
    setMovScriptBackendAPIBaseURL(explicitBackend)
    return { backendEndpoint: explicitBackend }
  }

  const homeDir = resolveRuntimeHomeArg(args)
  const runtimeHome = readRuntimeHomeSnapshot(homeDir)
  const gatewayEndpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
      ?? findRuntimeService(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)?.endpoint,
  )
  const dataEndpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, DATA_SERVICE)
      ?? findRuntimeService(runtimeHome, DATA_SERVICE)?.endpoint,
  )
  const backendEndpoint = gatewayEndpoint ?? dataEndpoint
  if (backendEndpoint) setMovScriptBackendAPIBaseURL(backendEndpoint)
  return { backendEndpoint }
}

const bindAdminBackendRuntime = bindBackendRuntime

async function callAdminBackend(spec: AdminCommandSpec, path: string, args: Record<string, unknown>): Promise<unknown> {
  switch (spec.method) {
    case 'GET':
      return await backendGet(path)
    case 'POST':
      return await backendPost(path, adminCommandPayload(spec, args))
    case 'PUT':
      return await backendPut(path, adminCommandPayload(spec, args))
    case 'PATCH':
      return await backendPatch(path, adminCommandPayload(spec, args))
    case 'DELETE': {
      const result = await backendDelete(path)
      return result === null ? { status: 'deleted' } : result
    }
  }
}

function adminPathWithQuery(path: string, args: Record<string, unknown>): string {
  const query = isRecord(args.query) ? args.query : {}
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value.trim()) params.set(key, value.trim())
    else if (typeof value === 'number' && Number.isFinite(value)) params.set(key, String(value))
    else if (typeof value === 'boolean') params.set(key, String(value))
  }
  const suffix = params.toString()
  return suffix ? `${path}?${suffix}` : path
}

function adminPayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = args.payload ?? args.body
  if (payload === undefined) return {}
  if (!isRecord(payload)) throw new Error('admin command payload must be an object')
  return payload
}

function adminCommandPayload(spec: AdminCommandSpec, args: Record<string, unknown>): Record<string, unknown> {
  return spec.payload ? spec.payload(args) : adminPayload(args)
}

function adminResourceAccessPayload(args: Record<string, unknown>): Record<string, unknown> {
  const explicit = adminPayload(args)
  if (Object.keys(explicit).length > 0) return explicit
  return compactObject({
    resource_id: adminRequiredNumberArg(args, ['resourceID', 'resourceId', 'resource_id']),
    purpose: stringValue(args.purpose),
    required_media_type: stringValue(args.requiredMediaType ?? args.required_media_type ?? args.mediaType ?? args.media_type),
    transport: stringValue(args.transport),
    route_id: adminNumberArg(args, ['routeID', 'routeId', 'route_id']),
    profile_id: stringValue(args.profileID ?? args.profileId ?? args.profile_id),
  })
}

function adminRequiredPathArg(args: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = stringValue(args[key])
    if (value) return encodeURIComponent(value)
  }
  throw new Error(`admin command requires one of: ${keys.join(', ')}`)
}

function adminDebugCliArgv(spec: AdminCommandSpec, args: Record<string, unknown>): string[] {
  const argv = ['movscript', 'admin', ...spec.cliPath, '--json']
  const homeDir = stringValue(args.homeDir ?? args.home_dir ?? args.movscriptHome ?? args.movscript_home)
  if (homeDir) argv.push('--home-dir', homeDir)
  const workspaceDir = stringValue(args.workspaceDir ?? args.workspace_dir)
  if (workspaceDir) argv.push('--workspace', workspaceDir)
  const projectDir = stringValue(args.projectDir ?? args.project_dir)
  if (projectDir) argv.push('--project-dir', projectDir)
  const server = stringValue(args.backendBaseURL ?? args.backend_base_url ?? args.server)
  if (server) argv.push('--server', server)
  if (args.token !== undefined) argv.push('--token', '<redacted>')
  appendPathArg(argv, args, ['providerID', 'providerId', 'provider_id'], '--provider-id')
  appendPathArg(argv, args, ['credentialKey', 'credential_key'], '--credential-key')
  appendPathArg(argv, args, ['catalogEntryID', 'catalogEntryId', 'catalog_entry_id'], '--catalog-entry-id')
  appendPathArg(argv, args, ['bindingID', 'bindingId', 'binding_id'], '--binding-id')
  appendPathArg(argv, args, ['keyID', 'keyId', 'key_id'], '--key-id')
  appendPathArg(argv, args, ['resourceID', 'resourceId', 'resource_id'], '--resource-id')
  appendPathArg(argv, args, ['requiredMediaType', 'required_media_type', 'mediaType', 'media_type'], '--required-media-type')
  appendPathArg(argv, args, ['profileID', 'profileId', 'profile_id'], '--profile-id')
  appendPathArg(argv, args, ['transport'], '--transport')
  appendPathArg(argv, args, ['purpose'], '--purpose')
  appendPathArg(argv, args, ['routeID', 'routeId', 'route_id'], '--route-id')
  appendPathArg(argv, args, ['id'], '--id')
  if (isRecord(args.query)) {
    for (const [key, value] of Object.entries(args.query)) {
      argv.push('--query', `${key}=${String(value)}`)
    }
  }
  if (args.payload !== undefined || args.body !== undefined) argv.push('--payload', '<json>')
  return argv
}

function systemDebugCliArgv(spec: SystemCommandSpec, args: Record<string, unknown>): string[] {
  const argv = ['movscript', 'system', ...spec.cliPath, '--json']
  appendRuntimeArgv(argv, args)
  appendPathArg(argv, args, ['capability'], '--capability')
  appendPathArg(argv, args, ['operation'], '--operation')
  appendPathArg(argv, args, ['model_operation', 'modelOperation'], '--model-operation')
  appendPathArg(argv, args, ['model_id', 'modelId'], '--model-id')
  appendPathArg(argv, args, ['provider_id', 'providerId'], '--provider-id')
  appendPathArg(argv, args, ['parameter_mode', 'parameterMode', 'param_mode', 'paramMode'], '--parameter-mode')
  appendPathArg(argv, args, ['prompt'], '--prompt')
  appendPathArg(argv, args, ['name'], '--name')
  appendPathArg(argv, args, ['description'], '--description')
  appendPathArg(argv, args, ['summary'], '--summary')
  appendPathArg(argv, args, ['title'], '--title')
  appendPathArg(argv, args, ['project_id', 'projectId'], '--project-id')
  appendPathArg(argv, args, ['project_uid', 'projectUid'], '--project-uid')
  appendPathArg(argv, args, ['project_title', 'projectTitle'], '--project-title')
  appendPathArg(argv, args, ['total_episodes', 'totalEpisodes'], '--total-episodes')
  appendPathArg(argv, args, ['language'], '--language')
  appendPathArg(argv, args, ['source_language', 'sourceLanguage'], '--source-language')
  appendPathArg(argv, args, ['target_language', 'targetLanguage'], '--target-language')
  appendPathArg(argv, args, ['cut_strategy', 'cutStrategy'], '--cut-strategy')
  appendPathArg(argv, args, ['content_unit_id', 'contentUnitId'], '--content-unit-id')
  appendPathArg(argv, args, ['candidate_id', 'candidateId'], '--candidate-id')
  appendPathArg(argv, args, ['candidate_policy', 'candidatePolicy'], '--candidate-policy')
  appendPathArg(argv, args, ['output_kind', 'outputKind'], '--output-kind')
  appendPathArg(argv, args, ['job_id', 'jobId'], '--job-id')
  appendPathArg(argv, args, ['task_id', 'taskId'], '--task-id')
  appendPathArg(argv, args, ['stream_id', 'streamId'], '--stream-id')
  appendPathArg(argv, args, ['verbosity'], '--verbosity')
  appendPathArg(argv, args, ['query', 'q'], '--query')
  appendPathArg(argv, args, ['id'], '--id')
  appendPathArg(argv, args, ['resource_id', 'resourceId'], '--resource-id')
  appendPathArg(argv, args, ['source_id', 'sourceId'], '--source-id')
  appendPathArg(argv, args, ['source_resource_id', 'sourceResourceId'], '--source-resource-id')
  appendPathArg(argv, args, ['source_derivative_id', 'sourceDerivativeId'], '--source-derivative-id')
  appendPathArg(argv, args, ['group_id', 'groupId'], '--group-id')
  appendPathArg(argv, args, ['shot_reference_id', 'shotReferenceId'], '--shot-reference-id')
  appendPathArg(argv, args, ['type'], '--type')
  appendPathArg(argv, args, ['media_type', 'mediaType'], '--media-type')
  appendPathArg(argv, args, ['scope'], '--scope')
  appendPathArg(argv, args, ['folder_id', 'folderId'], '--folder-id')
  appendPathArg(argv, args, ['orientation'], '--orientation')
  appendPathArg(argv, args, ['page'], '--page')
  appendPathArg(argv, args, ['page_size', 'pageSize'], '--page-size')
  appendPathArg(argv, args, ['limit', 'topK'], '--limit')
  appendPathArg(argv, args, ['local_path', 'localPath', 'path'], '--local-path')
  appendPathArg(argv, args, ['artifact_path', 'artifactPath'], '--artifact-path')
  appendPathArg(argv, args, ['workspace_path', 'workspacePath'], '--workspace-path')
  appendRedactedArg(argv, args, ['data_url', 'dataUrl'], '--data-url')
  appendRedactedArg(argv, args, ['base64'], '--base64')
  appendPathArg(argv, args, ['filename'], '--filename')
  appendPathArg(argv, args, ['mime_type', 'mimeType'], '--mime-type')
  appendPathArg(argv, args, ['mode'], '--mode')
  appendPathArg(argv, args, ['detail'], '--detail')
  appendPathArg(argv, args, ['output_format', 'outputFormat'], '--output-format')
  appendPathArg(argv, args, ['image_size', 'imageSize'], '--image-size')
  appendPathArg(argv, args, ['negative_prompt', 'negativePrompt'], '--negative-prompt')
  appendPathArg(argv, args, ['aspect_ratio', 'aspectRatio'], '--aspect-ratio')
  appendPathArg(argv, args, ['quality'], '--quality')
  appendPathArg(argv, args, ['voice'], '--voice')
  appendPathArg(argv, args, ['model'], '--model')
  appendPathArg(argv, args, ['audio_format', 'audioFormat'], '--audio-format')
  appendPathArg(argv, args, ['response_format', 'responseFormat'], '--response-format')
  appendPathArg(argv, args, ['subtitle_format', 'subtitleFormat'], '--subtitle-format')
  appendPathArg(argv, args, ['style'], '--style')
  appendPathArg(argv, args, ['instructions'], '--instructions')
  appendPathArg(argv, args, ['image_format', 'imageFormat'], '--image-format')
  appendPathArg(argv, args, ['max_bytes', 'maxBytes'], '--max-bytes')
  appendPathArg(argv, args, ['max_source_bytes', 'maxSourceBytes'], '--max-source-bytes')
  appendPathArg(argv, args, ['max_upload_bytes', 'maxUploadBytes'], '--max-upload-bytes')
  appendPathArg(argv, args, ['max_video_bytes', 'maxVideoBytes'], '--max-video-bytes')
  appendPathArg(argv, args, ['max_width', 'maxWidth'], '--max-width')
  appendPathArg(argv, args, ['max_height', 'maxHeight'], '--max-height')
  appendPathArg(argv, args, ['width'], '--width')
  appendPathArg(argv, args, ['height'], '--height')
  appendPathArg(argv, args, ['crop_x', 'cropX'], '--crop-x')
  appendPathArg(argv, args, ['crop_y', 'cropY'], '--crop-y')
  appendPathArg(argv, args, ['crop_width', 'cropWidth'], '--crop-width')
  appendPathArg(argv, args, ['crop_height', 'cropHeight'], '--crop-height')
  appendPathArg(argv, args, ['count'], '--count')
  appendPathArg(argv, args, ['frame_count', 'frameCount'], '--frame-count')
  appendPathArg(argv, args, ['max_frames', 'maxFrames'], '--max-frames')
  appendPathArg(argv, args, ['timestamp_sec', 'timestampSec'], '--timestamp-sec')
  appendPathArg(argv, args, ['start_sec', 'startSec'], '--start-sec')
  appendPathArg(argv, args, ['end_sec', 'endSec'], '--end-sec')
  appendPathArg(argv, args, ['duration_sec', 'durationSec'], '--duration-sec')
  appendPathArg(argv, args, ['duration'], '--duration')
  appendPathArg(argv, args, ['scene_threshold', 'sceneThreshold'], '--scene-threshold')
  appendPathArg(argv, args, ['min_shot_duration_sec', 'minShotDurationSec'], '--min-shot-duration-sec')
  appendPathArg(argv, args, ['max_shot_duration_sec', 'maxShotDurationSec'], '--max-shot-duration-sec')
  appendPathArg(argv, args, ['center_sec', 'centerSec'], '--center-sec')
  appendPathArg(argv, args, ['window_sec', 'windowSec'], '--window-sec')
  appendPathArg(argv, args, ['interval_sec', 'intervalSec'], '--interval-sec')
  appendPathArg(argv, args, ['fps'], '--fps')
  appendPathArg(argv, args, ['steps'], '--steps')
  appendPathArg(argv, args, ['seed'], '--seed')
  appendPathArg(argv, args, ['speed'], '--speed')
  appendPathArg(argv, args, ['timeout_ms', 'timeoutMs'], '--timeout-ms')
  appendPathArg(argv, args, ['poll_interval_ms', 'pollIntervalMs'], '--poll-interval-ms')
  appendPathArg(argv, args, ['volume'], '--volume')
  appendPathArg(argv, args, ['columns'], '--columns')
  appendPathArg(argv, args, ['thumb_width', 'thumbWidth'], '--thumb-width')
  appendPathArg(argv, args, ['output_path', 'outputPath'], '--output-path')
  appendPathArg(argv, args, ['file_path', 'filePath'], '--file-path')
  appendPathArg(argv, args, ['manifest_path', 'manifestPath'], '--manifest-path')
  appendPathArg(argv, args, ['duration_ms', 'durationMs'], '--duration-ms')
  appendPathArg(argv, args, ['expires_at', 'expiresAt'], '--expires-at')
  appendPathArg(argv, args, ['expires_in_seconds', 'expiresInSeconds'], '--expires-in-seconds')
  appendPathArg(argv, args, ['tool'], '--tool')
  appendJSONArg(argv, args, ['timestamps_sec', 'timestampsSec'], '--timestamps-sec')
  appendJSONArg(argv, args, ['annotations'], '--annotations')
  appendJSONArg(argv, args, ['shapes'], '--shapes')
  appendJSONArg(argv, args, ['items'], '--items')
  appendJSONArg(argv, args, ['shots'], '--shots')
  appendJSONArg(argv, args, ['generation_intent', 'generationIntent'], '--generation-intent')
  appendJSONArg(argv, args, ['input_resource_ids', 'inputResourceIds'], '--input-resource-ids')
  appendJSONArg(argv, args, ['reference_resource_ids', 'referenceResourceIds'], '--reference-resource-ids')
  appendJSONArg(argv, args, ['extra_params', 'extraParams'], '--extra-params')
  appendJSONArg(argv, args, ['job_ids', 'jobIds'], '--job-ids')
  appendJSONArg(argv, args, ['prompt_snapshot', 'promptSnapshot'], '--prompt-snapshot')
  appendJSONArg(argv, args, ['metadata'], '--metadata')
  appendJSONArg(argv, args, ['segment_paths', 'segmentPaths'], '--segment-paths')
  appendJSONArg(argv, args, ['source_resource_ids', 'sourceResourceIds'], '--source-resource-ids')
  appendJSONArg(argv, args, ['derivative'], '--derivative')
  appendJSONArg(argv, args, ['params'], '--params')
  appendPathArg(argv, args, ['frontend_origin', 'frontendOrigin'], '--frontend-origin')
  appendPathArg(argv, args, ['mcp_base_url', 'mcpBaseURL'], '--mcp-base-url')
  if (args.provider_variants === true || args.include_provider_variants === true) argv.push('--provider-variants')
  if (args.include_models === true || args.includeModels === true) argv.push('--include-models')
  if (args.include_full === true || args.includeFull === true) argv.push('--include-full')
  if (args.include_disabled === true || args.includeDisabled === true) argv.push('--include-disabled')
  if (args.overwrite === true) argv.push('--overwrite')
  if (args.muted === true) argv.push('--muted')
  if (args.continue_on_error === true || args.continueOnError === true) argv.push('--continue-on-error')
  const referenceAssets = Array.isArray(args.reference_assets) ? args.reference_assets : Array.isArray(args.referenceAssets) ? args.referenceAssets : []
  for (const item of referenceAssets) {
    if (!isRecord(item)) continue
    const role = stringValue(item.role)
    if (!role) continue
    const mediaType = stringValue(item.media_type ?? item.mediaType)
    argv.push('--reference-asset', mediaType ? `${role}:${mediaType}` : role)
  }
  return argv
}

function appendRuntimeArgv(argv: string[], args: Record<string, unknown>): void {
  const homeDir = stringValue(args.homeDir ?? args.home_dir ?? args.movscriptHome ?? args.movscript_home)
  if (homeDir) argv.push('--home-dir', homeDir)
  const workspaceDir = stringValue(args.workspaceDir ?? args.workspace_dir)
  if (workspaceDir) argv.push('--workspace', workspaceDir)
  const projectDir = stringValue(args.projectDir ?? args.project_dir)
  if (projectDir) argv.push('--project-dir', projectDir)
  const server = stringValue(args.backendBaseURL ?? args.backend_base_url ?? args.server)
  if (server) argv.push('--server', server)
  if (args.token !== undefined) argv.push('--token', '<redacted>')
}

function appendPathArg(argv: string[], args: Record<string, unknown>, keys: string[], flag: string): void {
  for (const key of keys) {
    const value = stringValue(args[key])
    if (value) {
      argv.push(flag, value)
      return
    }
  }
}

function appendRedactedArg(argv: string[], args: Record<string, unknown>, keys: string[], flag: string): void {
  for (const key of keys) {
    const value = stringValue(args[key])
    if (value) {
      argv.push(flag, '<redacted>')
      return
    }
  }
}

function appendJSONArg(argv: string[], args: Record<string, unknown>, keys: string[], flag: string): void {
  for (const key of keys) {
    if (args[key] !== undefined) {
      argv.push(flag, '<json>')
      return
    }
  }
}

function resolveRuntimeHomeArg(args: Record<string, unknown>): string {
  const homeDir = stringValue(args.homeDir ?? args.home_dir ?? args.movscriptHome ?? args.movscript_home)
  return homeDir ? resolve(homeDir) : resolveMovScriptHomeDir()
}

function endpointURL(endpoint: RuntimeEndpointRecord | undefined): string | undefined {
  if (!endpoint) return undefined
  if (endpoint.protocol && endpoint.protocol !== 'http' && endpoint.protocol !== 'https') return undefined
  if (endpoint.url) return endpoint.url
  if (endpoint.baseURL) return endpoint.baseURL
  if (endpoint.port && endpoint.protocol === 'http') return `http://127.0.0.1:${endpoint.port}`
  if (endpoint.port) return `http://127.0.0.1:${endpoint.port}`
  return undefined
}

function adminReadSchema(extra: Record<string, unknown> = {}) {
  return objectSchema({
    ...adminRuntimeProperties(),
    query: {
      type: 'object',
      additionalProperties: true,
      description: 'Optional query string parameters for this fixed admin endpoint.',
    },
    ...extra,
  })
}

function adminWriteSchema(extra: Record<string, unknown> = {}) {
  return objectSchema({
    ...adminRuntimeProperties(),
    payload: {
      type: 'object',
      additionalProperties: true,
      description: 'Backend request body for this fixed admin endpoint.',
    },
    body: {
      type: 'object',
      additionalProperties: true,
      description: 'Alias for payload.',
    },
    ...extra,
  })
}

function adminProviderSchema(includePayload = false) {
  const extra = {
    providerID: { type: 'string', description: 'Provider id.' },
    providerId: { type: 'string', description: 'Alias for providerID.' },
    provider_id: { type: 'string', description: 'Alias for providerID.' },
  }
  return includePayload ? adminWriteSchema(extra) : adminReadSchema(extra)
}

function adminProviderCredentialSchema(includePayload = false, includeCredentialKey = false) {
  return (includePayload ? adminWriteSchema : adminReadSchema)({
    providerID: { type: 'string', description: 'Provider id.' },
    providerId: { type: 'string', description: 'Alias for providerID.' },
    provider_id: { type: 'string', description: 'Alias for providerID.' },
    ...(includeCredentialKey ? {
      credentialKey: { type: 'string', description: 'Provider credential key.' },
      credential_key: { type: 'string', description: 'Alias for credentialKey.' },
    } : {}),
  })
}

function adminCatalogEntrySchema(includePayload = false) {
  return (includePayload ? adminWriteSchema : adminReadSchema)({
    catalogEntryID: { type: ['string', 'number'], description: 'Model catalog entry id.' },
    catalogEntryId: { type: ['string', 'number'], description: 'Alias for catalogEntryID.' },
    catalog_entry_id: { type: ['string', 'number'], description: 'Alias for catalogEntryID.' },
    id: { type: ['string', 'number'], description: 'Alias for catalogEntryID.' },
  })
}

function adminRouteBindingSchema(includePayload = false, includeBinding = false) {
  return (includePayload ? adminWriteSchema : adminReadSchema)({
    catalogEntryID: { type: ['string', 'number'], description: 'Model catalog entry id.' },
    catalogEntryId: { type: ['string', 'number'], description: 'Alias for catalogEntryID.' },
    catalog_entry_id: { type: ['string', 'number'], description: 'Alias for catalogEntryID.' },
    ...(includeBinding ? {
      bindingID: { type: ['string', 'number'], description: 'Route binding id.' },
      bindingId: { type: ['string', 'number'], description: 'Alias for bindingID.' },
      binding_id: { type: ['string', 'number'], description: 'Alias for bindingID.' },
    } : {}),
  })
}

function adminGatewayKeySchema(includePayload = false) {
  return (includePayload ? adminWriteSchema : adminReadSchema)({
    keyID: { type: ['string', 'number'], description: 'Model gateway API key id.' },
    keyId: { type: ['string', 'number'], description: 'Alias for keyID.' },
    key_id: { type: ['string', 'number'], description: 'Alias for keyID.' },
    id: { type: ['string', 'number'], description: 'Alias for keyID.' },
  })
}

function adminResourceAccessResolveSchema() {
  return adminWriteSchema({
    resourceID: { type: ['string', 'number'], description: 'RawResource id to resolve.' },
    resourceId: { type: ['string', 'number'], description: 'Alias for resourceID.' },
    resource_id: { type: ['string', 'number'], description: 'Alias for resourceID.' },
    profileID: { type: 'string', description: 'ResourceAccessProfile id.' },
    profileId: { type: 'string', description: 'Alias for profileID.' },
    profile_id: { type: 'string', description: 'Alias for profileID.' },
    requiredMediaType: { type: 'string', description: 'Required resource media type, or any.' },
    required_media_type: { type: 'string', description: 'Alias for requiredMediaType.' },
    mediaType: { type: 'string', description: 'Alias for requiredMediaType.' },
    media_type: { type: 'string', description: 'Alias for requiredMediaType.' },
    transport: { type: 'string', description: 'Resource access transport; currently public_url.' },
    purpose: { type: 'string', description: 'Diagnostic purpose or route requirement.' },
    routeID: { type: ['string', 'number'], description: 'Optional route id whose transfer requirement is being tested.' },
    routeId: { type: ['string', 'number'], description: 'Alias for routeID.' },
    route_id: { type: ['string', 'number'], description: 'Alias for routeID.' },
  })
}

function adminRuntimeProperties(): Record<string, unknown> {
  return {
    homeDir: { type: 'string', description: 'Optional MovScript Home directory used to discover the daemon gateway.' },
    home_dir: { type: 'string', description: 'Alias for homeDir.' },
    movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
    movscript_home: { type: 'string', description: 'Alias for homeDir.' },
    workspaceDir: { type: 'string', description: 'Optional workspace directory used for backend auth lookup.' },
    workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
    projectDir: { type: 'string', description: 'Optional project directory used for backend auth lookup.' },
    project_dir: { type: 'string', description: 'Alias for projectDir.' },
    backendBaseURL: { type: 'string', description: 'Optional backend or daemon gateway base URL.' },
    backend_base_url: { type: 'string', description: 'Alias for backendBaseURL.' },
    server: { type: 'string', description: 'Alias for backendBaseURL, used by the MovScript CLI global --server.' },
    token: { type: 'string', description: 'Optional backend bearer token. MCP responses redact this from debug argv.' },
  }
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: 'object' as const,
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  }
}

function toolInputSchema(tools: Array<{ name: string; inputSchema?: unknown }>, name: string): JSONSchemaObject {
  const schema = tools.find((tool) => tool.name === name)?.inputSchema
  if (isRecord(schema)) return schema
  return objectSchema({})
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function adminNumberArg(args: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return undefined
}

function adminRequiredNumberArg(args: Record<string, unknown>, keys: string[]): number {
  const value = adminNumberArg(args, keys)
  if (value !== undefined) return value
  throw new Error(`admin command requires one of: ${keys.join(', ')}`)
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
