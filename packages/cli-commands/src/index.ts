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
  productionEditingTools,
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
  domainAppendCandidate,
  domainBuildContentUnitBackendPrompt,
  domainCertifyAssetProvider,
  domainCreateEditingProjectContext,
  domainCreateAssetSlotCandidate,
  domainCreateContentCandidate,
  domainCreateContentCandidateBatch,
  domainCreateKeyframeCandidate,
  domainGetModel,
  domainInspect,
  domainInterpret,
  domainDecideContentUnitCandidate,
  domainInterpretContentUnitArtifact,
  domainOverview,
  domainProductionStatusSummary,
  domainQueryAssets,
  domainQueryEntities,
  domainQueryProductionContext,
  domainQueryRemoteAssetGroups,
  domainQueryRemoteAssets,
  domainQuerySettings,
  domainRegisterRawResourceAsContentUnitCandidate,
  domainRegenerationPlan,
  domainReview,
  domainReadContentUnitDependencyReport,
  domainReadContentUnitGenerationPrompt,
  domainReadContentUnitRuntimePanel,
  domainReadContentUnitSelectionValidity,
  domainReadContentWorkspace,
  domainReadContentWorkspaceSnapshot,
  domainReadPreviewTimeline,
  domainReadProductionEditPlan,
  domainReadProductionTimeline,
  domainReadProductionWorkPlan,
  domainReadProjectContextSnapshot,
  domainReadSceneMomentEditPlan,
  domainReadSceneMomentTimeline,
  domainReadScriptSource,
  domainSnapshotScriptVersion,
  domainSelectCandidate,
  domainSelectContentUnitCandidate,
  domainSelectContentUnitCandidateBatch,
  domainDeleteEntity,
  domainUnlockCandidate,
  domainUpdateCandidate,
  domainUpdateContentUnitPrompt,
  domainUpdateEntityTransition,
  domainUpdateStoryboardTimeline,
  domainUpsertAsset,
  domainUpsertAudioCue,
  domainUpsertContentUnit,
  domainUpsertExpressionUnit,
  domainUpsertKeyframe,
  domainUpsertProduction,
  domainUpsertProductionTree,
  domainUpsertProjectStandards,
  domainUpsertSceneMoment,
  domainUpsertScript,
  domainUpsertSegment,
  domainUpsertSetting,
  domainUpsertSettingState,
  domainUpsertSettingTree,
  domainUpsertStoryboard,
  domainUpsertTimelineNamespaceTree,
  editingExportCreateCandidate,
  editingExportImportResource,
  editingExportPublishHls,
  editingExportSaveLocal,
  editingExternalNleOpen,
  editingProjectAddAsset,
  editingProjectCreate,
  editingProjectGet,
  editingProjectRemoveAsset,
  editingProjectSave,
  editingProjectUpdateSettings,
  editingResultGet,
  editingResultList,
  editingResultRecoverExternalNle,
  editingResultRegister,
  editingResultWatchCancel,
  editingResultWatchExternalNleCreate,
  editingResultWatchGet,
  editingResultWatchList,
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
  productionEditingResourcesRefresh,
  productionEditingWorkspaceCreate,
  productionEditingWorkspaceDelete,
  productionEditingWorkspaceGet,
  productionEditingWorkspaceList,
  productionEditingWorkspaceOpen,
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
  writeRuntimeEndpointRecord,
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
export type MovScriptCommandFamily = 'runtime' | 'context' | 'admin' | 'system' | 'domain' | 'editing' | 'production-editing' | 'workspace'
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
  productCliPath?: string[]
  description: string
  inputSchema: JSONSchemaObject
  run: (args: Record<string, unknown>) => Promise<unknown>
}

export interface DomainCommandSpec extends MovScriptCommandContract {
  commandId: string
  mcpToolName: string
  mcpAliases?: string[]
  cliPath: string[]
  description: string
  inputSchema: JSONSchemaObject
  run: (args: Record<string, unknown>) => Promise<unknown> | unknown
}

export interface EditingCommandSpec extends MovScriptCommandContract {
  commandId: string
  mcpToolName: string
  cliPath: string[]
  description: string
  inputSchema: JSONSchemaObject
  run: (args: Record<string, unknown>) => Promise<unknown> | unknown
}

