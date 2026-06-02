import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST, type AgentManifest } from '../../../../../catalog/manifest/agentManifest.js'
import { buildLayeredCatalogRegistry, createEmptyCatalogRegistry } from '../../../../../catalog/registry/core/registry.js'
import type { AgentCommandRuntime } from '../../../../../context/command/commandRouter.js'
import type { AgentRuntimeContract } from '../../../../../contracts/runtime/runtimeContract.js'
import { StaticToolRegistry } from '../../../../../tools/registry/core/toolRegistry.js'
import type {
  AgentMessage,
  AgentTaskGraph,
  AgentRun,
  AgentTask,
  AgentTraceEvent,
  MCPResource,
  MCPTool,
} from '../../../../../state/shared/types.js'
import type { CapabilityMCPClient } from '../../../../../tools/catalog/capabilities/capabilityResolver.js'
import { buildRuntimeCatalogSnapshot } from '../../../../catalog/snapshot/core/runtimeCatalogSnapshot.js'
import {
  resolveRuntimeRunSetup,
  type RuntimeRunSetupResolutionTraceInput,
} from './runtimeRunSetupResolution.js'

const setupRound = { roundId: 'round_0', roundIndex: 0, roundLabel: 'Setup', roundSource: 'setup' as const }
const command: AgentCommandRuntime = {
  name: 'chat',
  payload: 'hello',
  contextMode: 'minimal',
  outputMode: 'natural',
  requiredTools: [],
  systemContract: 'Chat.',
}

test('resolveRuntimeRunSetup resolves active manifest capabilities, metadata, contract, and traces', async () => {
  const activeManifest: AgentManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    id: 'default_manifest',
    name: 'Default Manifest',
    tools: [{ name: 'tool_a', mode: 'allow', approval: 'never' }],
  }
  const toolRegistry = new StaticToolRegistry([tool('tool_a')])
  const run = makeRun({ metadata: { manifestSource: 'default', initialUserMessageId: 'msg_1' } })
  const traces: RuntimeRunSetupResolutionTraceInput[] = []
  const contract: AgentRuntimeContract = {
    id: 'contract_default',
    matches: (manifest) => manifest.id === 'default_manifest',
  }

  const result = await resolveRuntimeRunSetup({
    run,
    store: emptyStore(),
    catalogSnapshot: buildRuntimeCatalogSnapshot({
      id: 'snapshot_1',
      activeAgentManifest: activeManifest,
      toolRegistry,
      layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
      pluginCatalogInfo: { skillsDir: '/skills', toolsDir: '/tools', skillCount: 0, toolCount: 1, metadata: { catalogVersion: 'catalog_v1' } },
      pluginWarnings: ['catalog warning'],
    }),
    contractResolver: { find: (manifest) => manifest && contract.matches(manifest) ? contract : undefined },
    mcpClient: new FakeCapabilityClient(),
    contextResult: {
      snapshot: {
        route: { pathname: '/production/7' },
        project: { id: 42, name: 'Project' },
        productionId: 7,
      },
    },
    context: { currentProjectId: 42, currentProductionId: 7 },
    contextError: 'focus offline',
    contextDurationMs: 15,
    contextStartedAt: 1000,
    contextCompletedAt: 1015,
    memories: [],
    command,
    userMessage: 'hello',
    history: [],
    runRole: 'planner',
    setupRound,
    authMetadata: { backendAuthToken: 'token_1' },
    timestampMs: monotonicClock(1100, 1112),
    now: () => '2026-01-01T00:00:01.112Z',
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.equal(result.agentManifest.id, 'default_manifest')
  assert.equal(result.activeManifest.id, 'default_manifest')
  assert.equal(run.agentManifest?.id, 'default_manifest')
  assert.equal(result.runtimeContract?.id, 'contract_default')
  assert.equal(result.capabilityDurationMs, 12)
  assert.deepEqual(result.contextWarnings, ['Focus unavailable: focus offline'])
  assert.deepEqual(result.capabilities.warnings, ['catalog warning', 'Focus unavailable: focus offline'])
  assert.deepEqual(result.capabilities.resolvedTools.available.map((tool) => tool.name), ['tool_a'])
  assert.equal(run.metadata?.initialUserMessageId, 'msg_1')
  assert.equal(run.metadata?.backendAuthToken, 'token_1')
  assert.deepEqual(run.metadata?.visibleToolNames, ['tool_a'])
  assert.equal((run.metadata?.catalogSnapshot as any)?.id, 'snapshot_1')
  assert.equal((run.metadata?.catalogSnapshot as any)?.version, 'catalog_v1')
  assert.equal((run.metadata?.context as any)?.productionId, 7)
  assert.deepEqual(traces.map((trace) => trace.title), [
    'Runtime context resolved from fallback',
    'Agent manifest resolved',
    'Skills activated',
    'Tool catalog resolved',
    'Run context built',
  ])
  assert.equal(traces[0]?.status, 'blocked')
  assert.equal((traces[3]?.data as any)?.durationMs, 12)
  assert.equal((traces[4]?.data as any)?.warningCount, 4)
})

test('resolveRuntimeRunSetup ignores invalid production ids in debug context metadata', async () => {
  const activeManifest: AgentManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    id: 'default_manifest',
    name: 'Default Manifest',
    tools: [{ name: 'tool_a', mode: 'allow', approval: 'never' }],
  }
  const run = makeRun({ metadata: { manifestSource: 'default' } })

  await resolveRuntimeRunSetup({
    run,
    store: emptyStore(),
    catalogSnapshot: buildRuntimeCatalogSnapshot({
      id: 'snapshot_1',
      activeAgentManifest: activeManifest,
      toolRegistry: new StaticToolRegistry([tool('tool_a')]),
      layeredRegistry: createEmptyCatalogRegistry('catalog_v1'),
      pluginCatalogInfo: { skillsDir: '/skills', toolsDir: '/tools', skillCount: 0, toolCount: 1, metadata: { catalogVersion: 'catalog_v1' } },
      pluginWarnings: [],
    }),
    contractResolver: { find: () => undefined },
    mcpClient: new FakeCapabilityClient(),
    contextResult: {
      snapshot: {
        project: { id: 42, name: 'Project' },
        productionId: 7.5,
      },
    },
    context: { currentProjectId: 42, currentProductionId: 7.5 },
    contextDurationMs: 1,
    contextStartedAt: 1000,
    contextCompletedAt: 1001,
    memories: [],
    command,
    userMessage: 'hello',
    history: [],
    setupRound,
    timestampMs: monotonicClock(1100, 1101),
    now: () => '2026-01-01T00:00:01.101Z',
    recordTrace: () => {},
  })

  assert.equal((run.metadata?.context as any)?.productionId, undefined)
})

