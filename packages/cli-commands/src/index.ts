import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import {
  backendDelete,
  backendGet,
  backendPatch,
  backendPost,
  backendPut,
  clearMovScriptBackendAuth,
  resolveMovScriptBackendPaths,
  resolveMovScriptBackendSession,
  setMovScriptBackendAPIBaseURL,
  setMovScriptBackendDefaultWorkspaceDir,
  setMovScriptBackendRuntimeAuthToken,
  writeMovScriptBackendConfig,
} from '@movscript/core/backend/node'
import {
  artifactTools,
  contextTools,
  domainTools,
  editingTools,
  externalResourceTools,
  generationTools,
  modelTools,
  projectTools,
  resourceLibraryTools,
  resourceMediaTools,
  shotLibraryTools,
  timelineTools,
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
  domainGetModel,
  domainInspect,
  domainInterpret,
  editingExportCreateCandidate,
  editingExportImportResource,
  editingExportPublishHls,
  editingExportSaveLocal,
  editingProjectAddAsset,
  editingProjectCreate,
  editingProjectCreateFromEditDecisions,
  editingProjectCreateFromEditPlan,
  editingProjectGet,
  editingProjectRemoveAsset,
  editingProjectSave,
  editingProjectUpdateSettings,
  editingRuntimeCapabilitiesGet,
  editingTaskCancel,
  editingTaskGet,
  editingTaskHlsCreate,
  editingTaskLogsGet,
  editingTaskReframeCreate,
  editingTaskRenderCreate,
  editingTaskTranscodeCreate,
  editingTimelineAddClip,
  editingTimelineAddTrack,
  editingTimelineApplyCommands,
  editingTimelineDeleteClip,
  editingTimelineMoveClip,
  editingTimelineRemoveTrack,
  editingTimelineSplitClip,
  editingTimelineUpdateClip,
  editingTimelineValidate,
  editingVideoCompose,
  createResourceVideoContactSheetToResource,
  extractResourceVideoAudioToResource,
  extractResourceVideoFrameToResource,
  extractResourceVideoFramesForVision,
  extractResourceVideoFramesToResources,
  fetchLocalProject,
  getCurrentContext,
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
  setMCPDefaultWorkspaceDir,
  submitUnifiedGeneration,
  timelineAssemblyCompile,
  timelineAssemblyGet,
  timelineAssemblyValidate,
  timelineBackendCapabilityList,
  timelineBackendConformanceReport,
  timelineBackendProjectCreate,
  timelineBackendSelect,
  timelineCompileManifestCreate,
  transformResourceImageToResource,
  trimResourceVideoToResource,
  uploadAgentImageResource,
  uploadAgentImageResources,
} from '@movscript/core/mcp/node'
import {
  ensureLocalRuntimeDaemon,
  LOCAL_RUNTIME_DAEMON_APP_ID,
  LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE,
  LOCAL_RUNTIME_DAEMON_GATEWAY_SERVICE,
} from '@movscript/local-runtime'
import {
  activeAppRecords,
  activeEndpointRecords,
  activeServiceRecords,
  findRuntimeApp,
  findRuntimeEndpoint,
  findRuntimeService,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
  type RuntimeEndpointRecord,
  type RuntimeHomeSnapshot,
} from '@movscript/runtime-contracts'

const MOVSCRIPT_SOURCE_COLLECTION_DIRS = new Set([
  'settings',
  'scripts',
  'content_units',
  'productions',
  'timeline',
  'project_standards',
])

const MOVSCRIPT_SOURCE_ROOT_FILES = new Set([
  'project.json',
  'project_standards.json',
])

export type JSONSchemaObject = Record<string, unknown>
export type AdminCommandMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type MovScriptCommandFamily = 'runtime' | 'context' | 'admin' | 'system' | 'editing' | 'timeline' | 'workspace'
export type MovScriptCommandStability = 'stable' | 'temporary_fallback'

export interface MovScriptCommandExample {
  description: string
  argv: string[]
}

export interface MovScriptCommandContract {
  family: MovScriptCommandFamily
  stability: MovScriptCommandStability
  ownerService: string
  requiredRuntime: string[]
  permissions: string[]
  outputSchema: JSONSchemaObject
  examples: MovScriptCommandExample[]
}

export interface AdminCommandSpec extends MovScriptCommandContract {
  commandId: string
  mcpToolName: string
  cliPath: string[]
  description: string
  method: AdminCommandMethod
  inputSchema: JSONSchemaObject
  path: (args: Record<string, unknown>) => string
  payload?: (args: Record<string, unknown>) => Record<string, unknown>
}

export interface RuntimeCommandSpec extends MovScriptCommandContract {
  commandId: string
  mcpToolName: string
  mcpAliases?: string[]
  cliPath: string[]
  productCliPath?: string[]
  description: string
  inputSchema: JSONSchemaObject
  run: (args: Record<string, unknown>) => Promise<unknown> | unknown
}

export interface ContextCommandSpec extends MovScriptCommandContract {
  commandId: string
  mcpToolName: string
  cliPath: string[]
  description: string
  inputSchema: JSONSchemaObject
  run: (args: Record<string, unknown>) => Promise<unknown> | unknown
}

export interface SystemCommandSpec extends MovScriptCommandContract {
  commandId: string
  mcpToolName: string
  mcpAliases?: string[]
  cliPath: string[]
  description: string
  inputSchema: JSONSchemaObject
  run: (args: Record<string, unknown>) => Promise<unknown>
}

export interface EditingCommandSpec extends MovScriptCommandContract {
  commandId: string
  mcpToolName: string
  cliPath: string[]
  description: string
  inputSchema: JSONSchemaObject
  run: (args: Record<string, unknown>) => Promise<unknown> | unknown
}

export interface TimelineCommandSpec extends MovScriptCommandContract {
  commandId: string
  mcpToolName: string
  cliPath: string[]
  description: string
  inputSchema: JSONSchemaObject
  run: (args: Record<string, unknown>) => Promise<unknown> | unknown
}

export interface WorkspaceCommandSpec extends MovScriptCommandContract {
  commandId: string
  mcpToolName: string
  cliPath: string[]
  description: string
  inputSchema: JSONSchemaObject
  run: (args: Record<string, unknown>) => Promise<unknown> | unknown
}

export interface MovScriptCommandExecution {
  schema: 'movscript.command_result.v1'
  status: 'ok'
  commandId: string
  mcpToolName?: string
  contract: MovScriptCommandContract
  data: unknown
  debug: {
    cli_argv: string[]
    method?: AdminCommandMethod
    path?: string
    cwd: string
    runtime_endpoint?: string
    editing_service_endpoint?: string
    project_service_endpoint?: string
  }
}

const LOCAL_NODE_GATEWAY_SERVICE = LOCAL_RUNTIME_DAEMON_GATEWAY_SERVICE
const LOCAL_NODE_CONTROL_SERVICE = LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE
const DEFAULT_LOCAL_BACKEND = 'http://localhost:8766'
const DATA_SERVICE = 'movscript.data.service'
const PROJECT_SERVICE = 'movscript.project.service'
const EDITING_SERVICE = 'movscript.editing.service'
const LOCAL_SURFACE_HOST_SERVICE = 'movscript.local-surface.host'
const MEDIA_PIPELINE_SERVICE = 'movscript.media.pipeline'
const COMMAND_RUNNER_SERVICE = 'movscript.cli.command-runner'
const TIMELINE_COMPILER_SERVICE = 'movscript.timeline.compiler'

type CommandContractOverride = Partial<Pick<
  MovScriptCommandContract,
  'stability' | 'ownerService' | 'requiredRuntime' | 'permissions' | 'outputSchema'
>>
type CommandDraft<T extends MovScriptCommandContract> = Omit<T, keyof MovScriptCommandContract> & CommandContractOverride
type AdminCommandDraft = CommandDraft<AdminCommandSpec>
type RuntimeCommandDraft = CommandDraft<RuntimeCommandSpec>
type ContextCommandDraft = CommandDraft<ContextCommandSpec>
type SystemCommandDraft = CommandDraft<SystemCommandSpec>
type EditingCommandDraft = CommandDraft<EditingCommandSpec>
type TimelineCommandDraft = CommandDraft<TimelineCommandSpec>
type WorkspaceCommandDraft = CommandDraft<WorkspaceCommandSpec>

function commandContractDefaults(family: MovScriptCommandFamily): Omit<MovScriptCommandContract, 'examples'> {
  switch (family) {
    case 'runtime':
      return {
        family,
        stability: 'stable',
        ownerService: 'movscript.runtime.daemon-control',
        requiredRuntime: [COMMAND_RUNNER_SERVICE, LOCAL_NODE_CONTROL_SERVICE, LOCAL_NODE_GATEWAY_SERVICE],
        permissions: ['runtime:read', 'runtime:control', 'runtime:configure'],
        outputSchema: commandResultOutputSchema(),
      }
    case 'context':
      return {
        family,
        stability: 'stable',
        ownerService: 'movscript.runtime.context-session',
        requiredRuntime: [COMMAND_RUNNER_SERVICE],
        permissions: ['context:read'],
        outputSchema: commandResultOutputSchema(),
      }
    case 'admin':
      return {
        family,
        stability: 'stable',
        ownerService: DATA_SERVICE,
        requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, DATA_SERVICE],
        permissions: ['admin:read', 'admin:write'],
        outputSchema: commandResultOutputSchema(),
      }
    case 'system':
      return {
        family,
        stability: 'stable',
        ownerService: DATA_SERVICE,
        requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, DATA_SERVICE],
        permissions: ['system:read', 'system:write'],
        outputSchema: commandResultOutputSchema(),
      }
    case 'editing':
      return {
        family,
        stability: 'stable',
        ownerService: EDITING_SERVICE,
        requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, EDITING_SERVICE],
        permissions: ['editing:read'],
        outputSchema: commandResultOutputSchema(),
      }
    case 'timeline':
      return {
        family,
        stability: 'stable',
        ownerService: TIMELINE_COMPILER_SERVICE,
        requiredRuntime: [COMMAND_RUNNER_SERVICE],
        permissions: ['timeline:compile'],
        outputSchema: commandResultOutputSchema(),
      }
    case 'workspace':
      return {
        family,
        stability: 'stable',
        ownerService: PROJECT_SERVICE,
        requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, PROJECT_SERVICE],
        permissions: ['project:read', 'project:interpret'],
        outputSchema: commandResultOutputSchema(),
      }
  }
}

function withCommandContract<T extends {
  commandId: string
  cliPath: string[]
  productCliPath?: string[]
  description: string
  mcpToolName: string
} & CommandContractOverride>(
  commands: T[],
  defaults: Omit<MovScriptCommandContract, 'examples'>,
): Array<T & MovScriptCommandContract> {
  return commands.map((command) => {
    const overrides = command as CommandContractOverride
    return {
      ...command,
      family: defaults.family,
      stability: overrides.stability ?? defaults.stability,
      ownerService: overrides.ownerService ?? defaults.ownerService,
      outputSchema: cloneJSONSchema(overrides.outputSchema ?? defaults.outputSchema),
      requiredRuntime: [...(overrides.requiredRuntime ?? defaults.requiredRuntime)],
      permissions: [...(overrides.permissions ?? defaults.permissions)],
      examples: [{
        description: `Run ${command.commandId} through the stable MovScript CLI contract.`,
        argv: commandExampleArgv(defaults.family, command),
      }],
    }
  })
}

function commandExecutionContract(spec: MovScriptCommandContract): MovScriptCommandContract {
  return {
    family: spec.family,
    stability: spec.stability,
    ownerService: spec.ownerService,
    requiredRuntime: [...spec.requiredRuntime],
    permissions: [...spec.permissions],
    outputSchema: cloneJSONSchema(spec.outputSchema),
    examples: spec.examples.map((example) => ({
      description: example.description,
      argv: [...example.argv],
    })),
  }
}

function commandExampleArgv(
  family: MovScriptCommandFamily,
  command: { commandId: string; cliPath: string[]; productCliPath?: string[] },
): string[] {
  const argv = command.productCliPath
    ? ['movscript', ...command.productCliPath]
    : ['movscript', family, ...command.cliPath]
  if (command.commandId === 'workspace.get_model') argv.push('project')
  argv.push('--json')
  return argv
}

function commandResultOutputSchema(): JSONSchemaObject {
  return objectSchema({
    schema: { type: 'string', const: 'movscript.command_result.v1' },
    status: { type: 'string', enum: ['ok'] },
    commandId: { type: 'string' },
    mcpToolName: { type: 'string' },
    contract: {
      type: 'object',
      additionalProperties: true,
      description: 'Stable command contract metadata for CLI/MCP parity and diagnostics.',
    },
    data: {
      description: 'Command-specific result payload.',
    },
    debug: {
      type: 'object',
      additionalProperties: true,
      description: 'Reproducible CLI argv, cwd, runtime endpoints, and safe diagnostics.',
    },
  }, ['schema', 'status', 'commandId', 'contract', 'data', 'debug'])
}