export interface ProductionEditingCommandSpec extends MovScriptCommandContract {
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
const RUNTIME_GATEWAY_SERVICE = 'movscript.runtime.gateway'
const CLOUD_RUNTIME_GATEWAY_SERVICE = 'movscript.cloud-runtime.gateway'
const EXTERNAL_RUNTIME_GATEWAY_SERVICE = 'movscript.external-runtime.gateway'
const COMMAND_RUNNER_SERVICE = 'movscript.cli.command-runner'

type CommandContractOverride = Partial<Pick<
  MovScriptCommandContract,
  'stability' | 'ownerService' | 'requiredRuntime' | 'permissions' | 'outputSchema'
>>
type CommandDraft<T extends MovScriptCommandContract> = Omit<T, keyof MovScriptCommandContract> & CommandContractOverride
type AdminCommandDraft = CommandDraft<AdminCommandSpec>
type RuntimeCommandDraft = CommandDraft<RuntimeCommandSpec>
type ContextCommandDraft = CommandDraft<ContextCommandSpec>
type SystemCommandDraft = CommandDraft<SystemCommandSpec>
type DomainCommandDraft = CommandDraft<DomainCommandSpec>
type EditingCommandDraft = CommandDraft<EditingCommandSpec>
type ProductionEditingCommandDraft = CommandDraft<ProductionEditingCommandSpec>
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
    case 'domain':
      return {
        family,
        stability: 'stable',
        ownerService: PROJECT_SERVICE,
        requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, PROJECT_SERVICE],
        permissions: ['project:read', 'project:write', 'candidate:write', 'candidate:decide'],
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
    case 'production-editing':
      return {
        family,
        stability: 'stable',
        ownerService: PROJECT_SERVICE,
        requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, PROJECT_SERVICE],
        permissions: ['project:read', 'project:write'],
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
    const stability = overrides.stability ?? defaults.stability
    return {
      ...command,
      family: defaults.family,
      stability,
      ownerService: overrides.ownerService ?? defaults.ownerService,
      outputSchema: cloneJSONSchema(overrides.outputSchema ?? defaults.outputSchema),
      requiredRuntime: [...(overrides.requiredRuntime ?? defaults.requiredRuntime)],
      permissions: [...(overrides.permissions ?? defaults.permissions)],
      examples: [{
        description: stability === 'temporary_fallback'
          ? `Run ${command.commandId} through the migration-only temporary MovScript CLI fallback contract.`
          : `Run ${command.commandId} through the stable MovScript CLI contract.`,
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
    : family === 'production-editing'
      ? ['movscript', 'production', 'editing', ...command.cliPath]
    : ['movscript', family, ...command.cliPath]
  if (command.commandId === 'workspace.get_model') argv.push('project')
  if (command.commandId === 'domain.get_model') argv.push('--entity-kind', 'project')
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
    commandId: 'runtime.doctor',
    mcpToolName: 'runtime_doctor',
    mcpAliases: ['movscript_runtime_doctor'],
    cliPath: ['doctor'],
    productCliPath: ['doctor'],
    description: 'Runtime: run the top-level MovScript CLI doctor for daemon, backend, project, surface, and media readiness.',
    inputSchema: runtimeReadinessSchema({
      requireProject: { type: 'boolean', description: 'When false, do not treat a missing project source as a blocker.' },
      require_project: { type: 'boolean', description: 'Alias for requireProject.' },
    }),
    run: runtimeDoctor,
  },
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
    commandId: 'runtime.gateway.configure',
    mcpToolName: 'runtime_gateway_configure',
    cliPath: ['gateway', 'configure'],
    description: 'Runtime gateway: register a daemon/cloud/external gateway endpoint in MovScript Home.',
    inputSchema: runtimeGatewayConfigureSchema(),
    ownerService: RUNTIME_GATEWAY_SERVICE,
    requiredRuntime: [COMMAND_RUNNER_SERVICE],
    permissions: ['runtime:read', 'runtime:configure'],
    run: runtimeGatewayConfigure,
  },
  {
    commandId: 'runtime.gateway.status',
    mcpToolName: 'runtime_gateway_status',
    cliPath: ['gateway', 'status'],
    description: 'Runtime gateway: read configured daemon/cloud/external runtime gateway endpoint records.',
    inputSchema: localDaemonControlSchema(),
    ownerService: RUNTIME_GATEWAY_SERVICE,
    requiredRuntime: [COMMAND_RUNNER_SERVICE],
    permissions: ['runtime:read'],
    run: runtimeGatewayStatus,
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
    commandId: 'admin.provider.connection_test',
    mcpToolName: 'admin_provider_connection_test',
    cliPath: ['provider', 'connection-test'],
    description: 'Admin-only: test a provider instance connection and return sanitized diagnostics without exposing secrets.',
    method: 'POST',
    inputSchema: adminProviderInstanceSchema(),
    path: (args) => `/admin/provider-instances/${adminRequiredPathArg(args, ['providerInstanceID', 'providerInstanceId', 'provider_instance_id', 'id'])}/test`,
  },
  {
    commandId: 'admin.provider_instance.config.get',
    mcpToolName: 'admin_provider_instance_config_get',
    cliPath: ['provider', 'instance', 'config', 'get'],
    description: 'Admin-only: read a provider instance configuration draft with secrets masked.',
    method: 'GET',
    inputSchema: adminProviderInstanceSchema(),
    path: (args) => `/admin/provider-instances/${adminRequiredPathArg(args, ['providerInstanceID', 'providerInstanceId', 'provider_instance_id', 'id'])}/config`,
  },
  {
    commandId: 'admin.provider_instance.config.update',
    mcpToolName: 'admin_provider_instance_config_update',
    cliPath: ['provider', 'instance', 'config', 'update'],
    description: 'Admin-only: update a provider instance configuration draft; backend validation, audit, and secret masking remain in Data Service.',
    method: 'PUT',
    inputSchema: adminProviderInstanceSchema(true),
    path: (args) => `/admin/provider-instances/${adminRequiredPathArg(args, ['providerInstanceID', 'providerInstanceId', 'provider_instance_id', 'id'])}/config`,
  },
  {
    commandId: 'admin.provider_instance.config.apply',
    mcpToolName: 'admin_provider_instance_config_apply',
    cliPath: ['provider', 'instance', 'config', 'apply'],
    description: 'Admin-only: apply a provider instance configuration draft to the configured runtime target without exposing secrets.',
    method: 'POST',
    inputSchema: adminProviderInstanceSchema(),
    path: (args) => `/admin/provider-instances/${adminRequiredPathArg(args, ['providerInstanceID', 'providerInstanceId', 'provider_instance_id', 'id'])}/config/apply`,
  },
  {
    commandId: 'admin.provider_instance.config.activate',
    mcpToolName: 'admin_provider_instance_config_activate',
    cliPath: ['provider', 'instance', 'config', 'activate'],
    description: 'Admin-only: activate an applied provider instance configuration through the backend deployment plan.',
    method: 'POST',
    inputSchema: adminProviderInstanceSchema(),
    path: (args) => `/admin/provider-instances/${adminRequiredPathArg(args, ['providerInstanceID', 'providerInstanceId', 'provider_instance_id', 'id'])}/config/activate`,
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
    commandId: 'admin.generation_tools.call_test',
    mcpToolName: 'admin_generation_tool_call_test',
    cliPath: ['generation-tools', 'call-test'],
    description: 'Admin-only: call a configured generation tool server through the fixed runtime proxy and return sanitized diagnostics.',
    method: 'POST',
    inputSchema: adminGenerationToolCallSchema(),
    path: () => '/generation-tools/call',
    payload: adminGenerationToolCallPayload,
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
    commandId: 'admin.resource_access.profile.list',
    mcpToolName: 'admin_resource_access_profile_list',
    cliPath: ['resource-access', 'profile', 'list'],
    description: 'Admin-only: list ResourceAccessProfile entries for public tunnel, public backend, and object relay configuration.',
    method: 'GET',
    inputSchema: adminReadSchema(),
    path: () => '/admin/settings/resource-access/profiles',
  },
  {
    commandId: 'admin.resource_access.profile.upsert',
    mcpToolName: 'admin_resource_access_profile_upsert',
    cliPath: ['resource-access', 'profile', 'upsert'],
    description: 'Admin-only: create or update one ResourceAccessProfile through the backend fixed endpoint.',
    method: 'PUT',
    inputSchema: adminResourceAccessProfileSchema(true),
    path: (args) => `/admin/settings/resource-access/profiles/${adminRequiredPathArg(args, ['profileID', 'profileId', 'profile_id', 'id'])}`,
  },
  {
    commandId: 'admin.resource_access.profile.delete',
    mcpToolName: 'admin_resource_access_profile_delete',
    cliPath: ['resource-access', 'profile', 'delete'],
    description: 'Admin-only: delete one ResourceAccessProfile through the backend fixed endpoint.',
    method: 'DELETE',
    inputSchema: adminResourceAccessProfileSchema(false),
    path: (args) => `/admin/settings/resource-access/profiles/${adminRequiredPathArg(args, ['profileID', 'profileId', 'profile_id', 'id'])}`,
  },
  {
    commandId: 'admin.resource_access.profile.test',
    mcpToolName: 'admin_resource_access_profile_test',
    cliPath: ['resource-access', 'profile', 'test'],
    description: 'Admin-only: test a ResourceAccessProfile public health endpoint without exposing secrets.',
    method: 'POST',
    inputSchema: adminResourceAccessProfileSchema(false),
    path: (args) => `/admin/settings/resource-access/profiles/${adminRequiredPathArg(args, ['profileID', 'profileId', 'profile_id', 'id'])}/test`,
  },
  {
    commandId: 'admin.resource_access.route_diagnose',
    mcpToolName: 'admin_resource_access_route_diagnose',
    cliPath: ['resource-access', 'route', 'diagnose'],
    description: 'Admin-only: diagnose resource access route/profile readiness for public URL transport.',
    method: 'POST',
    inputSchema: adminResourceAccessRouteDiagnoseSchema(),
    path: () => '/admin/settings/resource-access/routes/diagnose',
    payload: adminResourceAccessRouteDiagnosePayload,
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
    commandId: 'admin.cloud_file_config.list',
    mcpToolName: 'admin_cloud_file_config_list',
    cliPath: ['cloud-file-config', 'list'],
    description: 'Admin-only: list object relay and cloud file storage configurations.',
    method: 'GET',
    inputSchema: adminReadSchema(),
    path: () => '/admin/cloud-file-configs',
  },
  {
    commandId: 'admin.cloud_file_config.create',
    mcpToolName: 'admin_cloud_file_config_create',
    cliPath: ['cloud-file-config', 'create'],
    description: 'Admin-only: create an object relay or cloud file storage configuration.',
    method: 'POST',
    inputSchema: adminWriteSchema(),
    path: () => '/admin/cloud-file-configs',
  },
  {
    commandId: 'admin.cloud_file_config.update',
    mcpToolName: 'admin_cloud_file_config_update',
    cliPath: ['cloud-file-config', 'update'],
    description: 'Admin-only: update an object relay or cloud file storage configuration.',
    method: 'PUT',
    inputSchema: adminCloudFileConfigSchema(true),
    path: (args) => `/admin/cloud-file-configs/${adminRequiredPathArg(args, ['cloudFileConfigID', 'cloudFileConfigId', 'cloud_file_config_id', 'id'])}`,
  },
  {
    commandId: 'admin.cloud_file_config.test',
    mcpToolName: 'admin_cloud_file_config_test',
    cliPath: ['cloud-file-config', 'test'],
    description: 'Admin-only: test an object relay or cloud file storage configuration without exposing secrets.',
    method: 'POST',
    inputSchema: adminCloudFileConfigSchema(false),
    path: (args) => `/admin/cloud-file-configs/${adminRequiredPathArg(args, ['cloudFileConfigID', 'cloudFileConfigId', 'cloud_file_config_id', 'id'])}/test`,
  },
  {
    commandId: 'admin.cloud_file_config.delete',
    mcpToolName: 'admin_cloud_file_config_delete',
    cliPath: ['cloud-file-config', 'delete'],
    description: 'Admin-only: delete an object relay or cloud file storage configuration.',
    method: 'DELETE',
    inputSchema: adminCloudFileConfigSchema(false),
    path: (args) => `/admin/cloud-file-configs/${adminRequiredPathArg(args, ['cloudFileConfigID', 'cloudFileConfigId', 'cloud_file_config_id', 'id'])}`,
  },
  {
    commandId: 'admin.usage_policy.get',
    mcpToolName: 'admin_usage_policy_get',
    cliPath: ['usage-policy', 'get'],
    description: 'Admin-only: read usage governance policy settings for model gateway and generation usage.',
    method: 'GET',
    inputSchema: adminReadSchema(),
    path: () => '/admin/settings/usage-policy',
  },
  {
    commandId: 'admin.usage_policy.update',
    mcpToolName: 'admin_usage_policy_update',
    cliPath: ['usage-policy', 'update'],
    description: 'Admin-only: update usage governance policy settings for model gateway and generation usage.',
    method: 'PUT',
    inputSchema: adminWriteSchema(),
    path: () => '/admin/settings/usage-policy',
  },
  {
    commandId: 'admin.usage_policy.diagnose',
    mcpToolName: 'admin_usage_policy_diagnose',
    cliPath: ['usage-policy', 'diagnose'],
    description: 'Admin-only: diagnose usage policy configuration, limits, and runtime enforcement readiness.',
    method: 'GET',
    inputSchema: adminReadSchema(),
    path: () => '/admin/settings/usage-policy/diagnose',
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
    commandId: 'system.production.workflow',
    mcpToolName: 'system_production_workflow',
    cliPath: ['production', 'workflow'],
    productCliPath: ['production', 'workflow'],
    description: 'System: describe the CLI-only MovScript production workflow, review gates, blockers, and command handoffs.',
    ownerService: COMMAND_RUNNER_SERVICE,
    requiredRuntime: [COMMAND_RUNNER_SERVICE],
    permissions: ['system:read'],
    inputSchema: objectSchema({}),
    run: async () => productionWorkflowContract(),
  },
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
    productCliPath: ['project', 'create'],
    ownerService: PROJECT_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, PROJECT_SERVICE],
    permissions: ['project:read', 'project:write'],
    description: 'System: create a formal MovScript backend project after explicit user intent.',
    inputSchema: toolInputSchema(projectTools(), 'movscript_project_create'),
    run: createProject,
  },
  {
    commandId: 'system.project.init',
    mcpToolName: 'system_project_init',
    mcpAliases: ['movscript_project_init'],
    cliPath: ['project', 'init'],
    productCliPath: ['project', 'init'],
    ownerService: PROJECT_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, PROJECT_SERVICE],
    permissions: ['project:read', 'project:write'],
    description: 'System: initialize a local MovScript project and bind it to backend project data.',
    inputSchema: toolInputSchema(projectTools(), 'movscript_project_init'),
    run: initLocalProject,
  },
  {
    commandId: 'system.project.open',
    mcpToolName: 'system_project_open',
    mcpAliases: ['movscript_project_open'],
    cliPath: ['project', 'open'],
    productCliPath: ['project', 'open'],
    ownerService: PROJECT_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, PROJECT_SERVICE],
    permissions: ['project:read', 'project:interpret'],
    description: 'System: open a local MovScript project and bind it to backend project data when metadata exists.',
    inputSchema: toolInputSchema(projectTools(), 'movscript_project_open'),
    run: fetchLocalProject,
  },
  {
    commandId: 'system.project.fetch',
    mcpToolName: 'system_project_fetch',
    mcpAliases: ['movscript_project_fetch'],
    cliPath: ['project', 'fetch'],
    productCliPath: ['project', 'fetch'],
    ownerService: PROJECT_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, PROJECT_SERVICE],
    permissions: ['project:read', 'project:interpret'],
    description: 'System: compatibility alias for opening a local MovScript project.',
    inputSchema: toolInputSchema(projectTools(), 'movscript_project_fetch'),
    run: fetchLocalProject,
  },
  {
    commandId: 'system.resource.library.query',
    mcpToolName: 'system_resource_library_query',
    mcpAliases: ['movscript_resource_library_query'],
    cliPath: ['resource', 'library', 'query'],
    productCliPath: ['resource', 'library', 'query'],
    description: 'System: query MovScript RawResources from the internal resource library.',
    inputSchema: toolInputSchema(resourceLibraryTools(), 'movscript_resource_library_query'),
    run: queryResourceLibrary,
  },
  {
    commandId: 'system.resource.library.open',
    mcpToolName: 'system_resource_library_open',
    mcpAliases: ['movscript_resource_library_open'],
    cliPath: ['resource', 'library', 'open'],
    productCliPath: ['resource', 'library', 'open'],
    description: 'System: return an agent-openable surface URL for the MovScript resource library.',
    inputSchema: toolInputSchema(resourceLibraryTools(), 'movscript_resource_library_open'),
    run: async (args) => openResourceLibrary(args),
  },
  {
    commandId: 'system.artifact.upload_export',
    mcpToolName: 'system_artifact_upload_export',
    cliPath: ['artifact', 'upload-export'],
    productCliPath: ['artifact', 'upload-export'],
    description: 'System: upload a completed local export artifact as a neutral RawResource.',
    inputSchema: toolInputSchema(artifactTools(), 'system_artifact_upload_export'),
    run: artifactUploadExport,
  },
  {
    commandId: 'system.artifact.upload_hls_stream',
    mcpToolName: 'system_artifact_upload_hls_stream',
    cliPath: ['artifact', 'upload-hls-stream'],
    productCliPath: ['artifact', 'upload-hls-stream'],
    description: 'System: upload completed HLS manifest and segments as a neutral MediaStreamArtifact.',
    inputSchema: toolInputSchema(artifactTools(), 'system_artifact_upload_hls_stream'),
    run: artifactUploadHlsStream,
  },
  {
    commandId: 'system.artifact.get_stream',
    mcpToolName: 'system_artifact_get_stream',
    cliPath: ['artifact', 'get-stream'],
    productCliPath: ['artifact', 'get-stream'],
    description: 'System: read MediaStreamArtifact metadata and playback URLs from backend hosting.',
    inputSchema: toolInputSchema(artifactTools(), 'system_artifact_get_stream'),
    run: artifactGetStream,
  },
  {
    commandId: 'system.resource.image.read',
    mcpToolName: 'system_resource_image_read',
    mcpAliases: ['movscript_resource_image_read'],
    cliPath: ['resource', 'image', 'read'],
    productCliPath: ['resource', 'image', 'read'],
    description: 'System: read a MovScript image RawResource for agent vision.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_image_read'),
    run: readResourceImageForVision,
  },
  {
    commandId: 'system.resource.image.transform_to_resource',
    mcpToolName: 'system_resource_image_transform_to_resource',
    mcpAliases: ['movscript_resource_image_transform_to_resource'],
    cliPath: ['resource', 'image', 'transform-to-resource'],
    productCliPath: ['resource', 'image', 'transform-to-resource'],
    description: 'System: transform a MovScript image RawResource and upload the result as a RawResource.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_image_transform_to_resource'),
    run: transformResourceImageToResource,
  },
  {
    commandId: 'system.resource.image.annotate',
    mcpToolName: 'system_resource_image_annotate',
    mcpAliases: ['movscript_resource_image_annotate'],
    cliPath: ['resource', 'image', 'annotate'],
    productCliPath: ['resource', 'image', 'annotate'],
    description: 'System: create a local annotated image artifact for agent guidance.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_image_annotate'),
    run: annotateResourceImage,
  },
  {
    commandId: 'system.resource.video.extract_frames',
    mcpToolName: 'system_resource_video_extract_frames',
    mcpAliases: ['movscript_resource_video_extract_frames'],
    cliPath: ['resource', 'video', 'extract-frames'],
    productCliPath: ['resource', 'video', 'extract-frames'],
    description: 'System: extract representative video frames for agent vision.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_extract_frames'),
    run: extractResourceVideoFramesForVision,
  },
  {
    commandId: 'system.resource.video.probe',
    mcpToolName: 'system_resource_video_probe',
    mcpAliases: ['movscript_resource_video_probe'],
    cliPath: ['resource', 'video', 'probe'],
    productCliPath: ['resource', 'video', 'probe'],
    description: 'System: probe a MovScript video RawResource and return media metadata.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_probe'),
    run: probeResourceVideo,
  },
  {
    commandId: 'system.resource.video.extract_frame_to_resource',
    mcpToolName: 'system_resource_video_extract_frame_to_resource',
    mcpAliases: ['movscript_resource_video_extract_frame_to_resource'],
    cliPath: ['resource', 'video', 'extract-frame-to-resource'],
    productCliPath: ['resource', 'video', 'extract-frame-to-resource'],
    description: 'System: extract one video frame and upload it as an image RawResource.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_extract_frame_to_resource'),
    run: extractResourceVideoFrameToResource,
  },
  {
    commandId: 'system.resource.video.extract_frames_to_resources',
    mcpToolName: 'system_resource_video_extract_frames_to_resources',
    mcpAliases: ['movscript_resource_video_extract_frames_to_resources'],
    cliPath: ['resource', 'video', 'extract-frames-to-resources'],
    productCliPath: ['resource', 'video', 'extract-frames-to-resources'],
    description: 'System: extract multiple video frames and upload them as image RawResources.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_extract_frames_to_resources'),
    run: extractResourceVideoFramesToResources,
  },
  {
    commandId: 'system.resource.video.trim_to_resource',
    mcpToolName: 'system_resource_video_trim_to_resource',
    mcpAliases: ['movscript_resource_video_trim_to_resource'],
    cliPath: ['resource', 'video', 'trim-to-resource'],
    productCliPath: ['resource', 'video', 'trim-to-resource'],
    description: 'System: trim a video RawResource into a new video RawResource.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_trim_to_resource'),
    run: trimResourceVideoToResource,
  },
  {
    commandId: 'system.resource.video.compose_to_resource',
    mcpToolName: 'system_resource_video_compose_to_resource',
    mcpAliases: ['movscript_resource_video_compose_to_resource'],
    cliPath: ['resource', 'video', 'compose-to-resource'],
    productCliPath: ['resource', 'video', 'compose-to-resource'],
    description: 'System: compose video RawResources in sequence into a new video RawResource.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_compose_to_resource'),
    run: composeResourceVideosToResource,
  },
  {
    commandId: 'system.resource.video.concat_to_resource',
    mcpToolName: 'system_resource_video_concat_to_resource',
    mcpAliases: ['movscript_resource_video_concat_to_resource'],
    cliPath: ['resource', 'video', 'concat-to-resource'],
    productCliPath: ['resource', 'video', 'concat-to-resource'],
    description: 'System: concat video RawResources into a new video RawResource.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_concat_to_resource'),
    run: composeResourceVideosToResource,
  },
  {
    commandId: 'system.resource.video.contact_sheet_to_resource',
    mcpToolName: 'system_resource_video_contact_sheet_to_resource',
    mcpAliases: ['movscript_resource_video_contact_sheet_to_resource'],
    cliPath: ['resource', 'video', 'contact-sheet-to-resource'],
    productCliPath: ['resource', 'video', 'contact-sheet-to-resource'],
    description: 'System: create a contact sheet image RawResource from a video RawResource.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_contact_sheet_to_resource'),
    run: createResourceVideoContactSheetToResource,
  },
  {
    commandId: 'system.resource.video.extract_audio_to_resource',
    mcpToolName: 'system_resource_video_extract_audio_to_resource',
    mcpAliases: ['movscript_resource_video_extract_audio_to_resource'],
    cliPath: ['resource', 'video', 'extract-audio-to-resource'],
    productCliPath: ['resource', 'video', 'extract-audio-to-resource'],
    description: 'System: extract audio from a video RawResource into an audio RawResource.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_video_extract_audio_to_resource'),
    run: extractResourceVideoAudioToResource,
  },
  {
    commandId: 'system.resource.upload',
    mcpToolName: 'system_resource_upload',
    mcpAliases: ['movscript_resource_upload'],
    cliPath: ['resource', 'upload'],
    productCliPath: ['resource', 'upload'],
    description: 'System: upload an agent-accessible artifact to the MovScript RawResource library.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_upload'),
    run: uploadAgentImageResource,
  },
  {
    commandId: 'system.resource.upload_batch',
    mcpToolName: 'system_resource_upload_batch',
    mcpAliases: ['movscript_resource_upload_batch'],
    cliPath: ['resource', 'upload-batch'],
    productCliPath: ['resource', 'upload-batch'],
    description: 'System: upload multiple agent-accessible artifacts to the MovScript RawResource library.',
    inputSchema: toolInputSchema(resourceMediaTools(), 'movscript_resource_upload_batch'),
    run: uploadAgentImageResources,
  },
  {
    commandId: 'system.external_resource.source.list',
    mcpToolName: 'system_external_resource_source_list',
    mcpAliases: ['movscript_external_resource_source_list'],
    cliPath: ['external-resource', 'source', 'list'],
    productCliPath: ['external-resource', 'source', 'list'],
    description: 'System: list configured external media search sources.',
    inputSchema: toolInputSchema(externalResourceTools(), 'movscript_external_resource_source_list'),
    run: listExternalResourceSources,
  },
  {
    commandId: 'system.external_resource.search',
    mcpToolName: 'system_external_resource_search',
    mcpAliases: ['movscript_external_resource_search'],
    cliPath: ['external-resource', 'search'],
    productCliPath: ['external-resource', 'search'],
    description: 'System: search configured external image/video providers.',
    inputSchema: toolInputSchema(externalResourceTools(), 'movscript_external_resource_search'),
    run: searchExternalResources,
  },
  {
    commandId: 'system.shot.library.query',
    mcpToolName: 'system_shot_library_query',
    mcpAliases: ['movscript_shot_library_query'],
    cliPath: ['shot', 'library', 'query'],
    productCliPath: ['shot', 'library', 'query'],
    description: 'System: query the reusable MovScript shot reference library.',
    inputSchema: toolInputSchema(shotLibraryTools(), 'movscript_shot_library_query'),
    run: queryShotLibrary,
  },
  {
    commandId: 'system.shot.group.get',
    mcpToolName: 'system_shot_group_get',
    mcpAliases: ['movscript_shot_group_get'],
    cliPath: ['shot', 'group', 'get'],
    productCliPath: ['shot', 'group', 'get'],
    description: 'System: read a MovScript shot reference group and its ordered shots.',
    inputSchema: toolInputSchema(shotLibraryTools(), 'movscript_shot_group_get'),
    run: getShotGroup,
  },
  {
    commandId: 'system.shot.group.create',
    mcpToolName: 'system_shot_group_create',
    mcpAliases: ['movscript_shot_group_create'],
    cliPath: ['shot', 'group', 'create'],
    productCliPath: ['shot', 'group', 'create'],
    description: 'System: create a MovScript shot reference group for a video RawResource.',
    inputSchema: toolInputSchema(shotLibraryTools(), 'movscript_shot_group_create'),
    run: createShotGroup,
  },
  {
    commandId: 'system.shot.group.add_shots',
    mcpToolName: 'system_shot_group_add_shots',
    mcpAliases: ['movscript_shot_group_add_shots'],
    cliPath: ['shot', 'group', 'add-shots'],
    productCliPath: ['shot', 'group', 'add-shots'],
    description: 'System: append shot references to an existing shot reference group.',
    inputSchema: toolInputSchema(shotLibraryTools(), 'movscript_shot_group_add_shots'),
    run: addShotsToGroup,
  },
  {
    commandId: 'system.video.shot_cuts.analyze',
    mcpToolName: 'system_video_shot_cuts_analyze',
    mcpAliases: ['movscript_video_shot_cuts_analyze'],
    cliPath: ['video', 'shot-cuts', 'analyze'],
    productCliPath: ['video', 'shot-cuts', 'analyze'],
    description: 'System: analyze a video RawResource with ffmpeg scene detection and return shot ranges.',
    inputSchema: toolInputSchema(shotLibraryTools(), 'movscript_video_shot_cuts_analyze'),
    run: analyzeVideoShotCuts,
  },
], commandContractDefaults('system'))