test('resolveRuntimeRunSetup applies layered active config file and stores configFile limits', async () => {
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest: DEFAULT_AGENT_MANIFEST,
    tools: [],
    configFiles: [{
      schema: 'movscript.agent.config_file.v1',
      id: 'config_file_layered',
      version: '1.0.0',
      name: 'Layered Config File',
      enabledPackIds: [],
      skillIds: [],
      toolGrants: [{ name: 'tool_layered', mode: 'allow', approval: 'never' }],
      limits: { maxActiveTriggeredSkills: 2, maxReferenceCharsPerRun: 8000, maxReferenceChunksPerRun: 3 },
    }],
  })
  const run = makeRun({ metadata: { manifestSource: 'default' } })
  const traces: RuntimeRunSetupResolutionTraceInput[] = []

  const result = await resolveRuntimeRunSetup({
    run,
    store: emptyStore(),
    catalogSnapshot: buildRuntimeCatalogSnapshot({
      id: 'snapshot_layered',
      activeAgentManifest: DEFAULT_AGENT_MANIFEST,
      toolRegistry: new StaticToolRegistry([tool('tool_layered')]),
      layeredRegistry,
    }),
    contractResolver: { find: () => undefined },
    mcpClient: new FakeCapabilityClient(),
    contextResult: { snapshot: { route: { pathname: '/agent' } } },
    context: {},
    contextDurationMs: 5,
    contextStartedAt: 1000,
    contextCompletedAt: 1005,
    memories: [],
    command,
    userMessage: 'hello',
    history: [],
    setupRound,
    timestampMs: monotonicClock(1100, 1100),
    now: () => '2026-01-01T00:00:01.100Z',
    recordTrace: (_run, trace) => traces.push(trace),
  })

  assert.equal(result.agentManifest.id, DEFAULT_AGENT_MANIFEST.id)
  assert.equal(result.activeManifest.id, 'config_file_layered')
  assert.equal(run.agentManifest?.id, 'config_file_layered')
  assert.equal(result.layers?.trace.configFileId, 'config_file_layered')
  assert.deepEqual(result.activeManifest.tools, [{ name: 'tool_layered', mode: 'allow', approval: 'never' }])
  assert.deepEqual(run.metadata?.limits, {
    maxActiveTriggeredSkills: 2,
    maxReferenceCharsPerRun: 8000,
    maxReferenceChunksPerRun: 3,
  })
  assert.equal((traces[1]?.data as any)?.id, 'config_file_layered')
  assert.equal((traces[4]?.data as any)?.configFileId, 'config_file_layered')
})