function cloneJSONSchema(schema: JSONSchemaObject): JSONSchemaObject {
  return JSON.parse(JSON.stringify(schema)) as JSONSchemaObject
}

export const runtimeCommandSpecs: RuntimeCommandSpec[] = withCommandContract<RuntimeCommandDraft>([
  {
    commandId: 'runtime.status',
    mcpToolName: 'movscript_runtime_status',
    cliPath: ['status'],
    description: 'Runtime: report daemon, backend, workspace, surface, and media-pipeline readiness.',
    inputSchema: runtimeReadinessSchema(),
    run: runtimeStatus,
  },
  {
    commandId: 'runtime.configure',
    mcpToolName: 'movscript_runtime_configure',
    cliPath: ['configure'],
    description: 'Runtime: configure backend binding, auth token, and default workspace/project context.',
    inputSchema: runtimeConfigureSchema(),
    run: runtimeConfigure,
  },
  {
    commandId: 'runtime.daemon.configure',
    mcpToolName: 'runtime_daemon_configure',
    cliPath: ['daemon', 'configure'],
    productCliPath: ['daemon', 'configure'],
    description: 'Runtime daemon: configure backend binding from the daemon command surface.',
    inputSchema: runtimeConfigureSchema(),
    run: runtimeConfigure,
  },
  {
    commandId: 'runtime.daemon.discover',
    mcpToolName: 'runtime_daemon_discover',
    cliPath: ['daemon', 'discover'],
    productCliPath: ['daemon', 'discover'],
    description: 'Runtime daemon: read MovScript Home service records without starting or probing services.',
    inputSchema: runtimeReadinessSchema(),
    run: runtimeDaemonDiscover,
  },
  {
    commandId: 'runtime.daemon.ensure',
    mcpToolName: 'runtime_daemon_ensure',
    mcpAliases: ['runtime_local_daemon_ensure'],
    cliPath: ['daemon', 'ensure'],
    productCliPath: ['daemon', 'ensure'],
    description: 'Runtime daemon: ensure the persistent local daemon is running and ready.',
    inputSchema: localDaemonBootstrapSchema(),
    run: localDaemonEnsure,
  },
  {
    commandId: 'runtime.daemon.start',
    mcpToolName: 'runtime_daemon_start',
    mcpAliases: ['runtime_local_daemon_start'],
    cliPath: ['daemon', 'start'],
    productCliPath: ['daemon', 'start'],
    description: 'Runtime daemon: start or restart the persistent local daemon.',
    inputSchema: localDaemonBootstrapSchema(),
    run: localDaemonEnsure,
  },
  {
    commandId: 'runtime.daemon.status',
    mcpToolName: 'runtime_daemon_status',
    mcpAliases: ['runtime_local_daemon_status', 'runtime_local_node_status'],
    cliPath: ['daemon', 'status'],
    productCliPath: ['daemon', 'status'],
    description: 'Runtime daemon: call the local daemon control status endpoint.',
    inputSchema: localDaemonControlSchema(),
    run: async (args) => localNodeControl(args, 'GET', '/status'),
  },
  {
    commandId: 'runtime.daemon.stop',
    mcpToolName: 'runtime_daemon_stop',
    mcpAliases: ['runtime_local_daemon_stop', 'runtime_local_node_stop'],
    cliPath: ['daemon', 'stop'],
    productCliPath: ['daemon', 'stop'],
    description: 'Runtime daemon: gracefully stop the persistent local daemon.',
    inputSchema: localDaemonControlSchema(),
    run: async (args) => localNodeControl(args, 'POST', '/shutdown'),
  },
  {
    commandId: 'runtime.daemon.restart',
    mcpToolName: 'runtime_daemon_restart',
    mcpAliases: ['runtime_local_daemon_restart', 'runtime_local_node_restart'],
    cliPath: ['daemon', 'restart'],
    productCliPath: ['daemon', 'restart'],
    description: 'Runtime daemon: gracefully restart the persistent local daemon.',
    inputSchema: localDaemonControlSchema(),
    run: async (args) => localNodeControl(args, 'POST', '/restart'),
  },
  {
    commandId: 'runtime.descriptor.get',
    mcpToolName: 'runtime_descriptor_get',
    cliPath: ['descriptor', 'get'],
    description: 'Runtime: return the canonical agent descriptor for endpoints, services, surfaces, and missing capabilities.',
    inputSchema: runtimeReadinessSchema(),
    run: runtimeDescriptorGet,
  },
  {
    commandId: 'runtime.preflight.check',
    mcpToolName: 'runtime_preflight_check',
    cliPath: ['preflight', 'check'],
    description: 'Runtime: run read-only preflight checks before project, generation, admin, or editing work.',
    inputSchema: runtimeReadinessSchema({
      requireProject: { type: 'boolean', description: 'When false, do not treat a missing project source as a blocker.' },
      require_project: { type: 'boolean', description: 'Alias for requireProject.' },
    }),
    run: runtimePreflightCheck,
  },
], commandContractDefaults('runtime'))

export const contextCommandSpecs: ContextCommandSpec[] = withCommandContract<ContextCommandDraft>([
  {
    commandId: 'context.current.get',
    mcpToolName: 'context_current_get',
    cliPath: ['current', 'get'],
    description: 'Context: return the current read-only UI/session hint without requiring a frontend write target.',
    inputSchema: toolInputSchema(contextTools(), 'context_current_get'),
    run: getCurrentContext,
  },
], commandContractDefaults('context'))

export const adminCommandSpecs: AdminCommandSpec[] = withCommandContract<AdminCommandDraft>([
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
], commandContractDefaults('admin'))

export const systemCommandSpecs: SystemCommandSpec[] = withCommandContract<SystemCommandDraft>([
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
], commandContractDefaults('system'))

export const editingCommandSpecs: EditingCommandSpec[] = withCommandContract<EditingCommandDraft>([
  {
    commandId: 'editing.runtime.capabilities.get',
    mcpToolName: 'editing_runtime_capabilities_get',
    cliPath: ['runtime', 'capabilities', 'get'],
    description: 'Editing backend: report MediaEditingProject/mediaPipeline runtime capabilities without starting render tasks.',
    inputSchema: toolInputSchema(editingTools(), 'editing_runtime_capabilities_get'),
    run: editingRuntimeCapabilitiesGet,
  },
  {
    commandId: 'editing.video.compose',
    mcpToolName: 'editing_video_compose',
    cliPath: ['video', 'compose'],
    description: 'Editing backend: compile/resolve a MediaEditingProject, validate it, and create a render or HLS Media Pipeline task without creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_video_compose'),
    ownerService: MEDIA_PIPELINE_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, EDITING_SERVICE, MEDIA_PIPELINE_SERVICE],
    permissions: ['editing:read', 'editing:write'],
    run: editingVideoCompose,
  },
  {
    commandId: 'editing.timeline.validate',
    mcpToolName: 'editing_timeline_validate',
    cliPath: ['timeline', 'validate'],
    description: 'Editing backend: validate a MediaEditingProject timeline before render/export without creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_timeline_validate'),
    run: editingTimelineValidate,
  },
  {
    commandId: 'editing.timeline.apply_commands',
    mcpToolName: 'editing_timeline_apply_commands',
    cliPath: ['timeline', 'apply-commands'],
    description: 'Editing backend: apply MediaTimelineCommand objects to a MediaEditingProject without rendering or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_timeline_apply_commands'),
    permissions: ['editing:read', 'editing:write'],
    run: editingTimelineApplyCommands,
  },
  {
    commandId: 'editing.timeline.add_track',
    mcpToolName: 'editing_timeline_add_track',
    cliPath: ['timeline', 'add-track'],
    description: 'Editing backend: add a track to a MediaEditingProject timeline without rendering or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_timeline_add_track'),
    permissions: ['editing:read', 'editing:write'],
    run: editingTimelineAddTrack,
  },
  {
    commandId: 'editing.timeline.remove_track',
    mcpToolName: 'editing_timeline_remove_track',
    cliPath: ['timeline', 'remove-track'],
    description: 'Editing backend: remove an empty track from a MediaEditingProject timeline without rendering or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_timeline_remove_track'),
    permissions: ['editing:read', 'editing:write'],
    run: editingTimelineRemoveTrack,
  },
  {
    commandId: 'editing.timeline.add_clip',
    mcpToolName: 'editing_timeline_add_clip',
    cliPath: ['timeline', 'add-clip'],
    description: 'Editing backend: add a clip to a MediaEditingProject timeline without rendering or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_timeline_add_clip'),
    permissions: ['editing:read', 'editing:write'],
    run: editingTimelineAddClip,
  },
  {
    commandId: 'editing.timeline.update_clip',
    mcpToolName: 'editing_timeline_update_clip',
    cliPath: ['timeline', 'update-clip'],
    description: 'Editing backend: update clip timing, trim, fit, style, or metadata without rendering or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_timeline_update_clip'),
    permissions: ['editing:read', 'editing:write'],
    run: editingTimelineUpdateClip,
  },
  {
    commandId: 'editing.timeline.split_clip',
    mcpToolName: 'editing_timeline_split_clip',
    cliPath: ['timeline', 'split-clip'],
    description: 'Editing backend: split a timeline clip in a MediaEditingProject without rendering or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_timeline_split_clip'),
    permissions: ['editing:read', 'editing:write'],
    run: editingTimelineSplitClip,
  },
  {
    commandId: 'editing.timeline.move_clip',
    mcpToolName: 'editing_timeline_move_clip',
    cliPath: ['timeline', 'move-clip'],
    description: 'Editing backend: move a clip on a MediaEditingProject timeline without rendering or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_timeline_move_clip'),
    permissions: ['editing:read', 'editing:write'],
    run: editingTimelineMoveClip,
  },
  {
    commandId: 'editing.timeline.delete_clip',
    mcpToolName: 'editing_timeline_delete_clip',
    cliPath: ['timeline', 'delete-clip'],
    description: 'Editing backend: delete a clip from a MediaEditingProject timeline without rendering or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_timeline_delete_clip'),
    permissions: ['editing:read', 'editing:write'],
    run: editingTimelineDeleteClip,
  },
  {
    commandId: 'editing.task.get',
    mcpToolName: 'editing_task_get',
    cliPath: ['task', 'get'],
    description: 'Editing backend: read a Media Pipeline task state through Editing Service routing without creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_task_get'),
    run: editingTaskGet,
  },
  {
    commandId: 'editing.task.cancel',
    mcpToolName: 'editing_task_cancel',
    cliPath: ['task', 'cancel'],
    description: 'Editing backend: cancel a Media Pipeline task through Editing Service routing without exporting or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_task_cancel'),
    permissions: ['editing:read', 'editing:write'],
    run: editingTaskCancel,
  },
  {
    commandId: 'editing.task.logs_get',
    mcpToolName: 'editing_task_logs_get',
    cliPath: ['task', 'logs', 'get'],
    description: 'Editing backend: read Media Pipeline task logs through Editing Service routing without exporting or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_task_logs_get'),
    run: editingTaskLogsGet,
  },
  {
    commandId: 'editing.task.render_create',
    mcpToolName: 'editing_task_render_create',
    cliPath: ['task', 'render', 'create'],
    description: 'Editing backend: create a Media Pipeline timeline_render task from a MediaEditingProject without exporting or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_task_render_create'),
    ownerService: MEDIA_PIPELINE_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, EDITING_SERVICE, MEDIA_PIPELINE_SERVICE],
    permissions: ['editing:read', 'editing:write'],
    run: editingTaskRenderCreate,
  },
  {
    commandId: 'editing.task.hls_create',
    mcpToolName: 'editing_task_hls_create',
    cliPath: ['task', 'hls', 'create'],
    description: 'Editing backend: create a Media Pipeline timeline_hls task from a MediaEditingProject without exporting or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_task_hls_create'),
    ownerService: MEDIA_PIPELINE_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, EDITING_SERVICE, MEDIA_PIPELINE_SERVICE],
    permissions: ['editing:read', 'editing:write'],
    run: editingTaskHlsCreate,
  },
  {
    commandId: 'editing.task.transcode_create',
    mcpToolName: 'editing_task_transcode_create',
    cliPath: ['task', 'transcode', 'create'],
    description: 'Editing backend: create a Media Pipeline media_transcode task without exporting or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_task_transcode_create'),
    ownerService: MEDIA_PIPELINE_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, EDITING_SERVICE, MEDIA_PIPELINE_SERVICE],
    permissions: ['editing:read', 'editing:write'],
    run: editingTaskTranscodeCreate,
  },
  {
    commandId: 'editing.task.reframe_create',
    mcpToolName: 'editing_task_reframe_create',
    cliPath: ['task', 'reframe', 'create'],
    description: 'Editing backend: create a Media Pipeline media_reframe task without exporting or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_task_reframe_create'),
    ownerService: MEDIA_PIPELINE_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, EDITING_SERVICE, MEDIA_PIPELINE_SERVICE],
    permissions: ['editing:read', 'editing:write'],
    run: editingTaskReframeCreate,
  },
  {
    commandId: 'editing.export.import_resource',
    mcpToolName: 'editing_export_import_resource',
    cliPath: ['export', 'import-resource'],
    description: 'Editing backend: import a completed local editing export as a RawResource without adopting or selecting it.',
    inputSchema: toolInputSchema(editingTools(), 'editing_export_import_resource'),
    ownerService: DATA_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, EDITING_SERVICE, DATA_SERVICE],
    permissions: ['editing:read', 'editing:write'],
    run: editingExportImportResource,
  },
  {
    commandId: 'editing.export.save_local',
    mcpToolName: 'editing_export_save_local',
    cliPath: ['export', 'save-local'],
    description: 'Editing backend: save or confirm a completed editing export path locally without uploading or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_export_save_local'),
    permissions: ['editing:read', 'editing:write'],
    run: editingExportSaveLocal,
  },
  {
    commandId: 'editing.export.publish_hls',
    mcpToolName: 'editing_export_publish_hls',
    cliPath: ['export', 'publish-hls'],
    description: 'Editing backend: publish completed HLS manifest/segments as a MediaStreamArtifact without writing a domain candidate.',
    inputSchema: toolInputSchema(editingTools(), 'editing_export_publish_hls'),
    ownerService: DATA_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, EDITING_SERVICE, DATA_SERVICE],
    permissions: ['editing:read', 'editing:write'],
    run: editingExportPublishHls,
  },
  {
    commandId: 'editing.export.create_candidate',
    mcpToolName: 'editing_export_create_candidate',
    cliPath: ['export', 'create-candidate'],
    description: 'Editing backend: explicitly write a RawResource-backed editing export as a content candidate; this does not adopt or select it.',
    inputSchema: toolInputSchema(editingTools(), 'editing_export_create_candidate'),
    ownerService: PROJECT_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, PROJECT_SERVICE, DATA_SERVICE],
    permissions: ['editing:read', 'editing:write', 'project:write'],
    run: editingExportCreateCandidate,
  },
  {
    commandId: 'editing.project.create',
    mcpToolName: 'editing_project_create',
    cliPath: ['project', 'create'],
    description: 'Editing backend: create and persist an empty MediaEditingProject without rendering or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_project_create'),
    permissions: ['editing:read', 'editing:write'],
    run: editingProjectCreate,
  },
  {
    commandId: 'editing.project.create_from_edit_plan',
    mcpToolName: 'editing_project_create_from_edit_plan',
    cliPath: ['project', 'create-from-edit-plan'],
    description: 'Editing backend: create and persist a MediaEditingProject from a MovScript edit_plan without rendering or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_project_create_from_edit_plan'),
    permissions: ['editing:read', 'editing:write'],
    run: editingProjectCreateFromEditPlan,
  },
  {
    commandId: 'editing.project.create_from_edit_decisions',
    mcpToolName: 'editing_project_create_from_edit_decisions',
    cliPath: ['project', 'create-from-edit-decisions'],
    description: 'Editing backend: create and persist a MediaEditingProject from edit decisions without rendering or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_project_create_from_edit_decisions'),
    permissions: ['editing:read', 'editing:write'],
    run: editingProjectCreateFromEditDecisions,
  },
  {
    commandId: 'editing.project.get',
    mcpToolName: 'editing_project_get',
    cliPath: ['project', 'get'],
    description: 'Editing backend: read a persisted MediaEditingProject by project and editing project id.',
    inputSchema: toolInputSchema(editingTools(), 'editing_project_get'),
    run: editingProjectGet,
  },
  {
    commandId: 'editing.project.save',
    mcpToolName: 'editing_project_save',
    cliPath: ['project', 'save'],
    description: 'Editing backend: persist a MediaEditingProject revision through Editing Service without rendering or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_project_save'),
    permissions: ['editing:read', 'editing:write'],
    run: editingProjectSave,
  },
  {
    commandId: 'editing.project.update_settings',
    mcpToolName: 'editing_project_update_settings',
    cliPath: ['project', 'update-settings'],
    description: 'Editing backend: update MediaEditingProject settings only; this does not render or create candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_project_update_settings'),
    permissions: ['editing:read', 'editing:write'],
    run: editingProjectUpdateSettings,
  },
  {
    commandId: 'editing.project.add_asset',
    mcpToolName: 'editing_project_add_asset',
    cliPath: ['project', 'add-asset'],
    description: 'Editing backend: add a media asset descriptor to a MediaEditingProject asset registry.',
    inputSchema: toolInputSchema(editingTools(), 'editing_project_add_asset'),
    permissions: ['editing:read', 'editing:write'],
    run: editingProjectAddAsset,
  },
  {
    commandId: 'editing.project.remove_asset',
    mcpToolName: 'editing_project_remove_asset',
    cliPath: ['project', 'remove-asset'],
    description: 'Editing backend: remove an unused media asset descriptor from a MediaEditingProject asset registry.',
    inputSchema: toolInputSchema(editingTools(), 'editing_project_remove_asset'),
    permissions: ['editing:read', 'editing:write'],
    run: editingProjectRemoveAsset,
  },
], commandContractDefaults('editing'))

