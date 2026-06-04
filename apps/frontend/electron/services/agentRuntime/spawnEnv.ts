import { resolvePort } from './config'
import type { SpawnAgentRuntimeInput } from './spawn'
import type { AgentCatalogPackStoreDirs } from '@movscript/agent-runtime'

export interface AgentRuntimeSpawnEnvOptions {
  baseEnv: NodeJS.ProcessEnv
  launchEnv?: Record<string, string>
  mcpEndpoint: string
  agentUserDataDir: string
  agentCatalogDirs?: AgentCatalogPackStoreDirs
}

export function resolveAgentRuntimeSpawnPort(input: Pick<SpawnAgentRuntimeInput, 'baseURL' | 'transport'>): number | undefined {
  return input.transport.kind === 'http'
    ? input.transport.port ?? resolvePort(input.baseURL)
    : undefined
}

export function buildAgentRuntimeSpawnEnv(input: SpawnAgentRuntimeInput, options: AgentRuntimeSpawnEnvOptions): NodeJS.ProcessEnv {
  const port = resolveAgentRuntimeSpawnPort(input)
  const {
    MOVSCRIPT_AGENT_PORT: _inheritedPort,
    MOVSCRIPT_AGENT_SOCKET_PATH: _inheritedSocketPath,
    MOVSCRIPT_AGENT_STARTED_BY: _inheritedStartedBy,
    MOVSCRIPT_AGENT_TRANSPORT: _inheritedTransport,
    MOVSCRIPT_AGENT_WORKSPACE_DIR: _inheritedWorkspaceDir,
    MOVSCRIPT_AGENT_RUNTIME_DIR_NAME: _inheritedRuntimeDirName,
    MOVSCRIPT_AGENT_SESSION_ID: _inheritedSessionId,
    MOVSCRIPT_AGENT_CATALOG_STORE_DIR: _inheritedCatalogStoreDir,
    MOVSCRIPT_AGENT_SKILLS_DIR: _inheritedSkillsDir,
    MOVSCRIPT_AGENT_TOOLS_DIR: _inheritedToolsDir,
    MOVSCRIPT_AGENT_PACKS_DIR: _inheritedPacksDir,
    MOVSCRIPT_AGENT_CONFIG_FILES_DIR: _inheritedConfigFilesDir,
    ...baseEnv
  } = options.baseEnv
  return {
    ...baseEnv,
    ...options.launchEnv,
    MOVSCRIPT_AGENT_TRANSPORT: input.transport.kind,
    ...(port !== undefined ? { MOVSCRIPT_AGENT_PORT: String(port) } : {}),
    ...(input.transport.socketPath ? { MOVSCRIPT_AGENT_SOCKET_PATH: input.transport.socketPath } : {}),
    ...(input.session ? {
      MOVSCRIPT_AGENT_WORKSPACE_DIR: input.session.workspaceDir,
      ...(input.session.agentRuntimeDirName ? { MOVSCRIPT_AGENT_RUNTIME_DIR_NAME: input.session.agentRuntimeDirName } : {}),
      MOVSCRIPT_AGENT_SESSION_ID: input.session.sessionId,
      MOVSCRIPT_AGENT_STARTED_BY: 'desktop',
    } : {}),
    MOVSCRIPT_MCP_ENDPOINT: options.mcpEndpoint,
    MOVSCRIPT_AGENT_USER_DATA_DIR: options.agentUserDataDir,
    ...(options.agentCatalogDirs ? {
      MOVSCRIPT_AGENT_CATALOG_STORE_DIR: options.agentCatalogDirs.rootDir,
      MOVSCRIPT_AGENT_SKILLS_DIR: options.agentCatalogDirs.skillsDir,
      MOVSCRIPT_AGENT_TOOLS_DIR: options.agentCatalogDirs.toolsDir,
      MOVSCRIPT_AGENT_PACKS_DIR: options.agentCatalogDirs.packsDir,
      MOVSCRIPT_AGENT_CONFIG_FILES_DIR: options.agentCatalogDirs.configFilesDir,
    } : {}),
    ...(input.backendAPIBaseURL ? {
      MOVSCRIPT_BACKEND_API_BASE_URL: input.backendAPIBaseURL,
      MOVSCRIPT_API_BASE_URL: input.backendAPIBaseURL,
    } : {}),
    MOVSCRIPT_AGENT_PARENT_PID: String(process.pid),
    MOVSCRIPT_AGENT_SERVER_CHILD_STARTED_AT: String(input.spawnStartedAt),
  }
}