test('resolveRuntimeRunSetup honors the active manifest configFile id when layered configFiles exist', async () => {
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest: DEFAULT_AGENT_MANIFEST,
    tools: [],
    configFiles: [
      {
        schema: 'movscript.agent.config_file.v1',
        id: 'movscript.config_file.base',
        version: '1.0.0',
        name: 'Base Config File',
        enabledPackIds: [],
        skillIds: [],
        toolGrants: [{ name: 'tool_default', mode: 'allow', approval: 'never' }],
      },
      {
        schema: 'movscript.agent.config_file.v1',
        id: 'config_file_writer',
        version: '1.0.0',
        name: 'Writer Config File',
        enabledPackIds: [],
        skillIds: [],
        toolGrants: [{ name: 'tool_writer', mode: 'allow', approval: 'never' }],
      },
    ],
  })
  const activeManifest: AgentManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    metadata: { configFileId: 'config_file_writer' },
  }
  const run = makeRun({ metadata: { manifestSource: 'default' } })

  const result = await resolveRuntimeRunSetup({
    run,
    store: emptyStore(),
    catalogSnapshot: buildRuntimeCatalogSnapshot({
      id: 'snapshot_config_file_writer',
      activeAgentManifest: activeManifest,
      toolRegistry: new StaticToolRegistry([tool('tool_default'), tool('tool_writer')]),
      layeredRegistry,
    }),
    contractResolver: { find: () => undefined },
    mcpClient: new FakeCapabilityClient(),
    contextResult: { snapshot: { route: { pathname: '/agent' } } },
    context: {},
    contextDurationMs: 5,
    contextStartedAt: 1000,
    contextCompletedAt: 1005,
    memories: [],
    command,
    userMessage: 'hello',
    history: [],
    setupRound,
    timestampMs: monotonicClock(1100, 1100),
    now: () => '2026-01-01T00:00:01.100Z',
    recordTrace: () => {},
  })

  assert.equal(result.activeManifest.id, 'config_file_writer')
  assert.equal(result.layers?.trace.configFileId, 'config_file_writer')
  assert.deepEqual(result.activeManifest.tools, [{ name: 'tool_writer', mode: 'allow', approval: 'never' }])
  assert.equal(run.agentManifest?.metadata?.configFileId, 'config_file_writer')
})