export const timelineCommandSpecs: TimelineCommandSpec[] = withCommandContract<TimelineCommandDraft>([
  {
    commandId: 'timeline.backend.capability.list',
    mcpToolName: 'timeline_backend_capability_list',
    cliPath: ['backend', 'capability', 'list'],
    description: 'Timeline: list TimelineAssembly compile backends and their execution project contracts.',
    inputSchema: toolInputSchema(timelineTools(), 'timeline_backend_capability_list'),
    run: timelineBackendCapabilityList,
  },
  {
    commandId: 'timeline.assembly.get',
    mcpToolName: 'timeline_assembly_get',
    cliPath: ['assembly', 'get'],
    description: 'Timeline: inspect a supplied TimelineAssembly intent envelope without inferring UI focus.',
    inputSchema: toolInputSchema(timelineTools(), 'timeline_assembly_get'),
    run: timelineAssemblyGet,
  },
  {
    commandId: 'timeline.assembly.validate',
    mcpToolName: 'timeline_assembly_validate',
    cliPath: ['assembly', 'validate'],
    description: 'Timeline: validate TimelineAssembly compile readiness and return conformance diagnostics.',
    inputSchema: toolInputSchema(timelineTools(), 'timeline_assembly_validate'),
    run: timelineAssemblyValidate,
  },
  {
    commandId: 'timeline.compile_manifest.create',
    mcpToolName: 'timeline_compile_manifest_create',
    cliPath: ['compile', 'manifest', 'create'],
    description: 'Timeline: create a deterministic CompileManifest from TimelineAssembly and edit decisions.',
    inputSchema: toolInputSchema(timelineTools(), 'timeline_compile_manifest_create'),
    run: timelineCompileManifestCreate,
  },
  {
    commandId: 'timeline.backend.select',
    mcpToolName: 'timeline_backend_select',
    cliPath: ['backend', 'select'],
    description: 'Timeline: select a backend and return review-gated conformance when compile inputs are supplied.',
    inputSchema: toolInputSchema(timelineTools(), 'timeline_backend_select'),
    run: timelineBackendSelect,
  },
  {
    commandId: 'timeline.backend.project.create',
    mcpToolName: 'timeline_backend_project_create',
    cliPath: ['backend', 'project', 'create'],
    description: 'Timeline: compile TimelineAssembly into a no-persist backend execution project.',
    inputSchema: toolInputSchema(timelineTools(), 'timeline_backend_project_create'),
    run: timelineBackendProjectCreate,
  },
  {
    commandId: 'timeline.assembly.compile',
    mcpToolName: 'timeline_assembly_compile',
    cliPath: ['assembly', 'compile'],
    description: 'Timeline: compile TimelineAssembly through the selected backend without rendering or persisting.',
    inputSchema: toolInputSchema(timelineTools(), 'timeline_assembly_compile'),
    run: timelineAssemblyCompile,
  },
  {
    commandId: 'timeline.backend.conformance.report',
    mcpToolName: 'timeline_backend_conformance_report',
    cliPath: ['backend', 'conformance', 'report'],
    description: 'Timeline: report backend conformance blockers and degradations for a CompileManifest or compile input.',
    inputSchema: toolInputSchema(timelineTools(), 'timeline_backend_conformance_report'),
    run: timelineBackendConformanceReport,
  },
], commandContractDefaults('timeline'))

export const workspaceCommandSpecs: WorkspaceCommandSpec[] = withCommandContract<WorkspaceCommandDraft>([
  {
    commandId: 'workspace.get_model',
    mcpToolName: 'domain_get_model',
    cliPath: ['get-model'],
    description: 'Workspace: return the editable domain model for one entity without requiring a frontend.',
    inputSchema: toolInputSchema(domainTools(), 'domain_get_model'),
    run: domainGetModel,
  },
  {
    commandId: 'workspace.review',
    mcpToolName: 'domain_inspect',
    cliPath: ['review'],
    description: 'Workspace: inspect project source changes and diagnostics without writing interpreted artifacts.',
    inputSchema: toolInputSchema(domainTools(), 'domain_inspect'),
    run: domainInspect,
  },
  {
    commandId: 'workspace.interpret',
    mcpToolName: 'domain_interpret',
    cliPath: ['interpret'],
    description: 'Workspace: validate source and refresh interpreter diagnostics without requiring a frontend.',
    inputSchema: toolInputSchema(domainTools(), 'domain_interpret'),
    run: domainInterpret,
  },
], commandContractDefaults('workspace'))

export const runtimeCommandByMCPToolName = new Map(runtimeCommandSpecs.flatMap((spec) => [
  [spec.mcpToolName, spec],
  ...(spec.mcpAliases ?? []).map((alias) => [alias, spec] as const),
] as const))
export const runtimeCommandById = new Map(runtimeCommandSpecs.map((spec) => [spec.commandId, spec]))
export const contextCommandByMCPToolName = new Map(contextCommandSpecs.map((spec) => [spec.mcpToolName, spec]))
export const contextCommandById = new Map(contextCommandSpecs.map((spec) => [spec.commandId, spec]))
export const adminCommandByMCPToolName = new Map(adminCommandSpecs.map((spec) => [spec.mcpToolName, spec]))
export const adminCommandById = new Map(adminCommandSpecs.map((spec) => [spec.commandId, spec]))
export const systemCommandByMCPToolName = new Map(systemCommandSpecs.flatMap((spec) => [
  [spec.mcpToolName, spec],
  ...(spec.mcpAliases ?? []).map((alias) => [alias, spec] as const),
] as const))
export const systemCommandById = new Map(systemCommandSpecs.map((spec) => [spec.commandId, spec]))
export const editingCommandByMCPToolName = new Map(editingCommandSpecs.map((spec) => [spec.mcpToolName, spec]))
export const editingCommandById = new Map(editingCommandSpecs.map((spec) => [spec.commandId, spec]))
export const timelineCommandByMCPToolName = new Map(timelineCommandSpecs.map((spec) => [spec.mcpToolName, spec]))
export const timelineCommandById = new Map(timelineCommandSpecs.map((spec) => [spec.commandId, spec]))
export const workspaceCommandByMCPToolName = new Map(workspaceCommandSpecs.map((spec) => [spec.mcpToolName, spec]))
export const workspaceCommandById = new Map(workspaceCommandSpecs.map((spec) => [spec.commandId, spec]))

export function isRuntimeMCPToolName(name: string | undefined): boolean {
  return Boolean(name && runtimeCommandByMCPToolName.has(name))
}

export function isContextMCPToolName(name: string | undefined): boolean {
  return Boolean(name && contextCommandByMCPToolName.has(name))
}

export function isAdminMCPToolName(name: string | undefined): boolean {
  return Boolean(name && adminCommandByMCPToolName.has(name))
}

export function isSystemMCPToolName(name: string | undefined): boolean {
  return Boolean(name && systemCommandByMCPToolName.has(name))
}

export function isEditingMCPToolName(name: string | undefined): boolean {
  return Boolean(name && editingCommandByMCPToolName.has(name))
}

export function isTimelineMCPToolName(name: string | undefined): boolean {
  return Boolean(name && timelineCommandByMCPToolName.has(name))
}

export function isWorkspaceMCPToolName(name: string | undefined): boolean {
  return Boolean(name && workspaceCommandByMCPToolName.has(name))
}

export async function runMovScriptRuntimeCommand(
  specOrName: RuntimeCommandSpec | string,
  args: Record<string, unknown> = {},
): Promise<MovScriptCommandExecution> {
  const spec = typeof specOrName === 'string'
    ? runtimeCommandByMCPToolName.get(specOrName) ?? runtimeCommandById.get(specOrName)
    : specOrName
  if (!spec) throw new Error(`Unknown runtime command: ${specOrName}`)

  const data = await spec.run(args)
  return {
    schema: 'movscript.command_result.v1',
    status: 'ok',
    commandId: spec.commandId,
    mcpToolName: spec.mcpToolName,
    contract: commandExecutionContract(spec),
    data,
    debug: {
      cli_argv: runtimeDebugCliArgv(spec, args),
      cwd: process.cwd(),
    },
  }
}