export const domainCommandSpecs: DomainCommandSpec[] = withCommandContract<DomainCommandDraft>([
  {
    commandId: 'domain.get_model',
    mcpToolName: 'domain_get_model',
    cliPath: ['get-model'],
    description: 'Domain: return the editable source model for one entity without requiring a frontend.',
    inputSchema: toolInputSchema(domainTools(), 'domain_get_model'),
    permissions: ['project:read'],
    run: domainGetModel,
  },
  {
    commandId: 'domain.overview',
    mcpToolName: 'domain_overview',
    cliPath: ['overview'],
    description: 'Domain: show source state, backend decisions, diagnostics, stale outputs, and next actions.',
    inputSchema: toolInputSchema(domainTools(), 'domain_overview'),
    permissions: ['project:read'],
    run: domainOverview,
  },
  {
    commandId: 'domain.query.entities',
    mcpToolName: 'domain_query_entities',
    cliPath: ['query', 'entities'],
    description: 'Domain: query indexed source entities by kind, ids, path context, or free text.',
    inputSchema: toolInputSchema(domainTools(), 'domain_query_entities'),
    permissions: ['project:read'],
    run: domainQueryEntities,
  },
  {
    commandId: 'domain.query.settings',
    mcpToolName: 'domain_query_settings',
    cliPath: ['query', 'settings'],
    description: 'Domain: query concrete setting entities.',
    inputSchema: toolInputSchema(domainTools(), 'domain_query_settings'),
    permissions: ['project:read'],
    run: domainQuerySettings,
  },
  {
    commandId: 'domain.query.assets',
    mcpToolName: 'domain_query_assets',
    cliPath: ['query', 'assets'],
    description: 'Domain: query setting-state-owned asset slots.',
    inputSchema: toolInputSchema(domainTools(), 'domain_query_assets'),
    permissions: ['project:read'],
    run: domainQueryAssets,
  },
  {
    commandId: 'domain.query.production_context',
    mcpToolName: 'domain_query_production_context',
    cliPath: ['query', 'production-context'],
    description: 'Domain: query production planning context and candidate-bearing production slots.',
    inputSchema: toolInputSchema(domainTools(), 'domain_query_production_context'),
    permissions: ['project:read'],
    run: domainQueryProductionContext,
  },
  {
    commandId: 'domain.read.content_workspace',
    mcpToolName: 'domain_read_content_workspace',
    cliPath: ['read', 'content-workspace'],
    description: 'Domain: read the normalized content workspace view model through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_read_content_workspace'),
    permissions: ['project:read'],
    run: domainReadContentWorkspace,
  },
  {
    commandId: 'domain.read.content_workspace_snapshot',
    mcpToolName: 'domain_read_content_workspace_snapshot',
    cliPath: ['read', 'content-workspace-snapshot'],
    description: 'Domain: read the raw content workspace snapshot through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_read_content_workspace_snapshot'),
    permissions: ['project:read'],
    run: domainReadContentWorkspaceSnapshot,
  },
  {
    commandId: 'domain.read.project_context_snapshot',
    mcpToolName: 'domain_read_project_context_snapshot',
    cliPath: ['read', 'project-context'],
    description: 'Domain: read the project context snapshot agents need before planning or generation.',
    inputSchema: toolInputSchema(domainTools(), 'domain_read_project_context_snapshot'),
    permissions: ['project:read'],
    run: domainReadProjectContextSnapshot,
  },
  {
    commandId: 'domain.read.content_unit.artifact',
    mcpToolName: 'domain_derive_content_unit_artifact',
    cliPath: ['read', 'content-unit', 'artifact'],
    description: 'Domain: derive the artifact bundle for a content unit.',
    inputSchema: toolInputSchema(domainTools(), 'domain_derive_content_unit_artifact'),
    permissions: ['project:read'],
    run: domainInterpretContentUnitArtifact,
  },
  {
    commandId: 'domain.read.content_unit.backend_prompt',
    mcpToolName: 'domain_build_content_unit_backend_prompt',
    cliPath: ['read', 'content-unit', 'backend-prompt'],
    description: 'Domain: build a backend-ready prompt by resolving selected upstream resources.',
    inputSchema: toolInputSchema(domainTools(), 'domain_build_content_unit_backend_prompt'),
    permissions: ['project:read'],
    run: domainBuildContentUnitBackendPrompt,
  },
  {
    commandId: 'domain.read.content_unit.runtime_panel',
    mcpToolName: 'domain_read_content_unit_runtime_panel',
    cliPath: ['read', 'content-unit', 'runtime-panel'],
    description: 'Domain: read the derived content-unit runtime panel.',
    inputSchema: toolInputSchema(domainTools(), 'domain_read_content_unit_runtime_panel'),
    permissions: ['project:read'],
    run: domainReadContentUnitRuntimePanel,
  },
  {
    commandId: 'domain.read.content_unit.generation_prompt',
    mcpToolName: 'domain_read_content_unit_generation_prompt',
    mcpAliases: ['domain_read_content_unit_input_version'],
    cliPath: ['read', 'content-unit', 'generation-prompt'],
    description: 'Domain: read the derived normalized content-unit generation prompt.',
    inputSchema: toolInputSchema(domainTools(), 'domain_read_content_unit_generation_prompt'),
    permissions: ['project:read'],
    run: domainReadContentUnitGenerationPrompt,
  },
  {
    commandId: 'domain.read.content_unit.dependency_report',
    mcpToolName: 'domain_read_content_unit_dependency_report',
    cliPath: ['read', 'content-unit', 'dependency-report'],
    description: 'Domain: read the derived content-unit dependency report.',
    inputSchema: toolInputSchema(domainTools(), 'domain_read_content_unit_dependency_report'),
    permissions: ['project:read'],
    run: domainReadContentUnitDependencyReport,
  },
  {
    commandId: 'domain.read.content_unit.selection_validity',
    mcpToolName: 'domain_read_content_unit_selection_validity',
    cliPath: ['read', 'content-unit', 'selection-validity'],
    description: 'Domain: read the derived content-unit selection validity report.',
    inputSchema: toolInputSchema(domainTools(), 'domain_read_content_unit_selection_validity'),
    permissions: ['project:read'],
    run: domainReadContentUnitSelectionValidity,
  },
  {
    commandId: 'domain.read.preview_timeline',
    mcpToolName: 'domain_read_preview_timeline',
    cliPath: ['read', 'preview-timeline'],
    description: 'Domain: read the derived production preview timeline.',
    inputSchema: toolInputSchema(domainTools(), 'domain_read_preview_timeline'),
    permissions: ['project:read'],
    run: domainReadPreviewTimeline,
  },
  {
    commandId: 'domain.read.production_timeline',
    mcpToolName: 'domain_read_production_timeline',
    cliPath: ['read', 'production-timeline'],
    description: 'Domain: convert a production preview timeline into an editing handoff.',
    inputSchema: toolInputSchema(domainTools(), 'domain_read_production_timeline'),
    permissions: ['project:read'],
    run: domainReadProductionTimeline,
  },
  {
    commandId: 'domain.read.scene_moment_edit_plan',
    mcpToolName: 'domain_read_scene_moment_edit_plan',
    cliPath: ['read', 'scene-moment', 'edit-plan'],
    description: 'Domain: read the derived scene_moment edit plan.',
    inputSchema: toolInputSchema(domainTools(), 'domain_read_scene_moment_edit_plan'),
    permissions: ['project:read'],
    run: domainReadSceneMomentEditPlan,
  },
  {
    commandId: 'domain.read.production_edit_plan',
    mcpToolName: 'domain_read_production_edit_plan',
    cliPath: ['read', 'production', 'edit-plan'],
    description: 'Domain: read a production-level edit plan handoff.',
    inputSchema: toolInputSchema(domainTools(), 'domain_read_production_edit_plan'),
    permissions: ['project:read'],
    run: domainReadProductionEditPlan,
  },
  {
    commandId: 'domain.read.editing_project_context',
    mcpToolName: 'domain_create_editing_project_context',
    cliPath: ['read', 'editing-project-context'],
    description: 'Domain: read a domain-to-editing handoff context without creating an editing project.',
    inputSchema: toolInputSchema(domainTools(), 'domain_create_editing_project_context'),
    permissions: ['project:read'],
    run: domainCreateEditingProjectContext,
  },
  {
    commandId: 'domain.read.scene_moment_timeline',
    mcpToolName: 'domain_read_scene_moment_timeline',
    cliPath: ['read', 'scene-moment-timeline'],
    description: 'Domain: convert a scene_moment edit plan into an editing handoff.',
    inputSchema: toolInputSchema(domainTools(), 'domain_read_scene_moment_timeline'),
    permissions: ['project:read'],
    run: domainReadSceneMomentTimeline,
  },
  {
    commandId: 'domain.read.production_work_plan',
    mcpToolName: 'domain_read_production_work_plan',
    cliPath: ['read', 'production-work-plan'],
    description: 'Domain: derive the current in-memory production work plan.',
    inputSchema: toolInputSchema(domainTools(), 'domain_read_production_work_plan'),
    permissions: ['project:read'],
    run: domainReadProductionWorkPlan,
  },
  {
    commandId: 'domain.production.status_summary',
    mcpToolName: 'domain_production_status_summary',
    cliPath: ['production', 'status-summary'],
    description: 'Domain: summarize current production progress, blockers, stale hints, and candidate counts.',
    inputSchema: toolInputSchema(domainTools(), 'domain_production_status_summary'),
    permissions: ['project:read'],
    run: domainProductionStatusSummary,
  },
  {
    commandId: 'domain.regeneration.plan',
    mcpToolName: 'domain_regeneration_plan',
    cliPath: ['regeneration', 'plan'],
    description: 'Domain: read downstream review targets after interpret refreshes diagnostic context.',
    inputSchema: toolInputSchema(domainTools(), 'domain_regeneration_plan'),
    permissions: ['project:read'],
    run: domainRegenerationPlan,
  },
  {
    commandId: 'domain.source.project_standards.upsert',
    mcpToolName: 'domain_upsert_project_standards',
    cliPath: ['source', 'project-standards', 'upsert'],
    description: 'Domain source: create or update project-wide creative standards through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_project_standards'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertProjectStandards,
  },
  {
    commandId: 'domain.source.setting.upsert',
    mcpToolName: 'domain_upsert_setting',
    cliPath: ['source', 'setting', 'upsert'],
    description: 'Domain source: create or update one concrete setting entity through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_setting'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertSetting,
  },
  {
    commandId: 'domain.source.setting_state.upsert',
    mcpToolName: 'domain_upsert_setting_state',
    cliPath: ['source', 'setting-state', 'upsert'],
    description: 'Domain source: create or update one setting_state entity through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_setting_state'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertSettingState,
  },
  {
    commandId: 'domain.source.asset.upsert',
    mcpToolName: 'domain_upsert_asset',
    cliPath: ['source', 'asset', 'upsert'],
    description: 'Domain source: create or update one setting-state asset slot through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_asset'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertAsset,
  },
  {
    commandId: 'domain.source.setting_tree.upsert',
    mcpToolName: 'domain_upsert_setting_tree',
    cliPath: ['source', 'setting-tree', 'upsert'],
    description: 'Domain source: create or update one setting tree with states and asset slots through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_setting_tree'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertSettingTree,
  },
  {
    commandId: 'domain.source.script.upsert',
    mcpToolName: 'domain_upsert_script',
    cliPath: ['source', 'script', 'upsert'],
    description: 'Domain source: create or update script metadata plus Markdown source through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_script'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertScript,
  },
  {
    commandId: 'domain.source.script.read',
    mcpToolName: 'domain_read_script_source',
    cliPath: ['source', 'script', 'read'],
    description: 'Domain source: read script Markdown source through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_read_script_source'),
    permissions: ['project:read'],
    run: domainReadScriptSource,
  },
  {
    commandId: 'domain.source.script.snapshot_version',
    mcpToolName: 'domain_snapshot_script_version',
    cliPath: ['source', 'script', 'snapshot-version'],
    description: 'Domain source: snapshot a script Markdown source into a stable script version through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_snapshot_script_version'),
    permissions: ['project:read', 'project:write'],
    run: domainSnapshotScriptVersion,
  },
  {
    commandId: 'domain.source.content_unit.upsert',
    mcpToolName: 'domain_upsert_content_unit',
    cliPath: ['source', 'content-unit', 'upsert'],
    description: 'Domain source: create or update a project-level content unit through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_content_unit'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertContentUnit,
  },
  {
    commandId: 'domain.source.timeline_namespace_tree.upsert',
    mcpToolName: 'domain_upsert_timeline_namespace_tree',
    cliPath: ['source', 'timeline-namespace-tree', 'upsert'],
    description: 'Domain source: create or update a path-first timeline namespace tree through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_timeline_namespace_tree'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertTimelineNamespaceTree,
  },
  {
    commandId: 'domain.source.production.upsert',
    mcpToolName: 'domain_upsert_production',
    cliPath: ['source', 'production', 'upsert'],
    description: 'Domain source: create or update one production entity through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_production'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertProduction,
  },
  {
    commandId: 'domain.source.production_tree.upsert',
    mcpToolName: 'domain_upsert_production_tree',
    cliPath: ['source', 'production-tree', 'upsert'],
    description: 'Domain source: create or update one production tree through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_production_tree'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertProductionTree,
  },
  {
    commandId: 'domain.source.segment.upsert',
    mcpToolName: 'domain_upsert_segment',
    cliPath: ['source', 'segment', 'upsert'],
    description: 'Domain source: create or update one segment entity through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_segment'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertSegment,
  },
  {
    commandId: 'domain.source.scene_moment.upsert',
    mcpToolName: 'domain_upsert_scene_moment',
    cliPath: ['source', 'scene-moment', 'upsert'],
    description: 'Domain source: create or update one scene_moment entity through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_scene_moment'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertSceneMoment,
  },
  {
    commandId: 'domain.source.keyframe.upsert',
    mcpToolName: 'domain_upsert_keyframe',
    cliPath: ['source', 'keyframe', 'upsert'],
    description: 'Domain source: create or update one keyframe entity through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_keyframe'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertKeyframe,
  },
  {
    commandId: 'domain.source.storyboard.upsert',
    mcpToolName: 'domain_upsert_storyboard',
    cliPath: ['source', 'storyboard', 'upsert'],
    description: 'Domain source: create or update one storyboard entity through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_storyboard'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertStoryboard,
  },
  {
    commandId: 'domain.source.audio_cue.upsert',
    mcpToolName: 'domain_upsert_audio_cue',
    cliPath: ['source', 'audio-cue', 'upsert'],
    description: 'Domain source: create or update one audio_cue entity through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_audio_cue'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertAudioCue,
  },
  {
    commandId: 'domain.source.expression_unit.upsert',
    mcpToolName: 'domain_upsert_expression_unit',
    cliPath: ['source', 'expression-unit', 'upsert'],
    description: 'Domain source: create or update one expression_unit entity through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_upsert_expression_unit'),
    permissions: ['project:read', 'project:write'],
    run: domainUpsertExpressionUnit,
  },
  {
    commandId: 'domain.source.content_unit.prompt.update',
    mcpToolName: 'domain_update_content_unit_prompt',
    cliPath: ['source', 'content-unit', 'prompt', 'update'],
    description: 'Domain source: update a content unit edit_prompt through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_update_content_unit_prompt'),
    permissions: ['project:read', 'project:write'],
    run: domainUpdateContentUnitPrompt,
  },
  {
    commandId: 'domain.source.entity.transition.update',
    mcpToolName: 'domain_update_entity_transition',
    cliPath: ['source', 'entity', 'transition', 'update'],
    description: 'Domain source: update transition metadata on a source entity through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_update_entity_transition'),
    permissions: ['project:read', 'project:write'],
    run: domainUpdateEntityTransition,
  },
  {
    commandId: 'domain.source.storyboard.timeline.update',
    mcpToolName: 'domain_update_storyboard_timeline',
    cliPath: ['source', 'storyboard', 'timeline', 'update'],
    description: 'Domain source: update storyboard timeline metadata through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_update_storyboard_timeline'),
    permissions: ['project:read', 'project:write'],
    run: domainUpdateStoryboardTimeline,
  },
  {
    commandId: 'domain.source.entity.delete',
    mcpToolName: 'domain_delete_entity',
    cliPath: ['source', 'entity', 'delete'],
    description: 'Domain source: delete a source entity through Project Service.',
    inputSchema: toolInputSchema(domainTools(), 'domain_delete_entity'),
    permissions: ['project:read', 'project:write'],
    run: domainDeleteEntity,
  },
  {
    commandId: 'domain.provider.remote_asset_groups.query',
    mcpToolName: 'domain_query_remote_asset_groups',
    cliPath: ['provider', 'remote-asset-groups', 'query'],
    description: 'Domain provider: list mirrored remote asset-library groups for an explicit provider account.',
    inputSchema: toolInputSchema(domainTools(), 'domain_query_remote_asset_groups'),
    permissions: ['project:read', 'provider:read'],
    run: domainQueryRemoteAssetGroups,
  },
  {
    commandId: 'domain.provider.remote_assets.query',
    mcpToolName: 'domain_query_remote_assets',
    cliPath: ['provider', 'remote-assets', 'query'],
    description: 'Domain provider: list remote provider assets inside an explicit remote asset group.',
    inputSchema: toolInputSchema(domainTools(), 'domain_query_remote_assets'),
    permissions: ['project:read', 'provider:read'],
    run: domainQueryRemoteAssets,
  },
  {
    commandId: 'domain.provider.asset.certify',
    mcpToolName: 'domain_certify_asset_provider',
    mcpAliases: ['domain_certify_asset_seedance2'],
    cliPath: ['provider', 'asset', 'certify'],
    description: 'Domain provider: certify a selected asset RawResource in a provider asset library as an explicit legacy/provider gate.',
    inputSchema: toolInputSchema(domainTools(), 'domain_certify_asset_provider'),
    permissions: ['project:read', 'project:write', 'provider:write'],
    run: domainCertifyAssetProvider,
  },
  {
    commandId: 'domain.candidate.legacy.append',
    mcpToolName: 'domain_append_candidate',
    cliPath: ['candidate', 'legacy', 'append'],
    description: 'Domain legacy candidate migration fallback: append an inline source candidate only for old project migration; new work must use content-unit candidate tools.',
    inputSchema: toolInputSchema(domainTools(), 'domain_append_candidate'),
    stability: 'temporary_fallback',
    permissions: ['project:read', 'project:write'],
    run: domainAppendCandidate,
  },
  {
    commandId: 'domain.candidate.create_content',
    mcpToolName: 'domain_create_content_candidate',
    cliPath: ['candidate', 'create-content'],
    description: 'Domain: create a content-unit candidate through Project Service without selecting or adopting it.',
    inputSchema: toolInputSchema(domainTools(), 'domain_create_content_candidate'),
    run: domainCreateContentCandidate,
  },
  {
    commandId: 'domain.candidate.register_raw_resource',
    mcpToolName: 'domain_register_raw_resource_as_content_unit_candidate',
    cliPath: ['candidate', 'register-raw-resource'],
    description: 'Domain: register an existing RawResource as a content-unit candidate without selecting or adopting it.',
    inputSchema: toolInputSchema(domainTools(), 'domain_register_raw_resource_as_content_unit_candidate'),
    run: domainRegisterRawResourceAsContentUnitCandidate,
  },
  {
    commandId: 'domain.candidate.create_content_batch',
    mcpToolName: 'domain_create_content_candidate_batch',
    cliPath: ['candidate', 'create-content-batch'],
    description: 'Domain: create multiple content-unit candidates through Project Service with per-item results.',
    inputSchema: toolInputSchema(domainTools(), 'domain_create_content_candidate_batch'),
    run: domainCreateContentCandidateBatch,
  },
  {
    commandId: 'domain.candidate.legacy.create_asset_slot',
    mcpToolName: 'domain_create_asset_slot_candidate',
    cliPath: ['candidate', 'legacy', 'create-asset-slot'],
    description: 'Domain legacy candidate migration fallback: create an inline asset-slot candidate only for old project migration; new work must use asset_ref content-unit candidates.',
    inputSchema: toolInputSchema(domainTools(), 'domain_create_asset_slot_candidate'),
    stability: 'temporary_fallback',
    permissions: ['project:read', 'project:write'],
    run: domainCreateAssetSlotCandidate,
  },
  {
    commandId: 'domain.candidate.legacy.create_keyframe',
    mcpToolName: 'domain_create_keyframe_candidate',
    cliPath: ['candidate', 'legacy', 'create-keyframe'],
    description: 'Domain legacy candidate migration fallback: create an inline keyframe candidate only for old project migration; new work must use content-unit candidates.',
    inputSchema: toolInputSchema(domainTools(), 'domain_create_keyframe_candidate'),
    stability: 'temporary_fallback',
    permissions: ['project:read', 'project:write'],
    run: domainCreateKeyframeCandidate,
  },
  {
    commandId: 'domain.candidate.select_content_unit',
    mcpToolName: 'domain_select_content_unit_candidate',
    cliPath: ['candidate', 'select-content-unit'],
    description: 'Domain: explicitly select a content-unit candidate through Project Service decision metadata.',
    inputSchema: toolInputSchema(domainTools(), 'domain_select_content_unit_candidate'),
    run: domainSelectContentUnitCandidate,
  },
  {
    commandId: 'domain.candidate.select_content_unit_batch',
    mcpToolName: 'domain_select_content_unit_candidate_batch',
    cliPath: ['candidate', 'select-content-unit-batch'],
    description: 'Domain: explicitly select content-unit candidates in batch through Project Service decision metadata.',
    inputSchema: toolInputSchema(domainTools(), 'domain_select_content_unit_candidate_batch'),
    run: domainSelectContentUnitCandidateBatch,
  },
  {
    commandId: 'domain.candidate.decide_content_unit',
    mcpToolName: 'domain_decide_content_unit_candidate',
    cliPath: ['candidate', 'decide-content-unit'],
    description: 'Domain: apply a human review decision to a content-unit candidate; adopt writes selection, reject/defer does not.',
    inputSchema: toolInputSchema(domainTools(), 'domain_decide_content_unit_candidate'),
    run: domainDecideContentUnitCandidate,
  },
  {
    commandId: 'domain.candidate.legacy.select',
    mcpToolName: 'domain_select_candidate',
    cliPath: ['candidate', 'legacy', 'select'],
    description: 'Domain legacy candidate migration fallback: select and lock an inline source candidate only for old project migration; new work must use content-unit decision gates.',
    inputSchema: toolInputSchema(domainTools(), 'domain_select_candidate'),
    stability: 'temporary_fallback',
    permissions: ['project:read', 'project:write'],
    run: domainSelectCandidate,
  },
  {
    commandId: 'domain.candidate.legacy.update',
    mcpToolName: 'domain_update_candidate',
    cliPath: ['candidate', 'legacy', 'update'],
    description: 'Domain legacy candidate migration fallback: update an inline source candidate only for old project migration; new work must use content-unit candidate tools.',
    inputSchema: toolInputSchema(domainTools(), 'domain_update_candidate'),
    stability: 'temporary_fallback',
    permissions: ['project:read', 'project:write'],
    run: domainUpdateCandidate,
  },
  {
    commandId: 'domain.candidate.legacy.unlock',
    mcpToolName: 'domain_unlock_candidate',
    cliPath: ['candidate', 'legacy', 'unlock'],
    description: 'Domain legacy candidate migration fallback: remove an inline candidate lock only for old project migration; new work must use content-unit decision gates.',
    inputSchema: toolInputSchema(domainTools(), 'domain_unlock_candidate'),
    stability: 'temporary_fallback',
    permissions: ['project:read', 'project:write'],
    run: domainUnlockCandidate,
  },
  {
    commandId: 'domain.diagnostics.inspect',
    mcpToolName: 'domain_inspect',
    cliPath: ['diagnostics', 'inspect'],
    description: 'Domain diagnostics: inspect project source changes and readiness without writing interpreted artifacts.',
    inputSchema: toolInputSchema(domainTools(), 'domain_inspect'),
    permissions: ['project:read'],
    run: domainInspect,
  },
  {
    commandId: 'domain.diagnostics.interpret',
    mcpToolName: 'domain_interpret',
    cliPath: ['diagnostics', 'interpret'],
    description: 'Domain diagnostics: validate source and refresh interpreter diagnostics.',
    inputSchema: toolInputSchema(domainTools(), 'domain_interpret'),
    permissions: ['project:read', 'project:interpret'],
    run: domainInterpret,
  },
  {
    commandId: 'domain.diagnostics.review',
    mcpToolName: 'domain_review',
    cliPath: ['diagnostics', 'review'],
    description: 'Domain diagnostics: compatibility review-shaped source diagnostics; prefer domain_inspect for new workflows.',
    inputSchema: toolInputSchema(domainTools(), 'domain_review'),
    permissions: ['project:read'],
    run: domainReview,
  },
], commandContractDefaults('domain'))

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
    description: 'Editing backend: validate an existing MediaEditingProject and create a render or HLS Media Pipeline task without creating candidates.',
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
    commandId: 'editing.result.register',
    mcpToolName: 'editing_result_register',
    cliPath: ['result', 'register'],
    description: 'Editing backend: register a Media Pipeline render/export result without uploading, adopting, selecting, or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_result_register'),
    ownerService: MEDIA_PIPELINE_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, MEDIA_PIPELINE_SERVICE],
    permissions: ['editing:read', 'editing:write'],
    run: editingResultRegister,
  },
  {
    commandId: 'editing.result.recover_external_nle',
    mcpToolName: 'editing_result_recover_external_nle',
    cliPath: ['result', 'recover-external-nle'],
    description: 'Editing backend: detect an External NLE export directory or explicit artifact path and register the result without uploading or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_result_recover_external_nle'),
    ownerService: MEDIA_PIPELINE_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, MEDIA_PIPELINE_SERVICE],
    permissions: ['editing:read', 'editing:write'],
    run: editingResultRecoverExternalNle,
  },
  {
    commandId: 'editing.result.watch_external_nle_create',
    mcpToolName: 'editing_result_watch_external_nle_create',
    cliPath: ['result', 'watch', 'external-nle', 'create'],
    description: 'Editing backend: create a daemon-owned background watch for an External NLE export and register the result when it appears.',
    inputSchema: toolInputSchema(editingTools(), 'editing_result_watch_external_nle_create'),
    ownerService: MEDIA_PIPELINE_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, MEDIA_PIPELINE_SERVICE],
    permissions: ['editing:read', 'editing:write'],
    run: editingResultWatchExternalNleCreate,
  },
  {
    commandId: 'editing.result.watch_get',
    mcpToolName: 'editing_result_watch_get',
    cliPath: ['result', 'watch', 'get'],
    description: 'Editing backend: read one daemon-owned Media Pipeline result watch by watchId.',
    inputSchema: toolInputSchema(editingTools(), 'editing_result_watch_get'),
    ownerService: MEDIA_PIPELINE_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, MEDIA_PIPELINE_SERVICE],
    run: editingResultWatchGet,
  },
  {
    commandId: 'editing.result.watch_list',
    mcpToolName: 'editing_result_watch_list',
    cliPath: ['result', 'watch', 'list'],
    description: 'Editing backend: list daemon-owned Media Pipeline result watches.',
    inputSchema: toolInputSchema(editingTools(), 'editing_result_watch_list'),
    ownerService: MEDIA_PIPELINE_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, MEDIA_PIPELINE_SERVICE],
    run: editingResultWatchList,
  },
  {
    commandId: 'editing.result.watch_cancel',
    mcpToolName: 'editing_result_watch_cancel',
    cliPath: ['result', 'watch', 'cancel'],
    description: 'Editing backend: cancel one daemon-owned Media Pipeline result watch.',
    inputSchema: toolInputSchema(editingTools(), 'editing_result_watch_cancel'),
    ownerService: MEDIA_PIPELINE_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, MEDIA_PIPELINE_SERVICE],
    permissions: ['editing:read', 'editing:write'],
    run: editingResultWatchCancel,
  },
  {
    commandId: 'editing.external_nle.open',
    mcpToolName: 'editing_external_nle_open',
    cliPath: ['external-nle', 'open'],
    description: 'Editing backend: open an External NLE exchange project in the local OS or named editor without watching, uploading, or creating candidates.',
    inputSchema: toolInputSchema(editingTools(), 'editing_external_nle_open'),
    ownerService: 'local.os',
    requiredRuntime: ['local.os'],
    permissions: ['editing:read'],
    run: editingExternalNleOpen,
  },
  {
    commandId: 'editing.result.get',
    mcpToolName: 'editing_result_get',
    cliPath: ['result', 'get'],
    description: 'Editing backend: read one Media Pipeline render/export result by resultId.',
    inputSchema: toolInputSchema(editingTools(), 'editing_result_get'),
    ownerService: MEDIA_PIPELINE_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, MEDIA_PIPELINE_SERVICE],
    run: editingResultGet,
  },
  {
    commandId: 'editing.result.list',
    mcpToolName: 'editing_result_list',
    cliPath: ['result', 'list'],
    description: 'Editing backend: list Media Pipeline render/export results for task recovery and cross-backend handoff.',
    inputSchema: toolInputSchema(editingTools(), 'editing_result_list'),
    ownerService: MEDIA_PIPELINE_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, MEDIA_PIPELINE_SERVICE],
    run: editingResultList,
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

