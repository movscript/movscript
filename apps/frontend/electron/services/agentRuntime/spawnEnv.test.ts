import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAgentRuntimeSpawnEnv, resolveAgentRuntimeSpawnPort } from './spawnEnv'
import type { SpawnAgentRuntimeInput } from './spawn'

test('session Unix socket runtime spawn env does not set the shared HTTP port', () => {
  const input = spawnInput({
    baseURL: 'unix:/tmp/movscript-agent-session.sock',
    transport: {
      kind: 'unix-socket',
      endpointLabel: 'unix:/tmp/movscript-agent-session.sock',
      socketPath: '/tmp/movscript-agent-session.sock',
      request: async () => new Response(null),
      openEventStream: async () => {
        throw new Error('unexpected event stream')
      },
    },
    session: {
      workspaceDir: '/tmp/movscript-agent-workspace',
      sessionId: 'session_1',
    },
  })

  const env = buildAgentRuntimeSpawnEnv(input, {
    baseEnv: { MOVSCRIPT_AGENT_PORT: '28765' },
    launchEnv: { MOVSCRIPT_AGENT_DEV_ENTRY: 'bundle' },
    mcpEndpoint: 'http://127.0.0.1:18765/mcp',
    agentUserDataDir: '/tmp/movscript-user-data',
    agentCatalogDirs: agentCatalogDirs(),
  })

  assert.equal(resolveAgentRuntimeSpawnPort(input), undefined)
  assert.equal(env.MOVSCRIPT_AGENT_TRANSPORT, 'unix-socket')
  assert.equal(env.MOVSCRIPT_AGENT_SOCKET_PATH, '/tmp/movscript-agent-session.sock')
  assert.equal(env.MOVSCRIPT_AGENT_WORKSPACE_DIR, '/tmp/movscript-agent-workspace')
  assert.equal(env.MOVSCRIPT_AGENT_SESSION_ID, 'session_1')
  assert.equal(env.MOVSCRIPT_AGENT_STARTED_BY, 'desktop')
  assert.equal(env.MOVSCRIPT_AGENT_PORT, undefined)
  assert.equal(env.MOVSCRIPT_AGENT_CATALOG_STORE_DIR, '/tmp/movscript-user-data/agent-catalog')
  assert.equal(env.MOVSCRIPT_AGENT_SKILLS_DIR, '/tmp/movscript-user-data/agent-catalog/skills')
  assert.equal(env.MOVSCRIPT_AGENT_TOOLS_DIR, '/tmp/movscript-user-data/agent-catalog/tools')
  assert.equal(env.MOVSCRIPT_AGENT_PACKS_DIR, '/tmp/movscript-user-data/agent-catalog/packs')
  assert.equal(env.MOVSCRIPT_AGENT_CONFIG_FILES_DIR, '/tmp/movscript-user-data/agent-catalog/config-files')
})

test('HTTP runtime spawn env keeps the configured port', () => {
  const input = spawnInput({
    baseURL: 'http://127.0.0.1:29999',
    transport: {
      kind: 'http',
      endpointLabel: 'http://127.0.0.1:29999',
      port: 29999,
      request: async () => new Response(null),
      openEventStream: async () => {
        throw new Error('unexpected event stream')
      },
    },
  })

  const env = buildAgentRuntimeSpawnEnv(input, {
    baseEnv: {},
    mcpEndpoint: 'http://127.0.0.1:18765/mcp',
    agentUserDataDir: '/tmp/movscript-user-data',
    agentCatalogDirs: agentCatalogDirs(),
  })

  assert.equal(resolveAgentRuntimeSpawnPort(input), 29999)
  assert.equal(env.MOVSCRIPT_AGENT_TRANSPORT, 'http')
  assert.equal(env.MOVSCRIPT_AGENT_PORT, '29999')
  assert.equal(env.MOVSCRIPT_AGENT_SOCKET_PATH, undefined)
  assert.equal(env.MOVSCRIPT_AGENT_CATALOG_STORE_DIR, '/tmp/movscript-user-data/agent-catalog')
})

function agentCatalogDirs() {
  return {
    rootDir: '/tmp/movscript-user-data/agent-catalog',
    skillsDir: '/tmp/movscript-user-data/agent-catalog/skills',
    toolsDir: '/tmp/movscript-user-data/agent-catalog/tools',
    packsDir: '/tmp/movscript-user-data/agent-catalog/packs',
    configFilesDir: '/tmp/movscript-user-data/agent-catalog/config-files',
  }
}

function spawnInput(patch: Partial<SpawnAgentRuntimeInput>): SpawnAgentRuntimeInput {
  return {
    baseURL: 'http://127.0.0.1:28765',
    transport: {
      kind: 'http',
      endpointLabel: 'http://127.0.0.1:28765',
      port: 28765,
      request: async () => new Response(null),
      openEventStream: async () => {
        throw new Error('unexpected event stream')
      },
    },
    backendAPIBaseURL: 'http://localhost:8765/api/v1',
    detached: false,
    spawnStartedAt: 1,
    ...patch,
  } as SpawnAgentRuntimeInput
}