export async function runMovScriptContextCommand(
  specOrName: ContextCommandSpec | string,
  args: Record<string, unknown> = {},
): Promise<MovScriptCommandExecution> {
  const spec = typeof specOrName === 'string'
    ? contextCommandByMCPToolName.get(specOrName) ?? contextCommandById.get(specOrName)
    : specOrName
  if (!spec) throw new Error(`Unknown context command: ${specOrName}`)

  const data = await spec.run(args)
  return {
    schema: 'movscript.command_result.v1',
    status: 'ok',
    commandId: spec.commandId,
    mcpToolName: spec.mcpToolName,
    contract: commandExecutionContract(spec),
    data,
    debug: {
      cli_argv: contextDebugCliArgv(spec, args),
      cwd: process.cwd(),
    },
  }
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
    contract: commandExecutionContract(spec),
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
    contract: commandExecutionContract(spec),
    data,
    debug: {
      cli_argv: systemDebugCliArgv(spec, args),
      cwd: process.cwd(),
      ...(binding.backendEndpoint ? { runtime_endpoint: binding.backendEndpoint } : {}),
    },
  }
}

export async function runMovScriptEditingCommand(
  specOrName: EditingCommandSpec | string,
  args: Record<string, unknown> = {},
): Promise<MovScriptCommandExecution> {
  const spec = typeof specOrName === 'string'
    ? editingCommandByMCPToolName.get(specOrName) ?? editingCommandById.get(specOrName)
    : specOrName
  if (!spec) throw new Error(`Unknown editing command: ${specOrName}`)

  const binding = bindEditingRuntime(args)
  try {
    const data = await spec.run(args)
    return {
      schema: 'movscript.command_result.v1',
      status: 'ok',
      commandId: spec.commandId,
      mcpToolName: spec.mcpToolName,
      contract: commandExecutionContract(spec),
      data,
      debug: {
        cli_argv: editingDebugCliArgv(spec, args),
        cwd: process.cwd(),
        ...(binding.backendEndpoint ? { runtime_endpoint: binding.backendEndpoint } : {}),
        ...(binding.editingServiceEndpoint ? { editing_service_endpoint: binding.editingServiceEndpoint } : {}),
      },
    }
  } finally {
    binding.restore?.()
  }
}

export async function runMovScriptTimelineCommand(
  specOrName: TimelineCommandSpec | string,
  args: Record<string, unknown> = {},
): Promise<MovScriptCommandExecution> {
  const spec = typeof specOrName === 'string'
    ? timelineCommandByMCPToolName.get(specOrName) ?? timelineCommandById.get(specOrName)
    : specOrName
  if (!spec) throw new Error(`Unknown timeline command: ${specOrName}`)

  const binding = bindBackendRuntime(args)
  const data = await spec.run(args)
  return {
    schema: 'movscript.command_result.v1',
    status: 'ok',
    commandId: spec.commandId,
    mcpToolName: spec.mcpToolName,
    contract: commandExecutionContract(spec),
    data,
    debug: {
      cli_argv: timelineDebugCliArgv(spec, args),
      cwd: process.cwd(),
      ...(binding.backendEndpoint ? { runtime_endpoint: binding.backendEndpoint } : {}),
    },
  }
}

export async function runMovScriptWorkspaceCommand(
  specOrName: WorkspaceCommandSpec | string,
  args: Record<string, unknown> = {},
): Promise<MovScriptCommandExecution> {
  const spec = typeof specOrName === 'string'
    ? workspaceCommandByMCPToolName.get(specOrName) ?? workspaceCommandById.get(specOrName)
    : specOrName
  if (!spec) throw new Error(`Unknown workspace command: ${specOrName}`)

  const binding = bindWorkspaceRuntime(args)
  try {
    const runArgs = workspaceRunArgs(spec, args)
    const data = await spec.run(runArgs)
    return {
      schema: 'movscript.command_result.v1',
      status: 'ok',
      commandId: spec.commandId,
      mcpToolName: spec.mcpToolName,
      contract: commandExecutionContract(spec),
      data,
      debug: {
        cli_argv: workspaceDebugCliArgv(spec, args),
        cwd: process.cwd(),
        ...(binding.backendEndpoint ? { runtime_endpoint: binding.backendEndpoint } : {}),
        ...(binding.projectServiceEndpoint ? { project_service_endpoint: binding.projectServiceEndpoint } : {}),
      },
    }
  } finally {
    binding.restore?.()
  }
}

export function unwrapCommandDataWithDebug(execution: MovScriptCommandExecution): unknown {
  if (isRecord(execution.data) && !Array.isArray(execution.data)) {
    return {
      ...execution.data,
      contract: execution.contract,
      debug: execution.debug,
    }
  }
  return {
    data: execution.data,
    contract: execution.contract,
    debug: execution.debug,
  }
}

async function localDaemonEnsure(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const homeDir = resolveRuntimeHomeArg(args)
  const entrypoint = resolveLocalDaemonEntrypoint(args)
  const cwd = resolve(stringValue(args.cwd) || process.cwd())
  const startupTimeoutMs = numberValue(args.startupTimeoutMs ?? args.startup_timeout_ms)
  const stopTimeoutMs = numberValue(args.stopTimeoutMs ?? args.stop_timeout_ms)
  const result = await ensureLocalRuntimeDaemon({
    homeDir,
    entrypoint,
    runArgs: ['daemon', 'run'],
    cwd,
    env: localDaemonBootstrapEnv(args),
    forceRestart: args.forceRestart === true || args.force_restart === true,
    ...(startupTimeoutMs ? { startupTimeoutMs } : {}),
    ...(stopTimeoutMs ? { stopTimeoutMs } : {}),
  })
  return {
    bootstrap: 'local_daemon',
    homeDir,
    entrypoint,
    cwd,
    ...result,
  }
}

function resolveLocalDaemonEntrypoint(args: Record<string, unknown>): string {
  const explicit = stringValue(args.entrypoint ?? args.entry_point)
    ?? process.env.MOVSCRIPT_DAEMON_ENTRYPOINT
    ?? process.env.MOVSCRIPT_AGENT_MCP_ENTRYPOINT
    ?? process.argv[1]
  if (!explicit) {
    throw new Error('runtime daemon startup requires an entrypoint; pass entrypoint or run through the MovScript Agent Plugin MCP entrypoint')
  }
  return resolve(explicit)
}

function localDaemonBootstrapEnv(args: Record<string, unknown>): NodeJS.ProcessEnv | undefined {
  const env: NodeJS.ProcessEnv = {}
  const dataPlane = stringValue(args.dataPlane ?? args.data_plane)
  if (dataPlane) {
    if (!['local', 'cloud', 'external'].includes(dataPlane)) {
      throw new Error(`invalid runtime daemon dataPlane: ${dataPlane}`)
    }
    env.MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE = dataPlane
  }
  const dataServiceURL = stringValue(args.dataServiceURL ?? args.data_service_url)
  if (dataServiceURL) env.MOVSCRIPT_DATA_SERVICE_URL = dataServiceURL
  const idleTimeout = stringValue(args.idleTimeout ?? args.idle_timeout)
  if (idleTimeout) {
    env.MOVSCRIPT_LOCAL_DAEMON_IDLE_TIMEOUT = idleTimeout
    env.MOVSCRIPT_LOCAL_NODE_IDLE_TIMEOUT = idleTimeout
  }
  return Object.keys(env).length > 0 ? env : undefined
}

export async function runtimeStatus(args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const workspaceDir = resolve(stringValue(args.workspaceDir ?? args.workspace_dir) || process.env.MOVSCRIPT_WORKSPACE_DIR || process.cwd())
  const projectDir = resolve(stringValue(args.projectDir ?? args.project_dir) || workspaceDir)
  const homeDir = resolveRuntimeHomeArg(args)
  const runtimeHome = readRuntimeHomeSnapshot(homeDir)
  const timeoutMs = numberValue(args.timeoutMs ?? args.timeout_ms) ?? 750
  const homeGatewayEndpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
      ?? findRuntimeService(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)?.endpoint,
  )
  const homeDataEndpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, DATA_SERVICE)
      ?? findRuntimeService(runtimeHome, DATA_SERVICE)?.endpoint,
  )
  const localBackendURL = normalizeBaseURL(stringValue(args.localBackendURL ?? args.local_backend_url) || homeGatewayEndpoint || homeDataEndpoint || DEFAULT_LOCAL_BACKEND)
  const configuredSession = resolveMovScriptBackendSession({
    workspaceDir,
    server: process.env.MOVSCRIPT_DATA_SERVICE_URL,
    token: process.env.MOVSCRIPT_API_TOKEN ?? process.env.MOVSCRIPT_DATA_SERVICE_TOKEN,
  })
  const configuredBaseURL = normalizeBaseURL(configuredSession.baseURL)
  const configuredIsLocal = isLocalBackendURL(configuredBaseURL)
  const localProbe = await probeBackend(localBackendURL, timeoutMs)
  const configuredProbe = configuredBaseURL === localBackendURL
    ? localProbe
    : await probeBackend(configuredBaseURL, timeoutMs)
  const cloudAuth = findCloudAuth(workspaceDir)
  const cloudBaseURL = configuredIsLocal ? cloudAuth.baseURL : configuredBaseURL
  const cloudProbe = cloudBaseURL && cloudBaseURL !== localBackendURL && cloudBaseURL !== configuredBaseURL
    ? await probeBackend(cloudBaseURL, timeoutMs)
    : configuredIsLocal ? { available: false } : configuredProbe
  const project = inspectProjectSource(projectDir)
  const mediaPipeline = mediaPipelineRuntimeStatus(runtimeHome)
  const localNode = localNodeRuntimeStatus(runtimeHome)
  const surfaceHost = surfaceHostRuntimeStatus(runtimeHome)
  const desktop = await probeDesktop(timeoutMs, runtimeHome)
  const localAvailable = localProbe.available
  const cloudConfigured = Boolean(cloudBaseURL || cloudAuth.authenticated || (!configuredIsLocal && configuredSession.token))
  const cloudAvailable = Boolean(cloudBaseURL && isRecord(cloudProbe) && cloudProbe.available === true)
  const selected = selectedBackendMode({
    configuredIsLocal,
    localAvailable,
    cloudAvailable,
    projectAvailable: project.isMovScriptProject,
  })
  const requiresUserChoice = shouldRequireUserChoice({
    localAvailable,
    cloudAvailable,
    projectAvailable: project.isMovScriptProject,
  })
  const missing = missingItems({
    localAvailable,
    cloudAvailable,
    projectAvailable: project.isMovScriptProject,
  })
  const runtimeOwner = runtimeOwnerStatus({
    desktopAvailable: desktop.available === true,
    localDaemonAvailable: localNode.available === true,
    localAvailable,
    cloudAvailable,
    selected,
  })
  const surfaces = localSurfaceURLs({
    surfaceHost,
    project,
    projectDir,
    projectId: stringValue(args.projectId ?? args.project_id),
    productionId: stringValue(args.productionId ?? args.production_id),
    focusQuery: runtimeFocusQuery(args),
    runtimeOwner,
  })

  return {
    status: 'ok',
    home: runtimeHomeSummary(runtimeHome),
    backend: {
      local: {
        available: localAvailable,
        baseURL: localBackendURL,
        discoveredFromHome: Boolean(homeGatewayEndpoint || homeDataEndpoint),
        ...(homeGatewayEndpoint ? { gatewayBaseURL: homeGatewayEndpoint } : {}),
        ...(homeDataEndpoint ? { dataServiceBaseURL: homeDataEndpoint } : {}),
        authenticated: configuredIsLocal && Boolean(configuredSession.token),
        ...(localProbe.error ? { error: localProbe.error } : {}),
      },
      cloud: {
        available: cloudAvailable,
        configured: cloudConfigured,
        ...(cloudBaseURL ? { baseURL: cloudBaseURL } : {}),
        authenticated: Boolean(cloudAuth.authenticated || (!configuredIsLocal && configuredSession.token)),
        ...(isRecord(cloudProbe) && typeof cloudProbe.error === 'string' ? { error: cloudProbe.error } : {}),
      },
      selected,
    },
    workspace: {
      cwd: process.cwd(),
      workspaceDir,
      projectDir,
      ...project,
    },
    desktop,
    localDaemon: localNode,
    localNode,
    surfaceHost,
    surfaces,
    ...(surfaces.primary ? { surface: surfaces.primary } : {}),
    ...(surfaces.secondary.length > 0 ? { secondary_surfaces: surfaces.secondary } : {}),
    mediaPipeline,
    runtimeOwner,
    recommendedMode: recommendedMode(selected, project.isMovScriptProject),
    requiresUserChoice,
    missing,
  }
}