export const productionEditingCommandSpecs: ProductionEditingCommandSpec[] = withCommandContract<ProductionEditingCommandDraft>([
  {
    commandId: 'production_editing.resources.refresh',
    mcpToolName: 'production_editing_resources_refresh',
    cliPath: ['resources', 'refresh'],
    description: 'Production editing: refresh the production resource index without mutating editing workspaces or candidates.',
    inputSchema: toolInputSchema(productionEditingTools(), 'production_editing_resources_refresh'),
    ownerService: PROJECT_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, PROJECT_SERVICE],
    permissions: ['project:read', 'project:write'],
    run: productionEditingResourcesRefresh,
  },
  {
    commandId: 'production_editing.workspace.list',
    mcpToolName: 'production_editing_workspace_list',
    cliPath: ['workspace', 'list'],
    description: 'Production editing: list system_editing and remotion workspaces for a production.',
    inputSchema: toolInputSchema(productionEditingTools(), 'production_editing_workspace_list'),
    ownerService: PROJECT_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, PROJECT_SERVICE],
    permissions: ['project:read'],
    run: productionEditingWorkspaceList,
  },
  {
    commandId: 'production_editing.workspace.create',
    mcpToolName: 'production_editing_workspace_create',
    cliPath: ['workspace', 'create'],
    description: 'Production editing: create a system_editing or remotion workspace and return the next skill handoff.',
    inputSchema: toolInputSchema(productionEditingTools(), 'production_editing_workspace_create'),
    ownerService: PROJECT_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, PROJECT_SERVICE],
    permissions: ['project:read', 'project:write'],
    run: productionEditingWorkspaceCreate,
  },
  {
    commandId: 'production_editing.workspace.get',
    mcpToolName: 'production_editing_workspace_get',
    cliPath: ['workspace', 'get'],
    description: 'Production editing: read one production editing workspace by id without opening it.',
    inputSchema: toolInputSchema(productionEditingTools(), 'production_editing_workspace_get'),
    ownerService: PROJECT_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, PROJECT_SERVICE],
    permissions: ['project:read'],
    run: productionEditingWorkspaceGet,
  },
  {
    commandId: 'production_editing.workspace.open',
    mcpToolName: 'production_editing_workspace_open',
    cliPath: ['workspace', 'open'],
    description: 'Production editing: open a workspace, refresh resources, and return the system_edit or remotion handoff.',
    inputSchema: toolInputSchema(productionEditingTools(), 'production_editing_workspace_open'),
    ownerService: PROJECT_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, PROJECT_SERVICE],
    permissions: ['project:read', 'project:write'],
    run: productionEditingWorkspaceOpen,
  },
  {
    commandId: 'production_editing.workspace.delete',
    mcpToolName: 'production_editing_workspace_delete',
    cliPath: ['workspace', 'delete'],
    description: 'Production editing: delete one production editing workspace without changing candidates.',
    inputSchema: toolInputSchema(productionEditingTools(), 'production_editing_workspace_delete'),
    ownerService: PROJECT_SERVICE,
    requiredRuntime: [LOCAL_NODE_GATEWAY_SERVICE, PROJECT_SERVICE],
    permissions: ['project:read', 'project:write'],
    run: productionEditingWorkspaceDelete,
  },
], commandContractDefaults('production-editing'))

