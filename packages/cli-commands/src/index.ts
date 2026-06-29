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

export const adminCommandByMCPToolName = new Map(adminCommandSpecs.map((spec) => [spec.mcpToolName, spec]))
export const adminCommandById = new Map(adminCommandSpecs.map((spec) => [spec.commandId, spec]))

export function isAdminMCPToolName(name: string | undefined): boolean {
  return Boolean(name && adminCommandByMCPToolName.has(name))
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

function bindAdminBackendRuntime(args: Record<string, unknown>): { backendEndpoint?: string } {
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

async function callAdminBackend(spec: AdminCommandSpec, path: string, args: Record<string, unknown>): Promise<unknown> {
  switch (spec.method) {
    case 'GET':
      return await backendGet(path)
    case 'POST':
      return await backendPost(path, adminPayload(args))
    case 'PUT':
      return await backendPut(path, adminPayload(args))
    case 'PATCH':
      return await backendPatch(path, adminPayload(args))
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
  appendPathArg(argv, args, ['id'], '--id')
  if (isRecord(args.query)) {
    for (const [key, value] of Object.entries(args.query)) {
      argv.push('--query', `${key}=${String(value)}`)
    }
  }
  if (args.payload !== undefined || args.body !== undefined) argv.push('--payload', '<json>')
  return argv
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

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