function runtimeDaemonDiscover(args: Record<string, unknown> = {}): Record<string, unknown> {
  const homeDir = resolveRuntimeHomeArg(args)
  const runtimeHome = readRuntimeHomeSnapshot(homeDir)
  const endpoints = runtimeDiscoveredEndpoints(runtimeHome)
  const daemonAvailable = Boolean(endpoints.control || endpoints.gateway)
  return {
    schema: 'movscript.runtime_daemon_discovery.v1',
    status: daemonAvailable ? 'ready' : 'not_running',
    homeDir,
    daemon: {
      available: daemonAvailable,
      applicationId: LOCAL_RUNTIME_DAEMON_APP_ID,
      ...(endpoints.control ? { controlEndpoint: endpoints.control } : {}),
      ...(endpoints.gateway ? { gatewayEndpoint: endpoints.gateway } : {}),
      ...(endpoints.gateway ? { mcpEndpoint: runtimeMcpEndpoint(endpoints.gateway) } : {}),
    },
    endpoints,
    home: runtimeHomeSummary(runtimeHome),
    recommendedNextTool: daemonAvailable ? 'runtime_descriptor_get' : 'runtime_daemon_ensure',
  }
}

async function runtimeDescriptorGet(args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const status = await runtimeStatus(args)
  return runtimeDescriptorFromStatus(status)
}

async function runtimePreflightCheck(args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const status = await runtimeStatus(args)
  const descriptor = runtimeDescriptorFromStatus(status)
  const checks = runtimePreflightChecks(status, args)
  const blockers = checks.filter((check) => check.status === 'blocked')
  const warnings = checks.filter((check) => check.status === 'warning')
  return {
    schema: 'movscript.runtime_preflight.v1',
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'degraded' : 'ready',
    ready: blockers.length === 0,
    blockers,
    warnings,
    checks,
    descriptor,
  }
}

function runtimeDescriptorFromStatus(status: Record<string, unknown>): Record<string, unknown> {
  const backend = recordValue(status.backend)
  const localBackend = recordValue(backend.local)
  const cloudBackend = recordValue(backend.cloud)
  const workspace = recordValue(status.workspace)
  const runtimeOwner = recordValue(status.runtimeOwner)
  const localDaemon = recordValue(status.localDaemon ?? status.localNode)
  const mediaPipeline = recordValue(status.mediaPipeline)
  const surfaceHost = recordValue(status.surfaceHost)
  const surfaces = recordValue(status.surfaces)
  const gatewayEndpoint = stringValue(localBackend.gatewayBaseURL)
  const dataServiceEndpoint = stringValue(localBackend.dataServiceBaseURL)
    ?? (localBackend.discoveredFromHome === true ? stringValue(localBackend.baseURL) : undefined)
  const selected = stringValue(backend.selected)
  const endpointMap: Record<string, unknown> = {}
  if (gatewayEndpoint) {
    endpointMap.gateway = gatewayEndpoint
    endpointMap.mcp = runtimeMcpEndpoint(gatewayEndpoint)
    endpointMap.mcp_http = runtimeMcpEndpoint(gatewayEndpoint)
  }
  if (dataServiceEndpoint) endpointMap.dataService = dataServiceEndpoint
  if (stringValue(localDaemon.endpoint)) endpointMap.daemonControl = stringValue(localDaemon.endpoint)
  if (stringValue(mediaPipeline.endpoint)) endpointMap.mediaPipeline = stringValue(mediaPipeline.endpoint)
  if (stringValue(surfaceHost.endpoint)) endpointMap.surfaceHost = stringValue(surfaceHost.endpoint)

  return {
    schema: 'movscript.runtime_descriptor.v1',
    status: runtimeDescriptorStatus(status),
    owner: runtimeOwner,
    dataPlane: selected ?? (cloudBackend.available === true ? 'cloud' : localBackend.available === true ? 'local' : 'unknown'),
    endpoints: endpointMap,
    services: {
      backend: runtimeServiceDescriptor('backend', localBackend.available === true || cloudBackend.available === true, stringValue(localBackend.baseURL ?? cloudBackend.baseURL), selected),
      daemon: runtimeServiceDescriptor('daemon', localDaemon.available === true, stringValue(localDaemon.endpoint), stringValue(runtimeOwner.kind)),
      dataService: runtimeServiceDescriptor(DATA_SERVICE, localBackend.available === true, dataServiceEndpoint, selected),
      projectService: runtimeServiceDescriptor(PROJECT_SERVICE, Boolean(workspace.isMovScriptProject), stringValue(workspace.projectDir), 'project_source'),
      editingService: runtimeServiceDescriptor(EDITING_SERVICE, true, undefined, 'not_probed'),
      surfaceHost: runtimeServiceDescriptor(LOCAL_SURFACE_HOST_SERVICE, surfaceHost.available === true, stringValue(surfaceHost.endpoint), stringValue(surfaceHost.mode)),
      mediaPipeline: runtimeServiceDescriptor(MEDIA_PIPELINE_SERVICE, mediaPipeline.available === true, stringValue(mediaPipeline.endpoint), 'render'),
    },
    workspace,
    surfaces,
    recommendedMode: status.recommendedMode,
    requiresUserChoice: status.requiresUserChoice,
    missing: Array.isArray(status.missing) ? status.missing : [],
  }
}

function runtimeDescriptorStatus(status: Record<string, unknown>): string {
  const missing = Array.isArray(status.missing) ? status.missing : []
  if (missing.includes('backend')) return 'missing_backend'
  if (missing.length > 0) return 'degraded'
  return 'ready'
}

function runtimeServiceDescriptor(name: string, ready: boolean, endpoint?: string, mode?: string): Record<string, unknown> {
  return {
    name,
    ready,
    status: ready ? 'ready' : 'missing',
    ...(endpoint ? { endpoint } : {}),
    ...(mode ? { mode } : {}),
  }
}

function runtimePreflightChecks(status: Record<string, unknown>, args: Record<string, unknown>): Array<Record<string, unknown> & { status: 'ready' | 'warning' | 'blocked' }> {
  const backend = recordValue(status.backend)
  const localBackend = recordValue(backend.local)
  const cloudBackend = recordValue(backend.cloud)
  const workspace = recordValue(status.workspace)
  const localDaemon = recordValue(status.localDaemon ?? status.localNode)
  const mediaPipeline = recordValue(status.mediaPipeline)
  const surfaceHost = recordValue(status.surfaceHost)
  const requireProject = args.requireProject === false || args.require_project === false ? false : true
  const checks: Array<Record<string, unknown> & { status: 'ready' | 'warning' | 'blocked' }> = []
  checks.push(runtimeCheck({
    id: 'backend',
    ok: localBackend.available === true || cloudBackend.available === true,
    blocker: true,
    message: 'Data backend or daemon gateway is reachable.',
    missingMessage: 'No reachable Data Service, daemon gateway, or cloud backend was found.',
    owner: 'runtime',
  }))
  checks.push(runtimeCheck({
    id: 'daemon',
    ok: localDaemon.available === true,
    blocker: false,
    message: 'Local daemon control endpoint is registered.',
    missingMessage: 'Local daemon control endpoint is not registered; external/cloud runtimes may still work.',
    owner: 'runtime',
  }))
  checks.push(runtimeCheck({
    id: 'project_source',
    ok: workspace.isMovScriptProject === true,
    blocker: requireProject,
    message: 'MovScript project source is available.',
    missingMessage: 'MovScript project source was not found at the selected projectDir/workspaceDir.',
    owner: 'project',
  }))
  checks.push(runtimeCheck({
    id: 'surface_host',
    ok: surfaceHost.available === true,
    blocker: false,
    message: 'Local surface host is available for human review.',
    missingMessage: 'Local surface host is not available; browser review URLs may be unavailable.',
    owner: 'surface',
  }))
  checks.push(runtimeCheck({
    id: 'media_pipeline',
    ok: mediaPipeline.available === true,
    blocker: false,
    message: 'Media Pipeline endpoint is registered.',
    missingMessage: 'Media Pipeline endpoint is not registered; render/transcode/HLS may be unavailable.',
    owner: 'media_pipeline',
  }))
  return checks
}

function runtimeCheck(input: {
  id: string
  ok: boolean
  blocker: boolean
  message: string
  missingMessage: string
  owner: string
}): Record<string, unknown> & { status: 'ready' | 'warning' | 'blocked' } {
  if (input.ok) {
    return {
      id: input.id,
      status: 'ready',
      owner: input.owner,
      message: input.message,
    }
  }
  return {
    id: input.id,
    status: input.blocker ? 'blocked' : 'warning',
    owner: input.owner,
    message: input.missingMessage,
  }
}

function runtimeDiscoveredEndpoints(runtimeHome: RuntimeHomeSnapshot): Record<string, string> {
  const endpoints: Record<string, string> = {}
  setEndpoint(endpoints, 'control', runtimeHome, LOCAL_NODE_CONTROL_SERVICE)
  setEndpoint(endpoints, 'gateway', runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
  setEndpoint(endpoints, 'dataService', runtimeHome, DATA_SERVICE)
  setEndpoint(endpoints, 'projectService', runtimeHome, PROJECT_SERVICE)
  setEndpoint(endpoints, 'editingService', runtimeHome, EDITING_SERVICE)
  setEndpoint(endpoints, 'surfaceHost', runtimeHome, LOCAL_SURFACE_HOST_SERVICE)
  setEndpoint(endpoints, 'mediaPipeline', runtimeHome, MEDIA_PIPELINE_SERVICE)
  if (endpoints.gateway) endpoints.mcp = runtimeMcpEndpoint(endpoints.gateway)
  return endpoints
}

function setEndpoint(output: Record<string, string>, key: string, runtimeHome: RuntimeHomeSnapshot, serviceName: string): void {
  const endpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, serviceName)
      ?? findRuntimeService(runtimeHome, serviceName)?.endpoint,
  )
  if (endpoint) output[key] = endpoint
}

function runtimeMcpEndpoint(baseURL: string): string {
  const normalized = normalizeBaseURL(baseURL)
  return `${normalized}/v1/mcp`
}

async function localNodeControl(args: Record<string, unknown>, method: 'GET' | 'POST', path: string): Promise<Record<string, unknown>> {
  const homeDir = resolveRuntimeHomeArg(args)
  const endpoint = endpointURL(findRuntimeEndpoint(readRuntimeHomeSnapshot(homeDir), LOCAL_NODE_CONTROL_SERVICE))
  if (!endpoint) return { status: 'not_running', homeDir }
  try {
    const response = await fetch(`${endpoint}${path}`, { method, signal: AbortSignal.timeout(3000) })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    return {
      status: response.ok ? payload.status ?? 'ok' : 'error',
      homeDir,
      endpoint,
      ...payload,
      ...(response.ok ? {} : { httpStatus: response.status }),
    }
  } catch (error) {
    return { status: 'error', homeDir, endpoint, error: errorMessage(error) }
  }
}

export function runtimeConfigure(args: Record<string, unknown> = {}): Record<string, unknown> {
  const backendBaseURL = stringValue(args.backendBaseURL ?? args.backend_base_url)
  const backendMode = stringValue(args.backendMode ?? args.backend_mode)
  const workspaceDir = resolve(stringValue(args.workspaceDir ?? args.workspace_dir) || stringValue(args.projectDir ?? args.project_dir) || process.env.MOVSCRIPT_WORKSPACE_DIR || process.cwd())
  const projectDir = stringValue(args.projectDir ?? args.project_dir)
  const token = stringValue(args.token)
  const remember = args.remember === true
  const clearToken = args.clearToken === true || args.clear_token === true

  if (projectDir) setMCPDefaultWorkspaceDir(resolve(projectDir))
  else setMCPDefaultWorkspaceDir(workspaceDir)
  if (backendBaseURL) setMovScriptBackendAPIBaseURL(backendBaseURL)
  if (token) setMovScriptBackendRuntimeAuthToken(token)
  if (clearToken) {
    clearMovScriptBackendAuth(workspaceDir)
    setMovScriptBackendRuntimeAuthToken(undefined)
  }
  const persisted = backendBaseURL && remember
    ? writeMovScriptBackendConfig(workspaceDir, {
        baseURL: backendBaseURL,
        ...(backendMode === 'local' || backendMode === 'cloud' ? { realm: backendMode === 'local' ? { kind: 'local' as const, id: 'local' } : { kind: 'cloud' as const, id: 'default' } } : {}),
      })
    : undefined

  return {
    status: 'configured',
    workspaceDir,
    ...(projectDir ? { projectDir: resolve(projectDir) } : {}),
    ...(backendMode ? { backendMode } : {}),
    ...(backendBaseURL ? { backendBaseURL: normalizeBaseURL(backendBaseURL) } : {}),
    remembered: Boolean(persisted),
    tokenConfigured: Boolean(token),
    tokenCleared: clearToken,
  }
}