export const workspaceCommandSpecs: WorkspaceCommandSpec[] = withCommandContract<WorkspaceCommandDraft>([
  {
    commandId: 'workspace.get_model',
    mcpToolName: 'domain_get_model',
    cliPath: ['get-model'],
    description: 'Workspace compatibility alias for domain_get_model. Prefer domain.get_model for new workflows.',
    inputSchema: toolInputSchema(domainTools(), 'domain_get_model'),
    stability: 'temporary_fallback',
    permissions: ['project:read'],
    run: domainGetModel,
  },
  {
    commandId: 'workspace.review',
    mcpToolName: 'domain_inspect',
    cliPath: ['review'],
    description: 'Workspace compatibility alias for domain_inspect. Prefer domain.diagnostics.inspect for new workflows.',
    inputSchema: toolInputSchema(domainTools(), 'domain_inspect'),
    stability: 'temporary_fallback',
    permissions: ['project:read'],
    run: domainInspect,
  },
  {
    commandId: 'workspace.interpret',
    mcpToolName: 'domain_interpret',
    cliPath: ['interpret'],
    description: 'Workspace compatibility alias for domain_interpret. Prefer domain.diagnostics.interpret for new workflows.',
    inputSchema: toolInputSchema(domainTools(), 'domain_interpret'),
    stability: 'temporary_fallback',
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
export const domainCommandByMCPToolName = new Map(domainCommandSpecs.flatMap((spec) => [
  [spec.mcpToolName, spec],
  ...(spec.mcpAliases ?? []).map((alias) => [alias, spec] as const),
] as const))
export const domainCommandById = new Map(domainCommandSpecs.map((spec) => [spec.commandId, spec]))
export const editingCommandByMCPToolName = new Map(editingCommandSpecs.map((spec) => [spec.mcpToolName, spec]))
export const editingCommandById = new Map(editingCommandSpecs.map((spec) => [spec.commandId, spec]))
export const productionEditingCommandByMCPToolName = new Map(productionEditingCommandSpecs.map((spec) => [spec.mcpToolName, spec]))
export const productionEditingCommandById = new Map(productionEditingCommandSpecs.map((spec) => [spec.commandId, spec]))
export const workspaceCommandByMCPToolName = new Map<string, WorkspaceCommandSpec>()
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

export function isDomainMCPToolName(name: string | undefined): boolean {
  return Boolean(name && domainCommandByMCPToolName.has(name))
}

export function isEditingMCPToolName(name: string | undefined): boolean {
  return Boolean(name && editingCommandByMCPToolName.has(name))
}

export function isProductionEditingMCPToolName(name: string | undefined): boolean {
  return Boolean(name && productionEditingCommandByMCPToolName.has(name))
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

function productionWorkflowContract(): Record<string, unknown> {
  return {
    schema: 'movscript.production_workflow.v1',
    status: 'ready',
    mode: 'cli_only',
    summary: 'Plan content, plan timeline, generate candidates, then export artifacts. Each stage is explicit and review-gated; generated or rendered outputs do not become stable project state until a candidate decision records adoption. Generic text/image/video/audio generation requests must choose MovScript or another generation system before generation. External generation results must be imported as MovScript RawResources before downstream use, and scene/expression outputs require manual candidate registration. Prompt writing is a first-class gate: model-facing prompts must be concrete, self-contained after refs resolve, and grounded in visible/audible direction. Video generation submission is a paid action and requires explicit user confirmation; image generation may proceed under normal readiness gates after tool choice is clear.',
    stages: [
      {
        stage_id: 'plan_content',
        order: 1,
        title: 'Plan content',
        purpose: 'Turn the user intent into project source, production structure, scene moments, expression units, content units, and reusable assets.',
        owner_services: [PROJECT_SERVICE, DATA_SERVICE],
        primary_cli: [
          ['movscript', 'domain', 'source', 'production-tree', 'upsert', '--json'],
          ['movscript', 'domain', 'source', 'content-unit', 'upsert', '--json'],
          ['movscript', 'domain', 'diagnostics', 'inspect', '--json'],
          ['movscript', 'domain', 'read', 'production-work-plan', '--json'],
        ],
        mcp_tools: [
          'domain_upsert_production_tree',
          'domain_upsert_content_unit',
          'domain_inspect',
          'domain_read_production_work_plan',
          'domain_production_status_summary',
        ],
        blockers: [
          'missing_project_dir',
          'missing_project_source',
          'generation_tool_choice_missing',
          'unresolved_content_unit_prompt_refs',
          'prompt_not_model_understandable',
          'missing_upstream_candidate_adoption',
          'domain_inspect_blockers',
        ],
        human_review: [
          'Review production scope, source entities, prompt blockers, and dependency report before generation.',
          'Ask the user to choose MovScript or another generation system before planning MovScript work for generic text/image/video/audio generation requests.',
          'Rewrite source prose into prompt-ready visual/audio direction; do not pass script excerpts or hidden story context as model prompts.',
          'Adopt or defer upstream candidate choices before using them as stable downstream references.',
        ],
        does_not: [
          'Does not submit generation jobs.',
          'Does not select candidates or make generated outputs stable.',
        ],
      },
      {
        stage_id: 'production_editing',
        order: 2,
        title: 'Open production editing workspace',
        purpose: 'Create or open a production-bound editing workspace, then hand off to system_edit or remotion for concrete playback/editing structure.',
        owner_services: [PROJECT_SERVICE],
        primary_cli: [
          ['movscript', 'production', 'editing', 'resources', 'refresh', '--json'],
          ['movscript', 'production', 'editing', 'workspace', 'list', '--json'],
          ['movscript', 'production', 'editing', 'workspace', 'create', '--json'],
          ['movscript', 'production', 'editing', 'workspace', 'open', '--json'],
        ],
        mcp_tools: [
          'production_editing_resources_refresh',
          'production_editing_workspace_list',
          'production_editing_workspace_create',
          'production_editing_workspace_open',
        ],
        blockers: [
          'missing_selected_content_units',
          'missing_production_id',
          'workspace_kind_missing',
          'workspace_stale',
          'handoff_skill_unavailable',
        ],
        human_review: [
          'Choose system_editing or remotion for the concrete workspace.',
          'Review the opened workspace handoff before concrete edits, preview, render, or candidate creation.',
        ],
        does_not: [
          'Does not mutate concrete clips or Remotion files.',
          'Does not render, upload artifacts, or create candidates.',
        ],
      },
      {
        stage_id: 'generate',
        order: 3,
        title: 'Generate',
        purpose: 'Use model gateway and generation jobs to create RawResources and content-unit candidates while preserving adoption gates.',
        owner_services: [DATA_SERVICE, PROJECT_SERVICE],
        primary_cli: [
          ['movscript', 'system', 'generation', 'prepare', '--json'],
          ['movscript', 'system', 'generation', 'submit', '--json'],
          ['movscript', 'system', 'generation', 'job', 'get', '--json'],
          ['movscript', 'domain', 'candidate', 'decide-content-unit', '--json'],
        ],
        mcp_tools: [
          'generation_prepare',
          'generation_submit',
          'generation_job_get',
          'generation_result_register',
          'domain_decide_content_unit_candidate',
          'domain_select_content_unit_candidate',
        ],
        blockers: [
          'provider_not_configured',
          'generation_tool_choice_missing',
          'model_route_missing',
          'credential_missing',
          'resource_access_unavailable',
          'prompt_compile_blocked',
          'prompt_not_model_understandable',
          'video_generation_confirmation_missing',
          'external_generation_result_not_uploaded',
          'manual_candidate_registration_missing',
          'generation_job_failed',
        ],
        human_review: [
          'Confirm the generation tool choice for generic text/image/video/audio requests before using MovScript generation tools.',
          'Review the model-facing prompt before generation: every required instruction must be visible, audible, a resolved reference, a camera/timing/light directive, or a concrete negative constraint.',
          'Confirm paid video generation explicitly before any generation_submit call with video_generation or video operations.',
          'For external systems such as LibTV, upload every generated text/image/video/audio result to MovScript RawResource before downstream use.',
          'For scene-moment, expression-unit, asset, storyboard, keyframe, or audio-cue targets, manually register the uploaded RawResource as a content-unit candidate.',
          'Review generated candidate outputs before adoption.',
          'Record adopt, reject, or defer; generation success alone must not unlock stable downstream dependencies.',
        ],
        does_not: [
          'Does not default generic generation requests to MovScript when the user has not chosen MovScript.',
          'Does not treat external generation URLs, canvas nodes, or provider task IDs as MovScript-ready outputs until uploaded as RawResources.',
          'Does not auto-select manually imported external candidates.',
          'Does not submit prompts that rely on hidden MovScript/project/chat context the model cannot see.',
          'Does not submit video generation jobs without explicit user confirmation; unconfirmed video requests stop at planning, prompt compilation, and readiness reporting.',
          'Does not automatically adopt or select candidates.',
          'Does not publish generated RawResources as final project state.',
        ],
      },
      {
        stage_id: 'export',
        order: 4,
        title: 'Export',
        purpose: 'Run the opened editing workspace through its concrete skill/backend, then upload or register final artifacts explicitly.',
        owner_services: [EDITING_SERVICE, MEDIA_PIPELINE_SERVICE, PROJECT_SERVICE],
        primary_cli: [
          ['movscript', 'editing', 'task', 'render', 'create', '--json'],
          ['movscript', 'editing', 'result', 'recover-external-nle', '--json'],
          ['movscript', 'system', 'artifact', 'upload-export', '--json'],
          ['movscript', 'editing', 'export', 'create-candidate', '--json'],
        ],
        mcp_tools: [
          'editing_task_render_create',
          'editing_result_recover_external_nle',
          'system_artifact_upload_export',
          'system_artifact_upload_hls_stream',
          'editing_export_create_candidate',
        ],
        blockers: [
          'media_pipeline_unavailable',
          'renderer_dependency_missing',
          'external_nle_output_missing',
          'render_task_failed',
          'artifact_upload_failed',
          'candidate_decision_missing',
        ],
        human_review: [
          'Review exported media or preview URL before upload/candidate creation.',
          'Create or adopt an export candidate only after the user or workflow explicitly approves the result.',
        ],
        does_not: [
          'Does not publish automatically.',
          'Does not mark export artifacts as stable choices without candidate/adoption commands.',
        ],
      },
    ],
    global_gates: [
      'runtime readiness must name the missing owner: daemon, Data Service, Project Service, Editing Service, Media Pipeline, provider key, resource access, or renderer dependency',
      'model/provider/admin configuration stays in movscript admin commands',
      'generic text/image/video/audio generation requests require an explicit tool choice: MovScript or another available generation system such as LibTV',
      'external generation results must be uploaded as MovScript RawResources before downstream use',
      'external outputs targeting scene moments or expression units require manual content-unit candidate registration before adoption',
      'model-facing prompts must be understandable from the compiled prompt plus resolved resources; hidden story context blocks generation',
      'paid video generation requires explicit user confirmation before generation_submit; images, storyboard panels, and keyframe images can be generated under ordinary readiness gates',
      'render success, artifact upload success, and generation success are separate from adoption',
      'stable downstream work requires adopted or explicitly selected content-unit candidates',
    ],
    recommended_preflight_cli: [
      ['movscript', 'doctor', '--json'],
      ['movscript', 'runtime', 'preflight', 'check', '--json'],
      ['movscript', 'admin', 'model', 'route', 'diagnose', '--json'],
      ['movscript', 'admin', 'resource-access', 'route', 'diagnose', '--json'],
      ['movscript', 'production', 'editing', 'workspace', 'list', '--json'],
    ],
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

export async function runMovScriptDomainCommand(
  specOrName: DomainCommandSpec | string,
  args: Record<string, unknown> = {},
): Promise<MovScriptCommandExecution> {
  const spec = typeof specOrName === 'string'
    ? domainCommandByMCPToolName.get(specOrName) ?? domainCommandById.get(specOrName)
    : specOrName
  if (!spec) throw new Error(`Unknown domain command: ${specOrName}`)

  const binding = bindWorkspaceRuntime(args)
  try {
    const runArgs = domainRunArgs(spec, args)
    const data = await spec.run(runArgs)
    return {
      schema: 'movscript.command_result.v1',
      status: 'ok',
      commandId: spec.commandId,
      mcpToolName: spec.mcpToolName,
      contract: commandExecutionContract(spec),
      data,
      debug: {
        cli_argv: domainDebugCliArgv(spec, args),
        cwd: process.cwd(),
        ...(binding.backendEndpoint ? { runtime_endpoint: binding.backendEndpoint } : {}),
        ...(binding.projectServiceEndpoint ? { project_service_endpoint: binding.projectServiceEndpoint } : {}),
      },
    }
  } finally {
    binding.restore?.()
  }
}

function domainRunArgs(spec: DomainCommandSpec, args: Record<string, unknown>): Record<string, unknown> {
  if (spec.commandId !== 'domain.get_model') return args
  if (hasWorkspaceProjectLocator(args)) return args
  return { ...args, cwd: process.cwd() }
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
        ...(binding.mediaPipelineServiceEndpoint ? { media_pipeline_service_endpoint: binding.mediaPipelineServiceEndpoint } : {}),
        ...(binding.projectServiceEndpoint ? { project_service_endpoint: binding.projectServiceEndpoint } : {}),
      },
    }
  } finally {
    binding.restore?.()
  }
}

export async function runMovScriptProductionEditingCommand(
  specOrName: ProductionEditingCommandSpec | string,
  args: Record<string, unknown> = {},
): Promise<MovScriptCommandExecution> {
  const spec = typeof specOrName === 'string'
    ? productionEditingCommandByMCPToolName.get(specOrName) ?? productionEditingCommandById.get(specOrName)
    : specOrName
  if (!spec) throw new Error(`Unknown production editing command: ${specOrName}`)

  const binding = bindWorkspaceRuntime(args)
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
        cli_argv: productionEditingDebugCliArgv(spec, args),
        cwd: process.cwd(),
        ...(binding.backendEndpoint ? { runtime_endpoint: binding.backendEndpoint } : {}),
        ...(binding.projectServiceEndpoint ? { project_service_endpoint: binding.projectServiceEndpoint } : {}),
      },
    }
  } finally {
    binding.restore?.()
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
  const homeRuntimeGatewayEndpoint = endpointURL(
    findRuntimeEndpoint(runtimeHome, RUNTIME_GATEWAY_SERVICE)
      ?? findRuntimeService(runtimeHome, RUNTIME_GATEWAY_SERVICE)?.endpoint
      ?? findRuntimeEndpoint(runtimeHome, CLOUD_RUNTIME_GATEWAY_SERVICE)
      ?? findRuntimeService(runtimeHome, CLOUD_RUNTIME_GATEWAY_SERVICE)?.endpoint
      ?? findRuntimeEndpoint(runtimeHome, EXTERNAL_RUNTIME_GATEWAY_SERVICE)
      ?? findRuntimeService(runtimeHome, EXTERNAL_RUNTIME_GATEWAY_SERVICE)?.endpoint,
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
  const runtimeGatewayBaseURL = homeRuntimeGatewayEndpoint ? normalizeBaseURL(homeRuntimeGatewayEndpoint) : undefined
  const localProbe = await probeBackend(localBackendURL, timeoutMs)
  const configuredProbe = configuredBaseURL === localBackendURL
    ? localProbe
    : await probeBackend(configuredBaseURL, timeoutMs)
  const cloudAuth = findCloudAuth(workspaceDir)
  const cloudBaseURL = configuredIsLocal ? cloudAuth.baseURL ?? runtimeGatewayBaseURL : configuredBaseURL
  const cloudProbe = cloudBaseURL && cloudBaseURL !== localBackendURL && cloudBaseURL !== configuredBaseURL
    ? await probeBackend(cloudBaseURL, timeoutMs)
    : configuredIsLocal ? { available: false } : configuredProbe
  const project = inspectProjectSource(projectDir)
  const mediaPipeline = mediaPipelineRuntimeStatus(runtimeHome)
  const localNode = localNodeRuntimeStatus(runtimeHome)
  const surfaceHost = surfaceHostRuntimeStatus(runtimeHome)
  const desktop = await probeDesktop(timeoutMs, runtimeHome)
  const localAvailable = localProbe.available
  const cloudConfigured = Boolean(cloudBaseURL || runtimeGatewayBaseURL || cloudAuth.authenticated || (!configuredIsLocal && configuredSession.token))
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
    surfaceProjectKey: stringValue(
      args.surfaceProjectKey
      ?? args.surface_project_key
      ?? args.routeProjectKey
      ?? args.route_project_key
      ?? args.projectKey
      ?? args.project_key
      ?? args.projectId
      ?? args.project_id,
    ),
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
        ...(runtimeGatewayBaseURL ? { runtimeGatewayBaseURL } : {}),
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
    runtimeGateway: {
      available: Boolean(endpoints.mcp),
      gateways: runtimeGatewaySummaries(endpoints),
      ...(endpoints.mcp ? { mcpEndpoint: endpoints.mcp } : {}),
    },
    endpoints,
    home: runtimeHomeSummary(runtimeHome),
    recommendedNextTool: daemonAvailable ? 'runtime_descriptor_get' : 'runtime_daemon_ensure',
  }
}

async function runtimeDescriptorGet(args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const status = await runtimeStatus(args)
  return await fetchCanonicalRuntimeDescriptorFromStatus(status) ?? runtimeDescriptorFromStatus(status)
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

async function runtimeDoctor(args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const preflight = await runtimePreflightCheck(args)
  const recommendedNextCommands = runtimeDoctorRecommendedNextCommands(preflight)
  return {
    schema: 'movscript.runtime_doctor.v1',
    status: preflight.status,
    ready: preflight.ready,
    blockers: preflight.blockers,
    warnings: preflight.warnings,
    checks: preflight.checks,
    descriptor: preflight.descriptor,
    recommendedNextCommands,
    recommended_next_commands: recommendedNextCommands,
  }
}

function runtimeDoctorRecommendedNextCommands(preflight: Record<string, unknown>): string[][] {
  const checks = Array.isArray(preflight.checks) ? preflight.checks.filter(isRecord) : []
  const blocked = new Set(checks.filter((check) => check.status === 'blocked').map((check) => stringValue(check.id)).filter(Boolean))
  const warnings = new Set(checks.filter((check) => check.status === 'warning').map((check) => stringValue(check.id)).filter(Boolean))
  const commands: string[][] = []
  if (blocked.has('backend') || warnings.has('daemon')) commands.push(['movscript', 'daemon', 'ensure', '--json'])
  if (blocked.has('project_source')) commands.push(['movscript', 'project', 'init', '--json'])
  if (warnings.has('surface_host')) commands.push(['movscript', 'runtime', 'status', '--json'])
  if (warnings.has('media_pipeline')) commands.push(['movscript', 'editing', 'runtime', 'capabilities', 'get', '--json'])
  if (commands.length === 0) commands.push(['movscript', 'system', 'production', 'workflow', '--json'])
  return commands
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
    ?? stringValue(cloudBackend.runtimeGatewayBaseURL)
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

async function fetchCanonicalRuntimeDescriptorFromStatus(status: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
  const backend = recordValue(status.backend)
  const localBackend = recordValue(backend.local)
  const cloudBackend = recordValue(backend.cloud)
  const gatewayEndpoint = stringValue(localBackend.gatewayBaseURL)
    ?? stringValue(cloudBackend.runtimeGatewayBaseURL)
  if (!gatewayEndpoint) return undefined
  return fetchCanonicalRuntimeDescriptor(gatewayEndpoint)
}

async function fetchCanonicalRuntimeDescriptor(gatewayBaseURL: string): Promise<Record<string, unknown> | undefined> {
  try {
    const response = await fetch(`${normalizeBaseURL(gatewayBaseURL)}/v1/runtime/descriptor`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return undefined
    const payload = await response.json().catch(() => undefined)
    if (!isRecord(payload) || payload.schema !== 'movscript.runtime-descriptor.v1') return undefined
    return payload
  } catch {
    return undefined
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
  setEndpoint(endpoints, 'runtimeGateway', runtimeHome, RUNTIME_GATEWAY_SERVICE)
  setEndpoint(endpoints, 'cloudRuntimeGateway', runtimeHome, CLOUD_RUNTIME_GATEWAY_SERVICE)
  setEndpoint(endpoints, 'externalRuntimeGateway', runtimeHome, EXTERNAL_RUNTIME_GATEWAY_SERVICE)
  setEndpoint(endpoints, 'gateway', runtimeHome, LOCAL_NODE_GATEWAY_SERVICE)
  setEndpoint(endpoints, 'dataService', runtimeHome, DATA_SERVICE)
  setEndpoint(endpoints, 'projectService', runtimeHome, PROJECT_SERVICE)
  setEndpoint(endpoints, 'editingService', runtimeHome, EDITING_SERVICE)
  setEndpoint(endpoints, 'surfaceHost', runtimeHome, LOCAL_SURFACE_HOST_SERVICE)
  setEndpoint(endpoints, 'mediaPipeline', runtimeHome, MEDIA_PIPELINE_SERVICE)
  const gateway = endpoints.runtimeGateway
    ?? endpoints.cloudRuntimeGateway
    ?? endpoints.externalRuntimeGateway
    ?? endpoints.gateway
  if (gateway) endpoints.mcp = runtimeMcpEndpoint(gateway)
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
  const trimmed = baseURL.trim()
  if (trimmed.endsWith('/v1/mcp')) return trimmed
  if (trimmed.endsWith('/mcp')) return trimmed
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

type RuntimeGatewayKind = 'runtime' | 'cloud' | 'external'

function runtimeGatewayConfigure(args: Record<string, unknown> = {}): Record<string, unknown> {
  const homeDir = resolveRuntimeHomeArg(args)
  const gatewayBaseURL = stringValue(
    args.gatewayBaseURL
      ?? args.gateway_base_url
      ?? args.baseURL
      ?? args.base_url
      ?? args.backendBaseURL
      ?? args.backend_base_url,
  )
  if (!gatewayBaseURL) throw new Error('runtime gateway configure requires gatewayBaseURL')
  const kind = runtimeGatewayKind(args)
  const serviceName = runtimeGatewayServiceName(kind)
  const baseURL = normalizeBaseURL(gatewayBaseURL)
  const mcpEndpoint = runtimeMcpEndpoint(baseURL)
  const healthURL = stringValue(args.healthURL ?? args.health_url) ?? `${baseURL}/v1/mcp/health`
  const instanceId = stringValue(args.instanceId ?? args.instance_id) ?? `${serviceName}.default`
  const path = writeRuntimeEndpointRecord(homeDir, {
    serviceName,
    applicationId: runtimeGatewayApplicationId(kind),
    instanceId,
    baseURL,
    healthURL,
    protocol: urlProtocol(baseURL),
    status: 'ready',
    ready: true,
    metadata: {
      kind,
      role: 'runtime-gateway',
      mcpEndpoint,
    },
  })

  return {
    schema: 'movscript.runtime_gateway_config.v1',
    status: 'configured',
    homeDir,
    gateway: {
      kind,
      serviceName,
      instanceId,
      baseURL,
      mcpEndpoint,
      healthURL,
      recordPath: path,
    },
  }
}

function runtimeGatewayStatus(args: Record<string, unknown> = {}): Record<string, unknown> {
  const homeDir = resolveRuntimeHomeArg(args)
  const runtimeHome = readRuntimeHomeSnapshot(homeDir)
  const endpoints = runtimeDiscoveredEndpoints(runtimeHome)
  const gateways = runtimeGatewaySummaries(endpoints)

  return {
    schema: 'movscript.runtime_gateway_status.v1',
    status: gateways.length > 0 ? 'ready' : 'missing',
    homeDir,
    gateways,
    endpoints,
    home: runtimeHomeSummary(runtimeHome),
  }
}

function runtimeGatewayKind(args: Record<string, unknown>): RuntimeGatewayKind {
  const value = stringValue(args.gatewayKind ?? args.gateway_kind ?? args.dataPlane ?? args.data_plane) ?? 'runtime'
  if (value === 'runtime' || value === 'cloud' || value === 'external') return value
  throw new Error(`invalid runtime gateway kind: ${value}`)
}

function runtimeGatewayServiceName(kind: RuntimeGatewayKind): string {
  if (kind === 'cloud') return CLOUD_RUNTIME_GATEWAY_SERVICE
  if (kind === 'external') return EXTERNAL_RUNTIME_GATEWAY_SERVICE
  return RUNTIME_GATEWAY_SERVICE
}

function runtimeGatewayApplicationId(kind: RuntimeGatewayKind): string {
  if (kind === 'cloud') return 'movscript.cloud-runtime'
  if (kind === 'external') return 'movscript.external-runtime'
  return 'movscript.runtime'
}

function runtimeGatewaySummaries(endpoints: Record<string, string>): Array<Record<string, unknown>> {
  return [
    runtimeGatewaySummary('runtime', RUNTIME_GATEWAY_SERVICE, endpoints.runtimeGateway),
    runtimeGatewaySummary('cloud', CLOUD_RUNTIME_GATEWAY_SERVICE, endpoints.cloudRuntimeGateway),
    runtimeGatewaySummary('external', EXTERNAL_RUNTIME_GATEWAY_SERVICE, endpoints.externalRuntimeGateway),
    runtimeGatewaySummary('local-daemon', LOCAL_NODE_GATEWAY_SERVICE, endpoints.gateway),
  ].filter((item): item is Record<string, unknown> => Boolean(item))
}

function runtimeGatewaySummary(kind: string, serviceName: string, endpoint: string | undefined): Record<string, unknown> | undefined {
  if (!endpoint) return undefined
  return {
    kind,
    serviceName,
    endpoint,
    mcpEndpoint: runtimeMcpEndpoint(endpoint),
  }
}

function urlProtocol(value: string): 'http' | 'https' | undefined {
  try {
    const protocol = new URL(value).protocol.replace(/:$/, '')
    return protocol === 'http' || protocol === 'https' ? protocol : undefined
  } catch {
    return undefined
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
  surfaceProjectKey?: string
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
  const projectKey = input.surfaceProjectKey
    ?? stringValue(input.project.projectUid)
    ?? safeProjectKeyFromDir(input.projectDir)
  const commonQuery: Record<string, string> = {
    source: 'runtime-status',
    projectKey,
    projectId: projectKey,
    projectDir: input.projectDir,
  }
  if (input.productionId) commonQuery.productionId = input.productionId
  for (const [key, value] of Object.entries(input.focusQuery ?? {})) {
    commonQuery[key] = value
  }

  const home = localSurfaceURL(baseURL, '/', commonQuery)
  const projectOverview = localSurfaceURL(baseURL, `/studio/${encodeURIComponent(projectKey)}/overview`, commonQuery)
  const projectContent = localSurfaceURL(baseURL, `/studio/${encodeURIComponent(projectKey)}/content`, commonQuery)
  const projectTimeline = localSurfaceURL(baseURL, `/studio/${encodeURIComponent(projectKey)}/timeline`, commonQuery)
  const canvas = localSurfaceURL(baseURL, '/canvases', { source: 'runtime-status' })
  const editing = localSurfaceURL(baseURL, '/editing', commonQuery)
  const admin = localSurfaceURL(baseURL, '/admin/overview', { source: 'runtime-status' })

  const primary = input.project.isMovScriptProject
    ? runtimeSurfaceLink({
        title: 'MovScript project overview',
        surface: 'project.overview',
        route: `/studio/${encodeURIComponent(projectKey)}/overview`,
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
      route: `/studio/${encodeURIComponent(projectKey)}/content`,
      url: projectContent,
      usage: 'Open this URL to inspect content units and project content state.',
    }),
    runtimeSurfaceLink({
      title: 'MovScript project timeline',
      surface: 'project.timeline',
      route: `/studio/${encodeURIComponent(projectKey)}/timeline`,
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

function safeProjectKeyFromDir(projectDir: string): string {
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
  const workspaceDirInput = stringValue(args.workspaceDir ?? args.workspace_dir)
    ?? stringValue(args.projectDir ?? args.project_dir)
    ?? stringValue(args.cwd)
    ?? process.env.MOVSCRIPT_WORKSPACE_DIR
  const workspaceDir = workspaceDirInput ? resolve(workspaceDirInput) : undefined
  const homeDir = resolveRuntimeHomeArg(args)
  const defaultWorkspaceDir = workspaceDir ?? homeDir
  setMovScriptBackendDefaultWorkspaceDir(defaultWorkspaceDir)

  const token = stringValue(args.token)
  if (token) setMovScriptBackendRuntimeAuthToken(token)

  const explicitBackend = stringValue(args.backendBaseURL ?? args.backend_base_url ?? args.server)
  if (explicitBackend) {
    setMovScriptBackendAPIBaseURL(explicitBackend)
    return { backendEndpoint: explicitBackend }
  }

  const configuredSession = resolveMovScriptBackendSession({ workspaceDir: defaultWorkspaceDir })
  setMovScriptBackendDefaultWorkspaceDir(configuredSession.workspaceDir)
  const hasConfiguredBackend = Boolean(process.env.MOVSCRIPT_API_BASE_URL) || existsSync(configuredSession.configPath)
  if (hasConfiguredBackend) {
    setMovScriptBackendAPIBaseURL(configuredSession.baseURL)
    return { backendEndpoint: configuredSession.baseURL }
  }

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
  if (backendEndpoint) return { backendEndpoint }
  return {}
}

const bindAdminBackendRuntime = bindBackendRuntime

function bindWorkspaceRuntime(args: Record<string, unknown>): { backendEndpoint?: string; projectServiceEndpoint?: string; restore?: () => void } {
  const backendBinding = bindBackendRuntime(args)
  const projectServiceEndpoint = workspaceProjectServiceEndpoint(args)
  if (!projectServiceEndpoint) return backendBinding

  if (!backendBinding.backendEndpoint) {
    setMovScriptBackendAPIBaseURL(projectServiceEndpoint)
  }
  const previousURL = process.env.MOVSCRIPT_PROJECT_SERVICE_URL
  process.env.MOVSCRIPT_PROJECT_SERVICE_URL = projectServiceEndpoint
  return {
    ...backendBinding,
    backendEndpoint: backendBinding.backendEndpoint ?? projectServiceEndpoint,
    projectServiceEndpoint,
    restore: () => restoreOptionalEnv('MOVSCRIPT_PROJECT_SERVICE_URL', previousURL),
  }
}

function bindEditingRuntime(args: Record<string, unknown>): { backendEndpoint?: string; editingServiceEndpoint?: string; mediaPipelineServiceEndpoint?: string; projectServiceEndpoint?: string; restore?: () => void } {
  const backendBinding = bindBackendRuntime(args)
  const editingServiceEndpoint = editingServiceEndpointFromRuntime(args)
  const mediaPipelineServiceEndpoint = mediaPipelineServiceEndpointFromRuntime(args)
  const projectServiceEndpoint = workspaceProjectServiceEndpoint(args)
  if (!editingServiceEndpoint && !mediaPipelineServiceEndpoint && !projectServiceEndpoint) return backendBinding

  const previousEditingURL = process.env.MOVSCRIPT_EDITING_SERVICE_URL
  const previousMediaPipelineURL = process.env.MOVSCRIPT_MEDIA_PIPELINE_URL
  const previousProjectURL = process.env.MOVSCRIPT_PROJECT_SERVICE_URL
  if (editingServiceEndpoint) process.env.MOVSCRIPT_EDITING_SERVICE_URL = editingServiceEndpoint
  if (mediaPipelineServiceEndpoint) process.env.MOVSCRIPT_MEDIA_PIPELINE_URL = mediaPipelineServiceEndpoint
  if (projectServiceEndpoint) process.env.MOVSCRIPT_PROJECT_SERVICE_URL = projectServiceEndpoint
  return {
    ...backendBinding,
    ...(editingServiceEndpoint ? { editingServiceEndpoint } : {}),
    ...(mediaPipelineServiceEndpoint ? { mediaPipelineServiceEndpoint } : {}),
    ...(projectServiceEndpoint ? { projectServiceEndpoint } : {}),
    restore: () => {
      restoreOptionalEnv('MOVSCRIPT_EDITING_SERVICE_URL', previousEditingURL)
      restoreOptionalEnv('MOVSCRIPT_MEDIA_PIPELINE_URL', previousMediaPipelineURL)
      restoreOptionalEnv('MOVSCRIPT_PROJECT_SERVICE_URL', previousProjectURL)
    },
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

function adminResourceAccessRouteDiagnosePayload(args: Record<string, unknown>): Record<string, unknown> {
  const explicit = adminPayload(args)
  if (Object.keys(explicit).length > 0) return explicit
  const routeID = args.routeID ?? args.routeId ?? args.route_id
  return compactObject({
    route_id: numberValue(routeID) ?? stringValue(routeID),
    purpose: stringValue(args.purpose),
    required_media_type: stringValue(args.requiredMediaType ?? args.required_media_type ?? args.mediaType ?? args.media_type),
    transport: stringValue(args.transport),
    profile_id: stringValue(args.profileID ?? args.profileId ?? args.profile_id),
  })
}

function adminGenerationToolCallPayload(args: Record<string, unknown>): Record<string, unknown> {
  const explicit = adminPayload(args)
  if (Object.keys(explicit).length > 0) return explicit
  return compactObject({
    tool_type: stringValue(args.toolType ?? args.tool_type),
    server_id: stringValue(args.toolServerID ?? args.toolServerId ?? args.tool_server_id ?? args.serverID ?? args.serverId ?? args.server_id),
    server_scope: stringValue(args.toolServerScope ?? args.tool_server_scope ?? args.serverScope ?? args.server_scope),
    operation: stringValue(args.operation),
    path: stringValue(args.toolPath ?? args.tool_path ?? args.path),
    workflow: isRecord(args.workflow) ? args.workflow : undefined,
    payload: isRecord(args.toolPayload ?? args.tool_payload) ? (args.toolPayload ?? args.tool_payload) : undefined,
    client_id: stringValue(args.clientID ?? args.clientId ?? args.client_id),
    prompt_id: stringValue(args.promptID ?? args.promptId ?? args.prompt_id),
    filename: stringValue(args.filename),
    subfolder: stringValue(args.subfolder),
    file_type: stringValue(args.fileType ?? args.file_type),
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
  appendPathArg(argv, args, ['providerInstanceID', 'providerInstanceId', 'provider_instance_id'], '--provider-instance-id')
  appendPathArg(argv, args, ['credentialKey', 'credential_key'], '--credential-key')
  appendPathArg(argv, args, ['catalogEntryID', 'catalogEntryId', 'catalog_entry_id'], '--catalog-entry-id')
  appendPathArg(argv, args, ['bindingID', 'bindingId', 'binding_id'], '--binding-id')
  appendPathArg(argv, args, ['keyID', 'keyId', 'key_id'], '--key-id')
  appendPathArg(argv, args, ['cloudFileConfigID', 'cloudFileConfigId', 'cloud_file_config_id'], '--cloud-file-config-id')
  appendPathArg(argv, args, ['resourceID', 'resourceId', 'resource_id'], '--resource-id')
  appendPathArg(argv, args, ['requiredMediaType', 'required_media_type', 'mediaType', 'media_type'], '--required-media-type')
  appendPathArg(argv, args, ['profileID', 'profileId', 'profile_id'], '--profile-id')
  appendPathArg(argv, args, ['transport'], '--transport')
  appendPathArg(argv, args, ['purpose'], '--purpose')
  appendPathArg(argv, args, ['routeID', 'routeId', 'route_id'], '--route-id')
  appendPathArg(argv, args, ['toolType', 'tool_type'], '--tool-type')
  appendPathArg(argv, args, ['toolServerID', 'toolServerId', 'tool_server_id', 'serverID', 'serverId', 'server_id'], '--tool-server-id')
  appendPathArg(argv, args, ['toolServerScope', 'tool_server_scope', 'serverScope', 'server_scope'], '--tool-server-scope')
  appendPathArg(argv, args, ['operation'], '--operation')
  appendPathArg(argv, args, ['toolPath', 'tool_path', 'path'], '--tool-path')
  appendPathArg(argv, args, ['clientID', 'clientId', 'client_id'], '--client-id')
  appendPathArg(argv, args, ['promptID', 'promptId', 'prompt_id'], '--prompt-id')
  appendPathArg(argv, args, ['filename'], '--filename')
  appendPathArg(argv, args, ['subfolder'], '--subfolder')
  appendPathArg(argv, args, ['fileType', 'file_type'], '--file-type')
  appendPathArg(argv, args, ['id'], '--id')
  if (isRecord(args.query)) {
    for (const [key, value] of Object.entries(args.query)) {
      argv.push('--query', `${key}=${String(value)}`)
    }
  }
  if (args.payload !== undefined || args.body !== undefined) argv.push('--payload', '<json>')
  if (args.workflow !== undefined) argv.push('--workflow', '<json>')
  if (args.toolPayload !== undefined || args.tool_payload !== undefined) argv.push('--tool-payload', '<json>')
  if (args.yes === true) argv.push('--yes')
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
  appendPathArg(argv, args, ['gatewayBaseURL', 'gateway_base_url', 'baseURL', 'base_url'], '--gateway-base-url')
  appendPathArg(argv, args, ['gatewayKind', 'gateway_kind'], '--gateway-kind')
  appendPathArg(argv, args, ['instanceId', 'instance_id'], '--instance-id')
  appendPathArg(argv, args, ['healthURL', 'health_url'], '--health-url')
  appendPathArg(argv, args, ['projectId', 'project_id'], '--project-id')
  appendPathArg(argv, args, ['productionId', 'production_id'], '--production-id')
  appendPathArg(argv, args, ['scopeKind', 'scope_kind'], '--scope-kind')
  appendPathArg(argv, args, ['scopeRef', 'scope_ref'], '--scope-ref')
  appendPathArg(argv, args, ['targetKind', 'target_kind'], '--target-kind')
  appendPathArg(argv, args, ['targetRef', 'target_ref'], '--target-ref')
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
  const argv = spec.productCliPath
    ? ['movscript', ...spec.productCliPath, '--json']
    : ['movscript', 'system', ...spec.cliPath, '--json']
  appendRuntimeArgv(argv, args)
  appendPathArg(argv, args, ['mediaPipelineServiceURL', 'media_pipeline_service_url'], '--media-pipeline-service-url')
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
  appendPathArg(argv, args, ['result_id', 'resultId'], '--result-id')
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
  appendJSONArg(argv, args, ['result'], '--result')
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

function domainDebugCliArgv(spec: DomainCommandSpec, args: Record<string, unknown>): string[] {
  const argv = ['movscript', 'domain', ...spec.cliPath, '--json']
  appendRuntimeArgv(argv, args)
  appendPathArg(argv, args, ['projectServiceURL', 'project_service_url'], '--project-service-url')
  appendPathArg(argv, args, ['providerScopeId', 'provider_scope_id', 'providerProjectId', 'provider_project_id'], '--provider-scope-id')
  appendPathArg(argv, args, ['projectId', 'project_id'], '--project-id')
  appendPathArg(argv, args, ['projectUid', 'project_uid'], '--project-uid')
  appendPathArg(argv, args, ['projectTitle', 'project_title'], '--project-title')
  appendPathArg(argv, args, ['scopeKind', 'scope_kind'], '--scope-kind')
  appendPathArg(argv, args, ['scopeId', 'scope_id'], '--scope-id')
  appendPathArg(argv, args, ['userId', 'user_id', 'user'], '--user')
  appendPathArg(argv, args, ['orgId', 'org_id', 'org'], '--org')
  appendPathArg(argv, args, ['entityKind', 'entity_kind'], '--entity-kind')
  appendPathArg(argv, args, ['entityId', 'entity_id'], '--entity-id')
  appendPathArg(argv, args, ['query', 'q'], '--query')
  appendPathArg(argv, args, ['productionId', 'production_id'], '--production-id')
  appendPathArg(argv, args, ['segmentId', 'segment_id'], '--segment-id')
  appendPathArg(argv, args, ['sceneMomentId', 'scene_moment_id'], '--scene-moment-id')
  appendPathArg(argv, args, ['expressionUnitId', 'expression_unit_id'], '--expression-unit-id')
  appendPathArg(argv, args, ['storyboardId', 'storyboard_id'], '--storyboard-id')
  appendPathArg(argv, args, ['contentUnitId', 'content_unit_id'], '--content-unit-id')
  appendPathArg(argv, args, ['settingId', 'setting_id'], '--setting-id')
  appendPathArg(argv, args, ['settingStateId', 'setting_state_id'], '--setting-state-id')
  appendPathArg(argv, args, ['assetId', 'asset_id'], '--asset-id')
  appendPathArg(argv, args, ['candidateId', 'candidate_id'], '--candidate-id')
  appendPathArg(argv, args, ['resourceId', 'resource_id'], '--resource-id')
  appendPathArg(argv, args, ['outputKind', 'output_kind'], '--output-kind')
  appendPathArg(argv, args, ['kind'], '--kind')
  appendPathArg(argv, args, ['source'], '--source')
  appendPathArg(argv, args, ['status'], '--status')
  appendPathArg(argv, args, ['mimeType', 'mime_type'], '--mime-type')
  appendPathArg(argv, args, ['width'], '--width')
  appendPathArg(argv, args, ['height'], '--height')
  appendPathArg(argv, args, ['durationSec', 'duration_sec'], '--duration-sec')
  appendPathArg(argv, args, ['decision'], '--decision')
  appendPathArg(argv, args, ['stalePolicy', 'stale_policy'], '--stale-policy')
  appendPathArg(argv, args, ['reason'], '--reason')
  appendPathArg(argv, args, ['decidedAt', 'decided_at'], '--decided-at')
  appendPathArg(argv, args, ['limit'], '--limit')
  appendPathArg(argv, args, ['commit'], '--commit')
  appendPathArg(argv, args, ['checkpointHash', 'checkpoint_hash'], '--checkpoint-hash')
  appendPathArg(argv, args, ['projectName', 'project_name'], '--project-name')
  appendPathArg(argv, args, ['sceneName', 'scene_name'], '--scene-name')
  appendPathArg(argv, args, ['defaultDurationSec', 'default_duration_sec'], '--default-duration-sec')
  appendPathArg(argv, args, ['target'], '--target')
  appendPathArg(argv, args, ['targetKind', 'target_kind'], '--target-kind')
  appendPathArg(argv, args, ['provider', 'provider_id'], '--provider')
  appendPathArg(argv, args, ['providerKey', 'provider_key'], '--provider-key')
  appendPathArg(argv, args, ['model', 'model_id', 'public_model_id', 'publicModelId'], '--model')
  appendPathArg(argv, args, ['groupId', 'group_id', 'groupRef', 'group_ref'], '--group-id')
  appendPathArg(argv, args, ['assetGroupId', 'asset_group_id'], '--asset-group-id')
  appendPathArg(argv, args, ['assetGroupName', 'asset_group_name'], '--asset-group-name')
  appendPathArg(argv, args, ['sourceUrl', 'source_url', 'url'], '--source-url')
  appendPathArg(argv, args, ['name'], '--name')
  appendPathArg(argv, args, ['timeoutMs', 'timeout_ms'], '--timeout-ms')
  appendPathArg(argv, args, ['nonce'], '--nonce')
  appendPathArg(argv, args, ['targetPath', 'target_path'], '--target-path')
  appendPathArg(argv, args, ['namespacePath', 'namespace_path'], '--namespace-path')
  appendPathArg(argv, args, ['timelineNamespacePath', 'timeline_namespace_path'], '--timeline-namespace-path')
  appendPathArg(argv, args, ['parentPath', 'parent_path'], '--parent-path')
  appendPathArg(argv, args, ['expressionUnitPath', 'expression_unit_path'], '--expression-unit-path')
  appendPathArg(argv, args, ['sceneMomentPath', 'scene_moment_path'], '--scene-moment-path')
  appendPathArg(argv, args, ['keyframeId', 'keyframe_id'], '--keyframe-id')
  appendPathArg(argv, args, ['audioCueId', 'audio_cue_id'], '--audio-cue-id')
  appendPathArg(argv, args, ['scriptId', 'script_id'], '--script-id')
  appendPathArg(argv, args, ['versionId', 'version_id'], '--version-id')
  appendPathArg(argv, args, ['versionLabel', 'version_label'], '--version-label')
  appendPathArg(argv, args, ['sourceText', 'source_text'], '--source-text')
  appendPathArg(argv, args, ['sourcePath', 'source_path'], '--source-path')
  appendJSONArg(argv, args, ['include'], '--include')
  appendJSONArg(argv, args, ['payload'], '--payload')
  appendJSONArg(argv, args, ['record'], '--record')
  appendJSONArg(argv, args, ['entity'], '--entity')
  appendJSONArg(argv, args, ['projectStyle', 'project_style'], '--project-style')
  appendJSONArg(argv, args, ['setting'], '--setting')
  appendJSONArg(argv, args, ['states'], '--states')
  appendJSONArg(argv, args, ['unit'], '--unit')
  appendJSONArg(argv, args, ['namespace'], '--namespace')
  appendJSONArg(argv, args, ['root'], '--root')
  appendJSONArg(argv, args, ['tree'], '--tree')
  appendJSONArg(argv, args, ['nodes'], '--nodes')
  appendJSONArg(argv, args, ['namespaces'], '--namespaces')
  appendJSONArg(argv, args, ['timelineNamespaces', 'timeline_namespaces'], '--timeline-namespaces')
  appendJSONArg(argv, args, ['production'], '--production')
  appendJSONArg(argv, args, ['segments'], '--segments')
  appendJSONArg(argv, args, ['contentUnits', 'content_units'], '--content-units')
  appendJSONArg(argv, args, ['segment'], '--segment')
  appendJSONArg(argv, args, ['sceneMoment', 'scene_moment'], '--scene-moment')
  appendJSONArg(argv, args, ['keyframe'], '--keyframe')
  appendJSONArg(argv, args, ['storyboard'], '--storyboard')
  appendJSONArg(argv, args, ['audioCue', 'audio_cue'], '--audio-cue')
  appendJSONArg(argv, args, ['expressionUnit', 'expression_unit'], '--expression-unit')
  appendJSONArg(argv, args, ['editPrompt', 'edit_prompt'], '--edit-prompt')
  appendJSONArg(argv, args, ['transition'], '--transition')
  appendJSONArg(argv, args, ['timeline'], '--timeline')
  appendJSONArg(argv, args, ['outputs'], '--outputs')
  appendJSONArg(argv, args, ['items'], '--items')
  appendJSONArg(argv, args, ['producer'], '--producer')
  appendJSONArg(argv, args, ['promptSnapshot', 'prompt_snapshot'], '--prompt-snapshot')
  appendJSONArg(argv, args, ['metadata'], '--metadata')
  appendJSONArg(argv, args, ['targetRecord', 'target_record'], '--target-record')
  if (args.continueOnError === true || args.continue_on_error === true) argv.push('--continue-on-error')
  if (args.allowPrivateUrls === true || args.allow_private_urls === true) argv.push('--allow-private-urls')
  if (args.lock === true) argv.push('--lock')
  return argv
}

function editingDebugCliArgv(spec: EditingCommandSpec, args: Record<string, unknown>): string[] {
  const argv = ['movscript', 'editing', ...spec.cliPath, '--json']
  appendRuntimeArgv(argv, args)
  appendPathArg(argv, args, ['editingServiceURL', 'editing_service_url'], '--editing-service-url')
  appendPathArg(argv, args, ['mediaPipelineServiceURL', 'media_pipeline_service_url'], '--media-pipeline-service-url')
  appendPathArg(argv, args, ['projectServiceURL', 'project_service_url'], '--project-service-url')
  appendJSONArg(argv, args, ['editingProject', 'editing_project', 'project'], '--editing-project')
  appendPathArg(argv, args, ['editingProjectId', 'editing_project_id'], '--editing-project-id')
  appendPathArg(argv, args, ['mediaProjectId', 'media_project_id'], '--media-project-id')
  appendPathArg(argv, args, ['projectId', 'project_id'], '--project-id')
  appendPathArg(argv, args, ['taskId', 'task_id'], '--task-id')
  appendPathArg(argv, args, ['resultId', 'result_id'], '--result-id')
  appendPathArg(argv, args, ['watchId', 'watch_id'], '--watch-id')
  appendPathArg(argv, args, ['title'], '--title')
  appendPathArg(argv, args, ['name'], '--name')
  appendPathArg(argv, args, ['outputPath', 'output_path'], '--output-path')
  appendPathArg(argv, args, ['outputDirectory', 'output_directory', 'watchDirectory', 'watch_directory', 'exportDirectory', 'export_directory'], '--output-directory')
  appendPathArg(argv, args, ['waitForMs', 'wait_for_ms'], '--wait-for-ms')
  appendPathArg(argv, args, ['timeoutMs', 'timeout_ms'], '--timeout-ms')
  appendPathArg(argv, args, ['pollIntervalMs', 'poll_interval_ms'], '--poll-interval-ms')
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
  appendPathArg(argv, args, ['backend'], '--backend')
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
  appendPathArg(argv, args, ['limit'], '--limit')
  appendPathArg(argv, args, ['renderRuntime', 'render_runtime'], '--render-runtime')
  appendPathArg(argv, args, ['format'], '--format')
  appendPathArg(argv, args, ['target'], '--target')
  appendPathArg(argv, args, ['mode'], '--mode')
  appendPathArg(argv, args, ['operation'], '--operation')
  appendPathArg(argv, args, ['tool'], '--tool')
  appendPathArg(argv, args, ['durationSec', 'duration_sec'], '--duration-sec')
  appendPathArg(argv, args, ['exchangeProjectPath', 'exchange_project_path'], '--exchange-project-path')
  appendPathArg(argv, args, ['externalApp', 'external_app', 'externalNle', 'external_nle'], '--external-app')
  appendPathArg(argv, args, ['appName', 'app_name', 'application', 'applicationName', 'application_name'], '--app-name')
  appendPathArg(argv, args, ['platform'], '--platform')
  appendPathArg(argv, args, ['reviewer'], '--reviewer')
  appendPathArg(argv, args, ['reviewStatus', 'review_status'], '--review-status')
  appendJSONArg(argv, args, ['source'], '--source')
  appendJSONArg(argv, args, ['output'], '--output')
  appendJSONArg(argv, args, ['result'], '--result')
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
  if (args.importToResource === true || args.import_to_resource === true) argv.push('--import-to-resource')
  if (args.dryRun === true || args.dry_run === true) argv.push('--dry-run')
  return argv
}

function productionEditingDebugCliArgv(spec: ProductionEditingCommandSpec, args: Record<string, unknown>): string[] {
  const argv = ['movscript', 'production', 'editing', ...spec.cliPath, '--json']
  appendRuntimeArgv(argv, args)
  appendPathArg(argv, args, ['projectServiceURL', 'project_service_url'], '--project-service-url')
  appendPathArg(argv, args, ['mediaProjectId', 'media_project_id'], '--media-project-id')
  appendPathArg(argv, args, ['projectId', 'project_id'], '--project-id')
  appendPathArg(argv, args, ['productionId', 'production_id'], '--production-id')
  appendPathArg(argv, args, ['workspaceId', 'workspace_id'], '--workspace-id')
  appendPathArg(argv, args, ['kind', 'workspaceKind', 'workspace_kind'], '--kind')
  appendPathArg(argv, args, ['title', 'name'], '--title')
  appendJSONArg(argv, args, ['seed'], '--seed')
  appendPathArg(argv, args, ['page'], '--page')
  appendPathArg(argv, args, ['pageSize', 'page_size'], '--page-size')
  if (args.includeCandidates === true || args.include_candidates === true) argv.push('--include-candidates')
  if (args.includeUnselected === true || args.include_unselected === true) argv.push('--include-unselected')
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

function mediaPipelineServiceEndpointFromRuntime(args: Record<string, unknown>): string | undefined {
  const explicit = stringValue(
    args.mediaPipelineServiceURL
    ?? args.media_pipeline_service_url
    ?? args.backendBaseURL
    ?? args.backend_base_url
    ?? args.server
    ?? process.env.MOVSCRIPT_MEDIA_PIPELINE_URL
    ?? process.env.MOVSCRIPT_MEDIA_PIPELINE_BASE_URL,
  )
  if (explicit) return explicit

  const homeDir = resolveRuntimeHomeArg(args)
  const runtimeHome = readRuntimeHomeSnapshot(homeDir)
  return endpointURL(
    findRuntimeEndpoint(runtimeHome, MEDIA_PIPELINE_SERVICE)
      ?? findRuntimeService(runtimeHome, MEDIA_PIPELINE_SERVICE)?.endpoint,
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
    surfaceProjectKey: { type: 'string', description: 'Optional project route key to use when constructing surface URLs.' },
    surface_project_key: { type: 'string', description: 'Alias for surfaceProjectKey.' },
    routeProjectKey: { type: 'string', description: 'Alias for surfaceProjectKey.' },
    route_project_key: { type: 'string', description: 'Alias for surfaceProjectKey.' },
    projectKey: { type: 'string', description: 'Alias for surfaceProjectKey.' },
    project_key: { type: 'string', description: 'Alias for surfaceProjectKey.' },
    projectId: { type: 'string', description: 'Deprecated alias for surfaceProjectKey; not a backend project id.' },
    project_id: { type: 'string', description: 'Deprecated alias for surfaceProjectKey; not a backend project id.' },
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
    backendMode: { type: 'string', enum: ['local', 'cloud', 'external'], description: 'Preferred backend mode.' },
    backend_mode: { type: 'string', enum: ['local', 'cloud', 'external'], description: 'Alias for backendMode.' },
    backendBaseURL: { type: 'string', description: 'Backend base URL such as http://localhost:8766 or https://api.example.' },
    backend_base_url: { type: 'string', description: 'Alias for backendBaseURL.' },
    token: { type: 'string', description: 'Bearer token for the selected backend. Prefer environment variables or movscript auth for persistent secrets.' },
    projectDir: { type: 'string', description: 'Project source directory to use as default workspace/project context.' },
    project_dir: { type: 'string', description: 'Alias for projectDir.' },
    workspaceDir: { type: 'string', description: 'Workspace directory to persist backend config under.' },
    workspace_dir: { type: 'string', description: 'Alias for workspaceDir.' },
    remember: { type: 'boolean', description: 'When true, persist backendBaseURL to .movscript/backend/config.json.' },
    clearToken: { type: 'boolean', description: 'When true, clear persisted workspace auth for the selected workspace.' },
    clear_token: { type: 'boolean', description: 'Alias for clearToken.' },
  })
}

function runtimeGatewayConfigureSchema() {
  return objectSchema({
    homeDir: { type: 'string', description: 'Optional MovScript Home directory. Defaults to MOVSCRIPT_HOME or ~/.movscript.' },
    home_dir: { type: 'string', description: 'Alias for homeDir.' },
    movscriptHome: { type: 'string', description: 'Alias for homeDir.' },
    movscript_home: { type: 'string', description: 'Alias for homeDir.' },
    gatewayBaseURL: { type: 'string', description: 'Runtime gateway base URL. The MCP endpoint is derived as /v1/mcp.' },
    gateway_base_url: { type: 'string', description: 'Alias for gatewayBaseURL.' },
    baseURL: { type: 'string', description: 'Alias for gatewayBaseURL.' },
    base_url: { type: 'string', description: 'Alias for gatewayBaseURL.' },
    backendBaseURL: { type: 'string', description: 'Compatibility alias for gatewayBaseURL.' },
    backend_base_url: { type: 'string', description: 'Compatibility alias for gatewayBaseURL.' },
    gatewayKind: { type: 'string', enum: ['runtime', 'cloud', 'external'], description: 'Runtime gateway record kind.' },
    gateway_kind: { type: 'string', enum: ['runtime', 'cloud', 'external'], description: 'Alias for gatewayKind.' },
    dataPlane: { type: 'string', enum: ['cloud', 'external'], description: 'Alias for gatewayKind when registering cloud/external runtime gateways.' },
    data_plane: { type: 'string', enum: ['cloud', 'external'], description: 'Alias for dataPlane.' },
    instanceId: { type: 'string', description: 'Optional endpoint instance id.' },
    instance_id: { type: 'string', description: 'Alias for instanceId.' },
    healthURL: { type: 'string', description: 'Optional gateway health URL. Defaults to /v1/mcp/health.' },
    health_url: { type: 'string', description: 'Alias for healthURL.' },
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

function adminProviderInstanceSchema(includePayload = false) {
  return (includePayload ? adminWriteSchema : adminReadSchema)({
    providerInstanceID: { type: 'string', description: 'Provider instance id, such as provider_type:instance_key.' },
    providerInstanceId: { type: 'string', description: 'Alias for providerInstanceID.' },
    provider_instance_id: { type: 'string', description: 'Alias for providerInstanceID.' },
    id: { type: 'string', description: 'Alias for providerInstanceID.' },
  })
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

function adminCloudFileConfigSchema(includePayload = false) {
  return (includePayload ? adminWriteSchema : adminReadSchema)({
    cloudFileConfigID: { type: ['string', 'number'], description: 'Cloud file configuration id.' },
    cloudFileConfigId: { type: ['string', 'number'], description: 'Alias for cloudFileConfigID.' },
    cloud_file_config_id: { type: ['string', 'number'], description: 'Alias for cloudFileConfigID.' },
    id: { type: ['string', 'number'], description: 'Alias for cloudFileConfigID.' },
  })
}

function adminResourceAccessProfileSchema(includePayload = false) {
  return (includePayload ? adminWriteSchema : adminReadSchema)({
    profileID: { type: 'string', description: 'ResourceAccessProfile id.' },
    profileId: { type: 'string', description: 'Alias for profileID.' },
    profile_id: { type: 'string', description: 'Alias for profileID.' },
    id: { type: 'string', description: 'Alias for profileID.' },
  })
}

function adminResourceAccessRouteDiagnoseSchema() {
  return adminWriteSchema({
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

function adminGenerationToolCallSchema() {
  return adminWriteSchema({
    toolType: { type: 'string', description: 'Generation tool type, such as comfyui or webui.' },
    tool_type: { type: 'string', description: 'Alias for toolType.' },
    toolServerID: { type: 'string', description: 'Optional generation tool server id.' },
    toolServerId: { type: 'string', description: 'Alias for toolServerID.' },
    tool_server_id: { type: 'string', description: 'Alias for toolServerID.' },
    serverID: { type: 'string', description: 'Alias for toolServerID.' },
    serverId: { type: 'string', description: 'Alias for toolServerID.' },
    server_id: { type: 'string', description: 'Alias for toolServerID.' },
    toolServerScope: { type: 'string', description: 'Optional generation tool server scope, such as admin or org.' },
    tool_server_scope: { type: 'string', description: 'Alias for toolServerScope.' },
    serverScope: { type: 'string', description: 'Alias for toolServerScope.' },
    server_scope: { type: 'string', description: 'Alias for toolServerScope.' },
    operation: { type: 'string', description: 'Supported diagnostic operation, such as status, object_info, queue, models, or progress.' },
    toolPath: { type: 'string', description: 'Safe tool path for supported get-style operations.' },
    tool_path: { type: 'string', description: 'Alias for toolPath.' },
    path: { type: 'string', description: 'Alias for toolPath.' },
    workflow: { type: 'object', additionalProperties: true, description: 'Optional ComfyUI workflow for queue_prompt.' },
    toolPayload: { type: 'object', additionalProperties: true, description: 'Optional upstream payload for WebUI txt2img/img2img.' },
    tool_payload: { type: 'object', additionalProperties: true, description: 'Alias for toolPayload.' },
    clientID: { type: 'string', description: 'Optional ComfyUI client id.' },
    clientId: { type: 'string', description: 'Alias for clientID.' },
    client_id: { type: 'string', description: 'Alias for clientID.' },
    promptID: { type: 'string', description: 'Optional ComfyUI prompt id for history.' },
    promptId: { type: 'string', description: 'Alias for promptID.' },
    prompt_id: { type: 'string', description: 'Alias for promptID.' },
    filename: { type: 'string', description: 'Optional ComfyUI output filename for view.' },
    subfolder: { type: 'string', description: 'Optional ComfyUI output subfolder for view.' },
    fileType: { type: 'string', description: 'Optional ComfyUI view file type.' },
    file_type: { type: 'string', description: 'Alias for fileType.' },
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