test('resolveRuntimeRunSetup applies default tool permission overrides without changing configFile catalog', async () => {
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest: DEFAULT_AGENT_MANIFEST,
    tools: [],
    configFiles: [{
      schema: 'movscript.agent.config_file.v1',
      id: 'movscript.config_file.base',
      version: '1.0.0',
      name: 'Base Config File',
      enabledPackIds: [],
      skillIds: [],
      toolGrants: [
        { name: 'tool_a', mode: 'allow', approval: 'never' },
        { name: 'tool_b', mode: 'allow', approval: 'on_write' },
      ],
    }],
  })
  const activeManifest: AgentManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    metadata: {
      configFileId: 'movscript.config_file.base',
      toolPermissionOverridesByConfigFile: {
        'movscript.config_file.base': [
          { name: 'tool_a', mode: 'deny', approval: 'never' },
          { name: 'tool_b', mode: 'allow', approval: 'always' },
        ],
      },
    },
  }
  const run = makeRun({ metadata: { manifestSource: 'default' } })

  const result = await resolveRuntimeRunSetup({
    run,
    store: emptyStore(),
    catalogSnapshot: buildRuntimeCatalogSnapshot({
      id: 'snapshot_tool_permissions',
      activeAgentManifest: activeManifest,
      toolRegistry: new StaticToolRegistry([tool('tool_a'), tool('tool_b')]),
      layeredRegistry,
    }),
    contractResolver: { find: () => undefined },
    mcpClient: new FakeCapabilityClient(),
    contextResult: { snapshot: { route: { pathname: '/agent' } } },
    context: {},
    contextDurationMs: 5,
    contextStartedAt: 1000,
    contextCompletedAt: 1005,
    memories: [],
    command,
    userMessage: 'hello',
    history: [],
    setupRound,
    timestampMs: monotonicClock(1100, 1100),
    now: () => '2026-01-01T00:00:01.100Z',
    recordTrace: () => {},
  })

  assert.deepEqual(result.activeManifest.tools, [
    { name: 'tool_a', mode: 'deny', approval: 'never' },
    { name: 'tool_b', mode: 'allow', approval: 'always' },
  ])
  assert.deepEqual(result.layers?.ctx.configFile.toolGrants, result.activeManifest.tools)
})

test('resolveRuntimeRunSetup keeps stored tool permission overrides at least as strict as config file approval defaults', async () => {
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest: DEFAULT_AGENT_MANIFEST,
    tools: [tool('tool_writer', 'write')],
    configFiles: [{
      schema: 'movscript.agent.config_file.v1',
      id: 'movscript.config_file.base',
      version: '1.0.0',
      name: 'Base Config File',
      enabledPackIds: [],
      skillIds: [],
      approvalDefaults: { write: 'always' },
      toolGrants: [
        { name: 'tool_writer', mode: 'allow', approval: 'never' },
      ],
    }],
  })
  const activeManifest: AgentManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    metadata: {
      configFileId: 'movscript.config_file.base',
      toolPermissionOverridesByConfigFile: {
        'movscript.config_file.base': [
          { name: 'tool_writer', mode: 'allow', approval: 'never' },
        ],
      },
    },
  }
  const run = makeRun({ metadata: { manifestSource: 'default' } })

  const result = await resolveRuntimeRunSetup({
    run,
    store: emptyStore(),
    catalogSnapshot: buildRuntimeCatalogSnapshot({
      id: 'snapshot_tool_permission_defaults',
      activeAgentManifest: activeManifest,
      toolRegistry: new StaticToolRegistry([tool('tool_writer', 'write')]),
      layeredRegistry,
    }),
    contractResolver: { find: () => undefined },
    mcpClient: new FakeCapabilityClient(),
    contextResult: { snapshot: { route: { pathname: '/agent' } } },
    context: {},
    contextDurationMs: 5,
    contextStartedAt: 1000,
    contextCompletedAt: 1005,
    memories: [],
    command,
    userMessage: 'hello',
    history: [],
    setupRound,
    timestampMs: monotonicClock(1100, 1100),
    now: () => '2026-01-01T00:00:01.100Z',
    recordTrace: () => {},
  })

  assert.deepEqual(result.activeManifest.tools, [
    { name: 'tool_writer', mode: 'allow', approval: 'always' },
  ])
  assert.deepEqual(result.layers?.ctx.configFile.toolGrants, result.activeManifest.tools)
})