function inspectProjectSource(projectDir: string): Record<string, unknown> & { isMovScriptProject: boolean } {
  const workspacePath = resolve(projectDir, 'workspace.json')
  const projectPath = resolve(projectDir, 'project.json')
  const metadataPath = existsSync(workspacePath) ? workspacePath : existsSync(projectPath) ? projectPath : undefined
  const metadata = metadataPath ? readJSON(metadataPath) : undefined
  const sourceCollections = Array.from(MOVSCRIPT_SOURCE_COLLECTION_DIRS)
    .filter((name) => existsSync(resolve(projectDir, name)))
    .sort()
  const sourceRootFiles = Array.from(MOVSCRIPT_SOURCE_ROOT_FILES)
    .filter((name) => existsSync(resolve(projectDir, name)))
    .sort()
  const hasSourceDirs = sourceCollections.length > 0
  const hasSourceRootFiles = sourceRootFiles.length > 0
  const projectUid = isRecord(metadata) ? stringValue(metadata.project_uid ?? metadata.projectUid) : undefined
  const projectTitle = isRecord(metadata) ? stringValue(metadata.title ?? metadata.name) : undefined
  return {
    isMovScriptProject: Boolean(metadataPath || hasSourceDirs || hasSourceRootFiles),
    hasMetadata: Boolean(metadataPath),
    hasSourceDirs,
    hasSourceRootFiles,
    sourceCollections,
    sourceRootFiles,
    ...(metadataPath ? { metadataPath } : {}),
    ...(projectUid ? { projectUid } : {}),
    ...(projectTitle ? { projectTitle } : {}),
  }
}

async function probeBackend(baseURL: string, timeoutMs: number): Promise<{ available: boolean; status?: number; error?: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(250, Math.min(timeoutMs, 5000)))
  try {
    const response = await fetch(`${baseURL.replace(/\/+$/, '')}/health`, { signal: controller.signal })
    return { available: response.ok, status: response.status, ...(response.ok ? {} : { error: `HTTP ${response.status}` }) }
  } catch (error) {
    return { available: false, error: errorMessage(error) }
  } finally {
    clearTimeout(timeout)
  }
}

async function probeDesktop(timeoutMs: number, runtimeHome: RuntimeHomeSnapshot): Promise<Record<string, unknown>> {
  const desktopApp = findRuntimeApp(runtimeHome, 'movscript.desktop')
    ?? findRuntimeApp(runtimeHome, 'movscript.desktop.app')
  const mediaPipeline = mediaPipelineRuntimeStatus(runtimeHome)
  const homeEndpoint = endpointURL(desktopApp?.endpoint)
    ?? endpointURL(findRuntimeEndpoint(runtimeHome, 'movscript.mcp.host'))
  const endpoint = process.env.MOVSCRIPT_MCP_ENDPOINT || homeEndpoint || 'http://127.0.0.1:18765/mcp'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(250, Math.min(timeoutMs, 3000)))
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'runtime-status-desktop-probe', method: 'initialize' }),
      signal: controller.signal,
    })
    return {
      available: response.ok,
      endpoint,
      discoveredFromHome: Boolean(homeEndpoint),
      applicationId: desktopApp?.applicationId,
      mediaPipeline: mediaPipeline.available,
      ...(mediaPipeline.endpoint ? { mediaPipelineEndpoint: mediaPipeline.endpoint } : {}),
      ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
    }
  } catch (error) {
    return {
      available: false,
      endpoint,
      discoveredFromHome: Boolean(homeEndpoint),
      applicationId: desktopApp?.applicationId,
      mediaPipeline: mediaPipeline.available,
      ...(mediaPipeline.endpoint ? { mediaPipelineEndpoint: mediaPipeline.endpoint } : {}),
      error: errorMessage(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function mediaPipelineRuntimeStatus(runtimeHome: RuntimeHomeSnapshot): Record<string, unknown> & { available: boolean; endpoint?: string } {
  const endpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, MEDIA_PIPELINE_SERVICE)
      ?? findRuntimeService(runtimeHome, MEDIA_PIPELINE_SERVICE)?.endpoint,
  )
  return {
    available: Boolean(endpoint),
    ...(endpoint ? { endpoint } : {}),
  }
}

function localNodeRuntimeStatus(runtimeHome: RuntimeHomeSnapshot): Record<string, unknown> & { available: boolean; endpoint?: string } {
  const endpoint = endpointURL(findRuntimeEndpoint(runtimeHome, LOCAL_NODE_CONTROL_SERVICE))
  return {
    available: Boolean(endpoint),
    ...(endpoint ? { endpoint } : {}),
  }
}

function surfaceHostRuntimeStatus(runtimeHome: RuntimeHomeSnapshot): Record<string, unknown> & { available: boolean; endpoint?: string } {
  const gatewayEndpointRecord = findRuntimeEndpoint(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
  const gatewayServiceRecord = findRuntimeService(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
  const surfaceEndpointRecord = findRuntimeEndpoint(runtimeHome, LOCAL_SURFACE_HOST_SERVICE)
  const surfaceServiceRecord = findRuntimeService(runtimeHome, LOCAL_SURFACE_HOST_SERVICE)
  const endpointRecord = gatewayEndpointRecord ?? surfaceEndpointRecord
  const serviceRecord = gatewayServiceRecord ?? surfaceServiceRecord
  const endpoint = endpointURL(endpointRecord ?? serviceRecord?.endpoint)
  const ownerApplicationId = endpointRecord?.applicationId ?? serviceRecord?.ownerApplicationId
  const serviceName = endpointRecord?.serviceName ?? serviceRecord?.serviceName ?? LOCAL_SURFACE_HOST_SERVICE
  return {
    available: Boolean(endpoint),
    serviceName,
    surfaceHostServiceName: LOCAL_SURFACE_HOST_SERVICE,
    ...(endpoint ? { endpoint } : {}),
    ...(ownerApplicationId ? { ownerApplicationId } : {}),
    ...(ownerApplicationId ? { mode: surfaceHostMode(ownerApplicationId) } : {}),
  }
}

function surfaceHostMode(ownerApplicationId: string): string {
  if (ownerApplicationId === 'movscript.agent-plugin') return 'agent-plugin-session'
  if (ownerApplicationId === LOCAL_RUNTIME_DAEMON_APP_ID) return 'local-daemon'
  if (ownerApplicationId === 'movscript.desktop') return 'desktop-owned'
  return 'external'
}

function localSurfaceURLs(input: {
  surfaceHost: Record<string, unknown> & { available: boolean; endpoint?: string }
  project: Record<string, unknown> & { isMovScriptProject: boolean }
  projectDir: string
  projectId?: string
  productionId?: string
  focusQuery?: Record<string, string>
  runtimeOwner: Record<string, unknown>
}): {
  available: boolean
  openable: boolean
  reason: string
  primary?: Record<string, unknown>
  secondary: Record<string, unknown>[]
  urls: Record<string, string>
  startupAllowed: boolean
} {
  const startupAllowed = input.runtimeOwner.surfaceHostStartupAllowed === true
  if (!input.surfaceHost.endpoint) {
    return {
      available: false,
      openable: false,
      reason: startupAllowed ? 'local_surface_host_not_ready_startup_allowed' : 'local_surface_host_not_ready',
      secondary: [],
      urls: {},
      startupAllowed,
    }
  }

  const baseURL = normalizeBaseURL(input.surfaceHost.endpoint)
  const projectId = input.projectId
    ?? stringValue(input.project.projectUid)
    ?? safeProjectIdFromDir(input.projectDir)
  const commonQuery: Record<string, string> = {
    source: 'runtime-status',
    projectId,
    projectDir: input.projectDir,
  }
  if (input.productionId) commonQuery.productionId = input.productionId
  for (const [key, value] of Object.entries(input.focusQuery ?? {})) {
    commonQuery[key] = value
  }

  const home = localSurfaceURL(baseURL, '/', commonQuery)
  const projectOverview = localSurfaceURL(baseURL, `/studio/${encodeURIComponent(projectId)}/overview`, commonQuery)
  const projectContent = localSurfaceURL(baseURL, `/studio/${encodeURIComponent(projectId)}/content`, commonQuery)
  const projectTimeline = localSurfaceURL(baseURL, `/studio/${encodeURIComponent(projectId)}/timeline`, commonQuery)
  const canvas = localSurfaceURL(baseURL, '/canvases', { source: 'runtime-status' })
  const editing = localSurfaceURL(baseURL, '/editing', commonQuery)
  const admin = localSurfaceURL(baseURL, '/admin/overview', { source: 'runtime-status' })

  const primary = input.project.isMovScriptProject
    ? runtimeSurfaceLink({
        title: 'MovScript project overview',
        surface: 'project.overview',
        route: `/studio/${encodeURIComponent(projectId)}/overview`,
        url: projectOverview,
        usage: 'Open this URL in the Codex/in-app browser when the user needs to inspect or operate the MovScript project UI.',
      })
    : runtimeSurfaceLink({
        title: 'MovScript Local Surface Host',
        surface: 'local-surface-host',
        route: '/',
        url: home,
        usage: 'Open this URL in the Codex/in-app browser to choose a MovScript local surface.',
      })

  const secondary = [
    runtimeSurfaceLink({
      title: 'MovScript project content',
      surface: 'project.content',
      route: `/studio/${encodeURIComponent(projectId)}/content`,
      url: projectContent,
      usage: 'Open this URL to inspect content units and project content state.',
    }),
    runtimeSurfaceLink({
      title: 'MovScript project timeline',
      surface: 'project.timeline',
      route: `/studio/${encodeURIComponent(projectId)}/timeline`,
      url: projectTimeline,
      usage: 'Open this URL to inspect the project timeline surface.',
    }),
    runtimeSurfaceLink({
      title: 'MovScript canvases',
      surface: 'canvas',
      route: '/canvases',
      url: canvas,
      usage: 'Open this URL when the user needs to inspect or edit canvas surfaces.',
    }),
    runtimeSurfaceLink({
      title: 'MovScript editing',
      surface: 'editing',
      route: '/editing',
      url: editing,
      usage: 'Open this URL when the user needs to inspect or edit media editing projects.',
    }),
    runtimeSurfaceLink({
      title: 'MovScript local admin',
      surface: 'admin.overview',
      route: '/admin/overview',
      url: admin,
      usage: 'Open this URL when the user needs local admin/provider/job controls.',
    }),
  ]

  return {
    available: true,
    openable: true,
    reason: 'local_surface_host_ready',
    primary,
    secondary,
    urls: {
      home,
      projectOverview,
      projectContent,
      projectTimeline,
      canvas,
      editing,
      admin,
    },
    startupAllowed,
  }
}

function safeProjectIdFromDir(projectDir: string): string {
  return basename(projectDir) || 'sample-project'
}

function localSurfaceURL(baseURL: string, pathname: string, query: Record<string, string>): string {
  const url = new URL(`${baseURL.replace(/\/+$/, '')}/`)
  const basePath = url.pathname.replace(/\/+$/, '')
  const routePath = pathname.startsWith('/') ? pathname : `/${pathname}`
  url.pathname = `${basePath}${routePath}` || '/'
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

function runtimeFocusQuery(args: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = {}
  setQueryValue(output, 'scopeKind', args.scopeKind ?? args.scope_kind)
  setQueryValue(output, 'scopeRef', args.scopeRef ?? args.scope_ref)
  setQueryValue(output, 'targetKind', args.targetKind ?? args.target_kind)
  setQueryValue(output, 'targetRef', args.targetRef ?? args.target_ref)
  setQueryValue(output, 'timeline_assembly_ref', args.timelineAssemblyRef ?? args.timeline_assembly_ref)
  return output
}

function setQueryValue(output: Record<string, string>, key: string, value: unknown): void {
  const normalized = stringValue(value)
  if (normalized) output[key] = normalized
}

function runtimeSurfaceLink(input: {
  title: string
  surface: string
  route: string
  url: string
  usage: string
}): Record<string, unknown> {
  return {
    kind: 'browser_url',
    title: input.title,
    surface: input.surface,
    route: input.route,
    url: input.url,
    usage: input.usage,
  }
}

function runtimeHomeSummary(snapshot: RuntimeHomeSnapshot): Record<string, unknown> {
  const apps = activeAppRecords(snapshot).map((record) => ({
    applicationId: record.applicationId,
    status: record.status,
    ready: record.ready,
    ...(record.profile ? { profile: record.profile } : {}),
    ...(record.owner ? { owner: record.owner } : {}),
    ...(record.endpoint ? { endpoint: endpointURL(record.endpoint) } : {}),
  }))
  const services = activeServiceRecords(snapshot).map((record) => ({
    serviceName: record.serviceName,
    instanceId: record.instanceId,
    status: record.status,
    ready: record.ready,
    ...(record.profile ? { profile: record.profile } : {}),
    ...(record.ownerApplicationId ? { ownerApplicationId: record.ownerApplicationId } : {}),
    ...(record.endpoint ? { endpoint: endpointURL(record.endpoint) } : {}),
  }))
  const endpoints = activeEndpointRecords(snapshot).map((record) => ({
    ...(record.serviceName ? { serviceName: record.serviceName } : {}),
    ...(record.applicationId ? { applicationId: record.applicationId } : {}),
    status: record.status,
    ready: record.ready,
    ...(endpointURL(record) ? { endpoint: endpointURL(record) } : {}),
  }))
  return {
    homeDir: snapshot.homeDir,
    apps,
    services,
    endpoints,
  }
}

function runtimeOwnerStatus(input: {
  desktopAvailable: boolean
  localDaemonAvailable: boolean
  localAvailable: boolean
  cloudAvailable: boolean
  selected: 'local' | 'cloud' | undefined
}): Record<string, unknown> {
  if (input.localDaemonAvailable) {
    return {
      kind: 'local_daemon',
      applicationId: LOCAL_RUNTIME_DAEMON_APP_ID,
      reason: 'local_runtime_daemon_ready',
      businessSidecarStartupAllowed: false,
      surfaceHostStartupAllowed: false,
      sidecarStartupAllowed: false,
    }
  }
  if (input.desktopAvailable) {
    return {
      kind: 'desktop_legacy_owner',
      applicationId: 'movscript.desktop',
      reason: 'desktop_full_runtime_ready_without_local_daemon',
      businessSidecarStartupAllowed: false,
      surfaceHostStartupAllowed: false,
      sidecarStartupAllowed: false,
    }
  }
  if (input.selected === 'cloud' && input.cloudAvailable) {
    return {
      kind: 'cloud',
      reason: 'cloud_backend_ready',
      businessSidecarStartupAllowed: false,
      surfaceHostStartupAllowed: false,
      sidecarStartupAllowed: false,
    }
  }
  if (input.selected === 'local' && input.localAvailable) {
    return {
      kind: 'external_local',
      reason: 'local_backend_ready_without_desktop',
      businessSidecarStartupAllowed: true,
      surfaceHostStartupAllowed: true,
      sidecarStartupAllowed: true,
    }
  }
  return {
    kind: 'none',
    reason: 'no_ready_runtime',
    businessSidecarStartupAllowed: true,
    surfaceHostStartupAllowed: true,
    sidecarStartupAllowed: true,
  }
}

function findCloudAuth(workspaceDir: string): { authenticated: boolean; baseURL?: string } {
  try {
    const paths = resolveMovScriptBackendPaths(workspaceDir)
    const cloudRoot = resolve(paths.backendRealmsDir, 'cloud')
    if (!existsSync(cloudRoot)) return { authenticated: false }
    for (const realmId of readdirSync(cloudRoot)) {
      const authPath = resolve(cloudRoot, realmId, 'auth.json')
      const auth = readJSON(authPath)
      if (isRecord(auth) && stringValue(auth.token)) return { authenticated: true }
    }
  } catch {
    // Status must remain best-effort.
  }
  return { authenticated: false }
}

function selectedBackendMode(input: {
  configuredIsLocal: boolean
  localAvailable: boolean
  cloudAvailable: boolean
  projectAvailable: boolean
}): 'local' | 'cloud' | undefined {
  if (input.localAvailable && input.cloudAvailable) return input.configuredIsLocal ? 'local' : 'cloud'
  if (input.localAvailable) return 'local'
  if (input.cloudAvailable) return 'cloud'
  return undefined
}

function shouldRequireUserChoice(input: {
  localAvailable: boolean
  cloudAvailable: boolean
  projectAvailable: boolean
}): boolean {
  return (input.localAvailable && input.cloudAvailable && input.projectAvailable)
    || (input.localAvailable && !input.projectAvailable)
    || (input.cloudAvailable && !input.projectAvailable)
}

function missingItems(input: {
  localAvailable: boolean
  cloudAvailable: boolean
  projectAvailable: boolean
}): string[] {
  const missing: string[] = []
  if (!input.localAvailable && !input.cloudAvailable) missing.push('backend')
  if (!input.projectAvailable) missing.push('project_source')
  return missing
}

function recommendedMode(selected: 'local' | 'cloud' | undefined, hasProject: boolean): string | undefined {
  if (selected === 'local' && hasProject) return 'local_backend_local_source'
  if (selected === 'cloud' && hasProject) return 'cloud_backend_local_source'
  if (selected === 'cloud') return 'cloud_backend_cloud_source'
  return undefined
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

function bindWorkspaceRuntime(args: Record<string, unknown>): { backendEndpoint?: string; projectServiceEndpoint?: string; restore?: () => void } {
  const backendBinding = bindBackendRuntime(args)
  const projectServiceEndpoint = workspaceProjectServiceEndpoint(args)
  if (!projectServiceEndpoint) return backendBinding

  const previousURL = process.env.MOVSCRIPT_PROJECT_SERVICE_URL
  process.env.MOVSCRIPT_PROJECT_SERVICE_URL = projectServiceEndpoint
  return {
    ...backendBinding,
    projectServiceEndpoint,
    restore: () => restoreOptionalEnv('MOVSCRIPT_PROJECT_SERVICE_URL', previousURL),
  }
}

function bindEditingRuntime(args: Record<string, unknown>): { backendEndpoint?: string; editingServiceEndpoint?: string; restore?: () => void } {
  const backendBinding = bindBackendRuntime(args)
  const editingServiceEndpoint = editingServiceEndpointFromRuntime(args)
  if (!editingServiceEndpoint) return backendBinding

  const previousURL = process.env.MOVSCRIPT_EDITING_SERVICE_URL
  process.env.MOVSCRIPT_EDITING_SERVICE_URL = editingServiceEndpoint
  return {
    ...backendBinding,
    editingServiceEndpoint,
    restore: () => restoreOptionalEnv('MOVSCRIPT_EDITING_SERVICE_URL', previousURL),
  }
}

function workspaceRunArgs(spec: WorkspaceCommandSpec, args: Record<string, unknown>): Record<string, unknown> {
  if (spec.commandId !== 'workspace.get_model') return args
  if (hasWorkspaceProjectLocator(args)) return args
  return { ...args, cwd: process.cwd() }
}

function hasWorkspaceProjectLocator(args: Record<string, unknown>): boolean {
  return Boolean(stringValue(args.projectDir ?? args.project_dir ?? args.projectPath ?? args.project_path ?? args.cwd))
}

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

function runtimeDebugCliArgv(spec: RuntimeCommandSpec, args: Record<string, unknown>): string[] {
  const argv = spec.productCliPath
    ? ['movscript', ...spec.productCliPath, '--json']
    : ['movscript', 'runtime', ...spec.cliPath, '--json']
  const homeDir = stringValue(args.homeDir ?? args.home_dir ?? args.movscriptHome ?? args.movscript_home)
  if (homeDir) argv.push('--home-dir', homeDir)
  const workspaceDir = stringValue(args.workspaceDir ?? args.workspace_dir)
  if (workspaceDir) argv.push('--workspace', workspaceDir)
  const projectDir = stringValue(args.projectDir ?? args.project_dir)
  if (projectDir) argv.push('--project-dir', projectDir)
  const cwd = stringValue(args.cwd)
  if (cwd) argv.push('--cwd', cwd)
  appendPathArg(argv, args, ['timeoutMs', 'timeout_ms'], '--timeout-ms')
  appendPathArg(argv, args, ['entrypoint', 'entry_point'], '--entrypoint')
  appendPathArg(argv, args, ['dataPlane', 'data_plane'], '--data-plane')
  appendPathArg(argv, args, ['dataServiceURL', 'data_service_url'], '--data-service-url')
  appendPathArg(argv, args, ['idleTimeout', 'idle_timeout'], '--idle-timeout')
  appendPathArg(argv, args, ['startupTimeoutMs', 'startup_timeout_ms'], '--startup-timeout-ms')
  appendPathArg(argv, args, ['stopTimeoutMs', 'stop_timeout_ms'], '--stop-timeout-ms')
  appendPathArg(argv, args, ['backendMode', 'backend_mode'], '--backend-mode')
  appendPathArg(argv, args, ['backendBaseURL', 'backend_base_url'], '--backend-base-url')
  appendPathArg(argv, args, ['projectId', 'project_id'], '--project-id')
  appendPathArg(argv, args, ['productionId', 'production_id'], '--production-id')
  appendPathArg(argv, args, ['scopeKind', 'scope_kind'], '--scope-kind')
  appendPathArg(argv, args, ['scopeRef', 'scope_ref'], '--scope-ref')
  appendPathArg(argv, args, ['targetKind', 'target_kind'], '--target-kind')
  appendPathArg(argv, args, ['targetRef', 'target_ref'], '--target-ref')
  appendPathArg(argv, args, ['timelineAssemblyRef', 'timeline_assembly_ref'], '--timeline-assembly-ref')
  appendPathArg(argv, args, ['localBackendURL', 'local_backend_url'], '--local-backend-url')
  if (args.token !== undefined) argv.push('--token', '<redacted>')
  if (args.remember === true) argv.push('--remember')
  if (args.clearToken === true || args.clear_token === true) argv.push('--clear-token')
  if (args.forceRestart === true || args.force_restart === true) argv.push('--force-restart')
  if (args.requireProject === false || args.require_project === false) argv.push('--no-require-project')
  else if (args.requireProject === true || args.require_project === true) argv.push('--require-project')
  return argv
}

function contextDebugCliArgv(spec: ContextCommandSpec, args: Record<string, unknown>): string[] {
  const argv = ['movscript', 'context', ...spec.cliPath, '--json']
  appendRuntimeArgv(argv, args)
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

function editingDebugCliArgv(spec: EditingCommandSpec, args: Record<string, unknown>): string[] {
  const argv = ['movscript', 'editing', ...spec.cliPath, '--json']
  appendRuntimeArgv(argv, args)
  appendPathArg(argv, args, ['editingServiceURL', 'editing_service_url'], '--editing-service-url')
  appendJSONArg(argv, args, ['editingProject', 'editing_project', 'project'], '--editing-project')
  appendPathArg(argv, args, ['editingProjectId', 'editing_project_id'], '--editing-project-id')
  appendPathArg(argv, args, ['projectId', 'project_id'], '--project-id')
  appendPathArg(argv, args, ['taskId', 'task_id'], '--task-id')
  appendPathArg(argv, args, ['title'], '--title')
  appendPathArg(argv, args, ['name'], '--name')
  appendPathArg(argv, args, ['outputPath', 'output_path'], '--output-path')
  appendPathArg(argv, args, ['savePath', 'save_path'], '--save-path')
  appendPathArg(argv, args, ['saveDirectory', 'save_directory'], '--save-directory')
  appendPathArg(argv, args, ['hlsDirectory', 'hls_directory'], '--hls-directory')
  appendPathArg(argv, args, ['manifestPath', 'manifest_path'], '--manifest-path')
  appendPathArg(argv, args, ['filename'], '--filename')
  appendPathArg(argv, args, ['mimeType', 'mime_type'], '--mime-type')
  appendPathArg(argv, args, ['folderId', 'folder_id'], '--folder-id')
  appendPathArg(argv, args, ['sourceResourceId', 'source_resource_id'], '--source-resource-id')
  appendPathArg(argv, args, ['sourceDerivativeId', 'source_derivative_id'], '--source-derivative-id')
  appendPathArg(argv, args, ['contentUnitId', 'content_unit_id'], '--content-unit-id')
  appendPathArg(argv, args, ['resourceId', 'resource_id'], '--resource-id')
  appendPathArg(argv, args, ['streamId', 'stream_id'], '--stream-id')
  appendPathArg(argv, args, ['candidateId', 'candidate_id'], '--candidate-id')
  appendPathArg(argv, args, ['outputKind', 'output_kind'], '--output-kind')
  appendPathArg(argv, args, ['kind'], '--kind')
  appendPathArg(argv, args, ['status'], '--status')
  appendPathArg(argv, args, ['width'], '--width')
  appendPathArg(argv, args, ['height'], '--height')
  appendPathArg(argv, args, ['fps'], '--fps')
  appendPathArg(argv, args, ['background'], '--background')
  appendPathArg(argv, args, ['defaultDurationMs', 'default_duration_ms'], '--default-duration-ms')
  appendPathArg(argv, args, ['productionId', 'production_id'], '--production-id')
  appendPathArg(argv, args, ['productionPath', 'production_path'], '--production-path')
  appendPathArg(argv, args, ['targetKind', 'target_kind'], '--target-kind')
  appendPathArg(argv, args, ['targetRef', 'target_ref'], '--target-ref')
  appendPathArg(argv, args, ['scopeKind', 'scope_kind'], '--scope-kind')
  appendPathArg(argv, args, ['scopeRef', 'scope_ref'], '--scope-ref')
  appendPathArg(argv, args, ['assetId', 'asset_id'], '--asset-id')
  appendPathArg(argv, args, ['assetType', 'asset_type'], '--asset-type')
  appendPathArg(argv, args, ['trackId', 'track_id'], '--track-id')
  appendPathArg(argv, args, ['trackType', 'track_type'], '--track-type')
  appendPathArg(argv, args, ['clipId', 'clip_id'], '--clip-id')
  appendPathArg(argv, args, ['targetTrackId', 'target_track_id'], '--target-track-id')
  appendPathArg(argv, args, ['timelineStartMs', 'timeline_start_ms'], '--timeline-start-ms')
  appendPathArg(argv, args, ['durationMs', 'duration_ms'], '--duration-ms')
  appendPathArg(argv, args, ['splitTimeMs', 'split_time_ms'], '--split-time-ms')
  appendPathArg(argv, args, ['retainSide', 'retain_side'], '--retain-side')
  appendPathArg(argv, args, ['zIndex', 'z_index'], '--z-index')
  appendPathArg(argv, args, ['expectedRevision', 'expected_revision'], '--expected-revision')
  appendPathArg(argv, args, ['renderRuntime', 'render_runtime'], '--render-runtime')
  appendPathArg(argv, args, ['format'], '--format')
  appendPathArg(argv, args, ['target'], '--target')
  appendPathArg(argv, args, ['mode'], '--mode')
  appendPathArg(argv, args, ['operation'], '--operation')
  appendPathArg(argv, args, ['tool'], '--tool')
  appendPathArg(argv, args, ['durationSec', 'duration_sec'], '--duration-sec')
  appendJSONArg(argv, args, ['editPlan', 'edit_plan'], '--edit-plan')
  appendJSONArg(argv, args, ['editDecisions', 'edit_decisions'], '--edit-decisions')
  appendJSONArg(argv, args, ['assetManifest', 'asset_manifest'], '--asset-manifest')
  appendJSONArg(argv, args, ['source'], '--source')
  appendJSONArg(argv, args, ['output'], '--output')
  appendJSONArg(argv, args, ['asset'], '--asset')
  appendJSONArg(argv, args, ['track'], '--track')
  appendJSONArg(argv, args, ['clip'], '--clip')
  appendJSONArg(argv, args, ['patch'], '--patch')
  appendJSONArg(argv, args, ['commands'], '--commands')
  appendJSONArg(argv, args, ['command'], '--command')
  appendJSONArg(argv, args, ['workspace'], '--workspace-binding')
  appendJSONArg(argv, args, ['segmentPaths', 'segment_paths'], '--segment-paths')
  appendJSONArg(argv, args, ['inputResourceIds', 'input_resource_ids'], '--input-resource-ids')
  appendJSONArg(argv, args, ['sourceResourceIds', 'source_resource_ids'], '--source-resource-ids')
  appendJSONArg(argv, args, ['derivative'], '--derivative')
  appendJSONArg(argv, args, ['params'], '--params')
  appendJSONArg(argv, args, ['producer'], '--producer')
  appendJSONArg(argv, args, ['provenance'], '--provenance')
  appendJSONArg(argv, args, ['promptSnapshot', 'prompt_snapshot'], '--prompt-snapshot')
  appendJSONArg(argv, args, ['timelineAssembly', 'timeline_assembly'], '--timeline-assembly')
  appendJSONArg(argv, args, ['compileManifest', 'compile_manifest'], '--compile-manifest')
  if (args.importToResource === true || args.import_to_resource === true) argv.push('--import-to-resource')
  return argv
}

function timelineDebugCliArgv(spec: TimelineCommandSpec, args: Record<string, unknown>): string[] {
  const argv = ['movscript', 'timeline', ...spec.cliPath, '--json']
  appendRuntimeArgv(argv, args)
  appendPathArg(argv, args, ['backend'], '--backend')
  appendPathArg(argv, args, ['preferred_backend', 'preferredBackend'], '--preferred-backend')
  appendPathArg(argv, args, ['render_runtime', 'renderRuntime'], '--render-runtime')
  appendPathArg(argv, args, ['title'], '--title')
  appendPathArg(argv, args, ['finishing_project_id', 'finishingProjectId'], '--finishing-project-id')
  appendPathArg(argv, args, ['target_ref', 'targetRef'], '--target-ref')
  appendPathArg(argv, args, ['scope_kind', 'scopeKind'], '--scope-kind')
  appendPathArg(argv, args, ['scope_ref', 'scopeRef'], '--scope-ref')
  appendPathArg(argv, args, ['width'], '--width')
  appendPathArg(argv, args, ['height'], '--height')
  appendPathArg(argv, args, ['fps'], '--fps')
  appendPathArg(argv, args, ['background'], '--background')
  appendPathArg(argv, args, ['default_duration_ms', 'defaultDurationMs'], '--default-duration-ms')
  appendJSONArg(argv, args, ['timeline_assembly', 'timelineAssembly'], '--timeline-assembly')
  appendJSONArg(argv, args, ['edit_decisions', 'editDecisions'], '--edit-decisions')
  appendJSONArg(argv, args, ['asset_manifest', 'assetManifest'], '--asset-manifest')
  appendJSONArg(argv, args, ['compile_manifest', 'compileManifest'], '--compile-manifest')
  if (args.runtime_locked === true || args.runtimeLocked === true) argv.push('--runtime-locked')
  return argv
}

function workspaceDebugCliArgv(spec: WorkspaceCommandSpec, args: Record<string, unknown>): string[] {
  const argv = ['movscript', 'workspace', ...spec.cliPath]
  const entityKind = stringValue(args.entityKind ?? args.entity_kind)
  if (spec.commandId === 'workspace.get_model' && entityKind) argv.push(entityKind)
  argv.push('--json')
  const server = stringValue(args.backendBaseURL ?? args.backend_base_url ?? args.server ?? args.projectServiceURL ?? args.project_service_url)
  if (server) argv.push('--server', server)
  const workspaceDir = stringValue(args.workspaceDir ?? args.workspace_dir)
  if (workspaceDir) argv.push('--workspace', workspaceDir)
  const projectDir = stringValue(args.projectDir ?? args.project_dir ?? args.projectPath ?? args.project_path ?? args.cwd)
  if (projectDir) argv.push('--project-dir', projectDir)
  appendPathArg(argv, args, ['projectUid', 'project_uid'], '--project-uid')
  appendPathArg(argv, args, ['user'], '--user')
  appendPathArg(argv, args, ['org'], '--org')
  appendPathArg(argv, args, ['commit'], '--commit')
  appendPathArg(argv, args, ['entityId', 'entity_id'], '--entity-id')
  return argv
}

function workspaceProjectServiceEndpoint(args: Record<string, unknown>): string | undefined {
  const explicit = stringValue(args.projectServiceURL ?? args.project_service_url ?? args.backendBaseURL ?? args.backend_base_url ?? args.server)
  if (explicit) return explicit

  const homeDir = resolveRuntimeHomeArg(args)
  const runtimeHome = readRuntimeHomeSnapshot(homeDir)
  return endpointURL(
    findRuntimeEndpoint(runtimeHome, PROJECT_SERVICE)
      ?? findRuntimeService(runtimeHome, PROJECT_SERVICE)?.endpoint
      ?? findRuntimeEndpoint(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
      ?? findRuntimeService(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)?.endpoint,
  )
}

function editingServiceEndpointFromRuntime(args: Record<string, unknown>): string | undefined {
  const explicit = stringValue(args.editingServiceURL ?? args.editing_service_url ?? args.backendBaseURL ?? args.backend_base_url ?? args.server)
  if (explicit) return explicit

  const homeDir = resolveRuntimeHomeArg(args)
  const runtimeHome = readRuntimeHomeSnapshot(homeDir)
  return endpointURL(
    findRuntimeEndpoint(runtimeHome, EDITING_SERVICE)
      ?? findRuntimeService(runtimeHome, EDITING_SERVICE)?.endpoint
      ?? findRuntimeEndpoint(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
      ?? findRuntimeService(runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)?.endpoint,
  )
}

function restoreOptionalEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = previous
  }
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

function runtimeReadinessSchema(extra: Record<string, unknown> = {}) {
  return objectSchema({
    homeDir: { type: 'string', description: 'Optional MovScript Home directory. Defaults to MOVSCRIPT_HOME or ~/.movscript.' },
    home_dir: { type: 'string', description: 'Alias for homeDir.' },
    movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
    movscript_home: { type: 'string', description: 'Alias for homeDir.' },
    workspaceDir: { type: 'string', description: 'Optional MovScript workspace or project directory to inspect.' },
    workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
    projectDir: { type: 'string', description: 'Optional project source directory to inspect.' },
    project_dir: { type: 'string', description: 'Alias for projectDir.' },
    projectId: { type: 'string', description: 'Optional project id to use when constructing surface URLs.' },
    project_id: { type: 'string', description: 'Alias for projectId.' },
    productionId: { type: 'string', description: 'Optional legacy production id to include in surface URLs.' },
    production_id: { type: 'string', description: 'Alias for productionId.' },
    scopeKind: { type: 'string', description: 'Optional timeline namespace scope kind.' },
    scope_kind: { type: 'string', description: 'Alias for scopeKind.' },
    scopeRef: { type: 'string', description: 'Optional timeline namespace scope ref.' },
    scope_ref: { type: 'string', description: 'Alias for scopeRef.' },
    targetKind: { type: 'string', description: 'Optional normalized target kind.' },
    target_kind: { type: 'string', description: 'Alias for targetKind.' },
    targetRef: { type: 'string', description: 'Optional normalized target ref.' },
    target_ref: { type: 'string', description: 'Alias for targetRef.' },
    timelineAssemblyRef: { type: 'string', description: 'Optional timeline assembly target ref.' },
    timeline_assembly_ref: { type: 'string', description: 'Alias for timelineAssemblyRef.' },
    localBackendURL: { type: 'string', description: 'Optional local backend URL to probe.' },
    local_backend_url: { type: 'string', description: 'Alias for localBackendURL.' },
    timeoutMs: { type: 'number', description: 'Probe timeout in milliseconds. Defaults to 750.' },
    timeout_ms: { type: 'number', description: 'Alias for timeoutMs.' },
    ...extra,
  })
}

function runtimeConfigureSchema() {
  return objectSchema({
    homeDir: { type: 'string', description: 'Optional MovScript Home directory. Defaults to MOVSCRIPT_HOME or ~/.movscript.' },
    home_dir: { type: 'string', description: 'Alias for homeDir.' },
    movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
    movscript_home: { type: 'string', description: 'Alias for homeDir.' },
    backendMode: { type: 'string', enum: ['local', 'cloud'], description: 'Preferred backend mode.' },
    backend_mode: { type: 'string', enum: ['local', 'cloud'], description: 'Alias for backendMode.' },
    backendBaseURL: { type: 'string', description: 'Backend base URL such as http://localhost:8766 or https://api.example.' },
    backend_base_url: { type: 'string', description: 'Alias for backendBaseURL.' },
    token: { type: 'string', description: 'Bearer token for the selected backend. Prefer environment variables or movcli auth for persistent secrets.' },
    projectDir: { type: 'string', description: 'Project source directory to use as default workspace/project context.' },
    project_dir: { type: 'string', description: 'Alias for projectDir.' },
    workspaceDir: { type: 'string', description: 'Workspace directory to persist backend config under.' },
    workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
    remember: { type: 'boolean', description: 'When true, persist backendBaseURL to .movscript/backend/config.json.' },
    clearToken: { type: 'boolean', description: 'When true, clear persisted workspace auth for the selected workspace.' },
    clear_token: { type: 'boolean', description: 'Alias for clearToken.' },
  })
}

function localDaemonControlSchema() {
  return objectSchema({
    homeDir: { type: 'string', description: 'Optional MovScript Home directory. Defaults to MOVSCRIPT_HOME or ~/.movscript.' },
    home_dir: { type: 'string', description: 'Alias for homeDir.' },
    movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
    movscript_home: { type: 'string', description: 'Alias for homeDir.' },
  })
}

function localDaemonBootstrapSchema() {
  return objectSchema({
    homeDir: { type: 'string', description: 'Optional MovScript Home directory. Defaults to MOVSCRIPT_HOME or ~/.movscript.' },
    home_dir: { type: 'string', description: 'Alias for homeDir.' },
    movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
    movscript_home: { type: 'string', description: 'Alias for homeDir.' },
    entrypoint: { type: 'string', description: 'Optional MovScript CLI entrypoint capable of running daemon run. Defaults to the current process entrypoint.' },
    entry_point: { type: 'string', description: 'Alias for entrypoint.' },
    cwd: { type: 'string', description: 'Optional working directory for the daemon launcher. Defaults to the current working directory.' },
    dataPlane: { type: 'string', enum: ['local', 'cloud', 'external'], description: 'Optional daemon data plane.' },
    data_plane: { type: 'string', enum: ['local', 'cloud', 'external'], description: 'Alias for dataPlane.' },
    dataServiceURL: { type: 'string', description: 'Optional cloud or external Data Service URL.' },
    data_service_url: { type: 'string', description: 'Alias for dataServiceURL.' },
    idleTimeout: { type: 'string', description: 'Optional idle shutdown timeout, for example 30m or never.' },
    idle_timeout: { type: 'string', description: 'Alias for idleTimeout.' },
    startupTimeoutMs: { type: 'number', description: 'Optional daemon startup timeout in milliseconds.' },
    startup_timeout_ms: { type: 'number', description: 'Alias for startupTimeoutMs.' },
    stopTimeoutMs: { type: 'number', description: 'Optional timeout for stopping a stale daemon before restart, in milliseconds.' },
    stop_timeout_ms: { type: 'number', description: 'Alias for stopTimeoutMs.' },
    forceRestart: { type: 'boolean', description: 'When true, restart even if a matching daemon is already ready.' },
    force_restart: { type: 'boolean', description: 'Alias for forceRestart.' },
  })
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

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function readJSON(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

function normalizeBaseURL(value: string): string {
  return value.trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '') || DEFAULT_LOCAL_BACKEND
}

function isLocalBackendURL(value: string): boolean {
  try {
    const url = new URL(value)
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