test('resolveRuntimeRunSetup adds active skill tool grants to custom manifests', async () => {
  const readScriptsTool = {
    name: 'movscript_script_locate',
    description: 'Read project scripts',
    inputSchema: { type: 'object' },
    permission: 'project.script.read',
    risk: 'read' as const,
    projectScoped: true,
    defaults: { grant: 'allow' as const, approval: 'never' as const },
    source: 'runtime' as const,
  }
  const layeredRegistry = buildLayeredCatalogRegistry({
    manifest: DEFAULT_AGENT_MANIFEST,
    tools: [],
    layeredTools: [readScriptsTool],
    layeredSkills: [{
      id: 'movscript.script_reading',
      version: '1.0.0',
      name: 'Script Reading',
      description: 'Read project scripts',
      priority: 80,
      enabled: true,
      instructionTemplate: 'Read scripts.',
      loadMode: 'manual',
      triggers: [{ kind: 'keyword', any: ['剧本'] }],
      toolGrants: ['movscript_script_locate'],
    }],
    configFiles: [{
      schema: 'movscript.agent.config_file.v1',
      id: 'movscript.config_file.base',
      version: '1.0.0',
      name: 'Base Config File',
      enabledPackIds: [],
      skillIds: [],
      toolGrants: [{ name: 'unrelated_config_file_tool', mode: 'allow', approval: 'never' }],
    }],
  })
  const explicitManifest: AgentManifest = {
    schema: 'movscript.agent.current',
    id: 'explicit_manifest',
    version: '1.0.0',
    name: 'Explicit Manifest',
    tools: [
      { name: 'core_skill_update', mode: 'allow', approval: 'never' },
      { name: 'movscript_script_locate', mode: 'deny', approval: 'never' },
    ],
  }
  const run = makeRun({
    agentManifest: explicitManifest,
    metadata: {
      manifestSource: 'custom',
      skillState: {
        loadedSkillIds: ['movscript.script_reading'],
        unloadedSkillIds: [],
      },
    },
  })

  const result = await resolveRuntimeRunSetup({
    run,
    store: emptyStore(),
    catalogSnapshot: buildRuntimeCatalogSnapshot({
      id: 'snapshot_custom_skill',
      activeAgentManifest: DEFAULT_AGENT_MANIFEST,
      toolRegistry: new StaticToolRegistry([
        tool('core_skill_update'),
        {
          name: 'movscript_script_locate',
          description: 'Read project scripts',
          permission: 'project.script.read',
          risk: 'read',
          source: 'runtime',
          projectScoped: true,
          requiresApprovalByDefault: false,
        },
      ]),
      layeredRegistry,
    }),
    contractResolver: { find: () => undefined },
    mcpClient: new FakeCapabilityClient(),
    contextResult: { snapshot: { route: { pathname: '/project/scripts' }, project: { id: 5, name: '好运甜妻' } } },
    context: { currentProjectId: 5 },
    contextDurationMs: 5,
    contextStartedAt: 1000,
    contextCompletedAt: 1005,
    memories: [],
    command,
    userMessage: '查看剧本',
    history: [],
    setupRound,
    timestampMs: monotonicClock(1100, 1100),
    now: () => '2026-01-01T00:00:01.100Z',
    recordTrace: () => {},
  })

  assert.equal(result.activeManifest.id, 'explicit_manifest')
  assert.deepEqual(result.skills.map((skill) => skill.id), ['movscript.script_reading'])
  assert.ok(result.activeManifest.tools.some((grant) => grant.name === 'core_skill_update'))
  assert.equal(result.activeManifest.tools.find((grant) => grant.name === 'movscript_script_locate')?.mode, 'deny')
  assert.equal(result.activeManifest.tools.some((grant) => grant.name === 'unrelated_config_file_tool'), false)
  assert.equal(result.capabilities.resolvedTools.byName.movscript_script_locate?.available, false)
  assert.equal(result.capabilities.resolvedTools.byName.movscript_script_locate?.unavailableReason, 'denied')
})

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function tool(name: string, risk: 'read' | 'draft' | 'write' | 'generate' | 'destructive' | 'ui' = 'read') {
  return {
    name,
    description: name,
    permission: `tool.${name}`,
    risk,
    source: 'runtime' as const,
    projectScoped: false,
    requiresApprovalByDefault: false,
  }
}

function emptyStore() {
  return {
    getTaskGraph(_id: string): AgentTaskGraph | undefined {
      return undefined
    },
    listTasks(_taskGraphId?: string): AgentTask[] {
      return []
    },
    listRuns(): AgentRun[] {
      return []
    },
  }
}

function monotonicClock(...values: number[]) {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] ?? 0
}

class FakeCapabilityClient implements CapabilityMCPClient {
  async initialize(): Promise<void> {}

  async listTools(): Promise<MCPTool[]> {
    return []
  }

  async listResources(): Promise<MCPResource[]> {
    return []
  }
}
