import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { StaticAgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import { buildContext, buildOpenAIChatTools } from './contextBuilder.js'

test('buildContext emits multiple textual system messages instead of one JSON-packed prompt', () => {
  const built = buildContext({
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    context: {
      route: { pathname: '/production-orchestrate' },
      projects: [{ id: 42, name: 'Demo', description: '测试项目' }],
      project: { id: 42, name: 'Demo' },
      productionId: 4,
      selection: { entityType: 'production', entityId: 4 },
      recentResources: [],
      attachments: [],
      memories: [],
      labels: ['production-orchestrate'],
    },
    tools: { discovered: [], available: [], blocked: [], byName: {} },
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    memories: [],
    warnings: [],
    history: [],
    userMessage: '/context',
  })

  const systemMessages = built.messages.filter((message) => message.role === 'system')
  assert.ok(systemMessages.length > 1)
  assert.match(systemMessages[0].content ?? '', /Core Runtime Protocol/)
  assert.match(systemMessages[0].content ?? '', /Tool results are the source of truth/)
  assert.match(systemMessages[0].content ?? '', /Default context is intentionally small/)
  assert.match(systemMessages[1].content ?? '', /compact execution envelope/)
  assert.match(systemMessages[1].content ?? '', /Title:/)
  assert.match(systemMessages[1].content ?? '', /Business reference:/)
  assert.match(systemMessages[1].content ?? '', /production#4/)
  assert.doesNotMatch(systemMessages[1].content ?? '', /All Projects/)
  assert.doesNotMatch(systemMessages[1].content ?? '', /项目1的名字/)
  assert.equal(systemMessages.some((message) => String(message.content).includes('Runtime context JSON')), false)
  assert.ok(systemMessages.some((message) => String(message.content).includes('outputMode: natural')))
  assert.ok(String(systemMessages[0].content).includes('durable handoff anchors'))
})

test('buildContext keeps default chat prompt lean', () => {
  const built = buildContext({
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    context: {
      route: { pathname: '/agent' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    tools: {
      discovered: [],
      available: [
        {
          name: 'movscript_get_current_context',
          source: 'runtime',
          registered: true,
          granted: true,
          available: true,
          approval: 'never',
          requiresApproval: false,
        },
      ],
      blocked: [
        {
          name: 'movscript_create_draft',
          source: 'runtime',
          registered: true,
          granted: true,
          available: false,
          approval: 'never',
          unavailableReason: 'workflow_scope',
          requiresApproval: false,
        },
      ],
      byName: {},
    },
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    memories: [{
      id: 'memory_1',
      projectId: 1,
      title: '默认风格',
      kind: 'preference',
      content: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    warnings: [],
    history: [],
    userMessage: '继续',
  })

  assert.equal(built.debugParts.some((part) => part.id === 'command.chat'), false)
  assert.equal(built.debugParts.some((part) => part.id === 'context.memories'), false)
  assert.doesNotMatch(built.systemPrompt, /Available tool handles/)
  assert.doesNotMatch(built.systemPrompt, /Blocked tool handles/)
  assert.doesNotMatch(built.systemPrompt, /movscript_create_draft/)
  assert.doesNotMatch(built.systemPrompt, /memory#memory_1/)
  assert.match(built.systemPrompt, /output schemas define stable result fields/)
})

test('buildContext summarizes declared tool output fields for model-readable results', () => {
  const built = buildContext({
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    context: {
      route: { pathname: '/agent' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    tools: {
      discovered: [],
      blocked: [],
      byName: {},
      available: [
        {
          name: 'movscript_list_models',
          source: 'runtime',
          registered: true,
          granted: true,
          available: true,
          approval: 'never',
          requiresApproval: false,
          outputSchema: {
            type: 'object',
            properties: {
              count: { type: 'number' },
              model_contracts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    model_config_id: { type: 'number' },
                    logical_model_id: { type: 'string' },
                    capabilities: { type: 'array' },
                    input_requirements: { type: 'object' },
                    supported_param_keys: { type: 'array' },
                    supported_params: { type: 'array' },
                  },
                },
              },
              models: { type: 'array' },
            },
          },
        },
        {
          name: 'movscript_create_generation_job',
          source: 'runtime',
          registered: true,
          granted: true,
          available: true,
          approval: 'always',
          requiresApproval: true,
          outputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              job: { type: 'object' },
              jobId: { type: 'number' },
              monitor: {
                type: 'object',
                properties: {
                  tool: { type: 'string' },
                  args: { type: 'object' },
                  message: { type: 'string' },
                },
              },
              output_resource: { type: 'object' },
              output_resource_id: { type: 'number' },
              param_validation: {
                type: 'object',
                properties: {
                  audit_version: { type: 'number' },
                  preflight_errors: { type: 'array' },
                  input_preflight_errors: { type: 'array' },
                },
              },
              terminal: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      ],
    },
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    memories: [],
    warnings: [],
    history: [],
    userMessage: '生成图片',
  })

  assert.match(built.systemPrompt, /Declared tool output fields/)
  assert.match(built.systemPrompt, /movscript_list_models/)
  assert.match(built.systemPrompt, /model_contracts\[\]\.model_config_id\|logical_model_id\|capabilities\|input_requirements\|supported_param_keys\|supported_params/)
  assert.match(built.systemPrompt, /movscript_create_generation_job/)
  assert.match(built.systemPrompt, /monitor\.\{tool\|args\|message\}/)
  assert.match(built.systemPrompt, /param_validation\.\{audit_version\|preflight_errors\|input_preflight_errors\}/)
  assert.match(built.systemPrompt, /output_resource_id/)
})

test('buildContext uses runtime contract for tool schemas without forcing JSON assistant content', () => {
  const resolver = new StaticAgentRuntimeContractResolver([
    {
      id: 'structured-test-contract',
      matches: (manifest) => manifest.id === 'structured-test-agent',
      toolSchemas: {
        movscript_structured_test_tool: {
          type: 'object',
          additionalProperties: false,
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    },
  ])
  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    id: 'structured-test-agent',
    soul: '输出JSON',
  }
  const tools = {
    discovered: [],
    blocked: [],
    byName: {},
    available: [{
      name: 'movscript_structured_test_tool',
      source: 'runtime' as const,
      registered: true,
      granted: true,
      available: true,
      approval: 'never' as const,
      requiresApproval: false,
    }],
  }
  const built = buildContext({
    manifest,
    skills: [],
    context: {
      route: { pathname: '/production-orchestrate' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    tools,
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    memories: [],
    warnings: [],
    history: [],
    userMessage: '分析剧本',
    contractResolver: resolver,
  })
  const chatTools = buildOpenAIChatTools(tools, resolver.find(manifest))

  assert.doesNotMatch(built.systemPrompt, /Return only JSON/)
  assert.ok(chatTools.some((tool) => tool.function.name === 'movscript_structured_test_tool' && !!tool.function.parameters))
})

test('buildOpenAIChatTools exposes spawn_subagent dispatch controls', () => {
  const tools = {
    discovered: [],
    blocked: [],
    byName: {},
    available: [{
      name: 'movscript_spawn_subagent',
      source: 'runtime' as const,
      registered: true,
      granted: true,
      available: true,
      approval: 'never' as const,
      requiresApproval: false,
    }],
  }
  const [tool] = buildOpenAIChatTools(tools)
  const parameters = tool?.function.parameters as any
  assert.equal(parameters?.properties?.maxWorkers?.type, 'number')
  assert.equal(parameters?.properties?.retryFailed?.type, 'boolean')
  assert.equal(parameters?.properties?.maxTaskAttempts?.type, 'number')
  assert.equal(parameters?.properties?.workerTimeoutMs?.type, 'number')
  assert.deepEqual(parameters?.properties?.subagentNames?.oneOf?.map((item: any) => item.type), ['array', 'object'])
  assert.equal(parameters?.properties?.subagentNames?.oneOf?.[1]?.additionalProperties?.type, 'string')
  const taskProperties = parameters?.properties?.tasks?.items?.properties
  assert.equal(taskProperties?.maxTaskAttempts?.type, 'number')
  assert.equal(taskProperties?.workerTimeoutMs?.type, 'number')
})

test('buildOpenAIChatTools exposes cancel_subagent pending task semantics', () => {
  const tools = {
    discovered: [],
    blocked: [],
    byName: {},
    available: [{
      name: 'movscript_cancel_subagent',
      source: 'runtime' as const,
      registered: true,
      granted: true,
      available: true,
      approval: 'never' as const,
      requiresApproval: false,
    }],
  }
  const [tool] = buildOpenAIChatTools(tools)
  const parameters = tool?.function.parameters as any
  assert.match(parameters?.properties?.subagentName?.description ?? '', /not-yet-started task/)
  assert.match(parameters?.properties?.taskId?.description ?? '', /pending\/blocked\/needs_review task/)
})

test('buildContext adds planner subagent policy only when scheduling tools are available', () => {
  const baseInput = {
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    context: {
      route: { pathname: '/agent' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    policy: {
      approvalMode: 'interactive' as const,
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    memories: [],
    warnings: [],
    history: [],
    userMessage: '继续处理当前任务',
  }
  const withoutSubagents = buildContext({
    ...baseInput,
    tools: { discovered: [], available: [], blocked: [], byName: {} },
  })
  assert.equal(withoutSubagents.debugParts.some((part) => part.id === 'policy.planner-subagents'), false)

  const tools = {
    discovered: [],
    blocked: [],
    byName: {},
    available: [{
      name: 'movscript_spawn_subagent',
      source: 'runtime' as const,
      registered: true,
      granted: true,
      available: true,
      approval: 'never' as const,
      requiresApproval: false,
    }],
  }
  const withSubagents = buildContext({
    ...baseInput,
    tools,
  })
  const policy = withSubagents.debugParts.find((part) => part.id === 'policy.planner-subagents')
  assert.equal(policy, undefined)
  assert.equal(withSubagents.systemMessages.some((message) => String(message.content).includes('Planner Subagent Policy')), false)

  const withPlannerIntent = buildContext({
    ...baseInput,
    tools,
    userMessage: '请并行处理这些任务',
  })
  const plannerPolicy = withPlannerIntent.debugParts.find((part) => part.id === 'policy.planner-subagents')
  assert.match(plannerPolicy?.content ?? '', /Do simple, single-context tasks yourself/)
  assert.match(plannerPolicy?.content ?? '', /movscript_spawn_subagent/)
  assert.match(plannerPolicy?.content ?? '', /retryFailed/)
  assert.match(plannerPolicy?.content ?? '', /maxTaskAttempts/)
  assert.match(plannerPolicy?.content ?? '', /workerTimeoutMs/)
  assert.match(plannerPolicy?.content ?? '', /pending\/blocked\/needs_review subagent task/)
  assert.ok(withPlannerIntent.systemMessages.some((message) => String(message.content).includes('Planner Subagent Policy')))
})

test('buildContext orders activated behavior as persona, policies, then workflows', () => {
  const built = buildContext({
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [
      {
        id: 'workflow.story',
        name: 'Story Workflow',
        description: '',
        enabled: true,
        instruction: 'workflow',
        compiledInstruction: 'workflow',
        activationReason: 'default',
        resolvedPriority: 100,
        warnings: [],
        category: 'workflow',
        metadata: { kind: 'workflow' },
      },
      {
        id: 'persona.default',
        name: 'Persona',
        description: '',
        enabled: true,
        instruction: 'persona',
        compiledInstruction: 'persona',
        activationReason: 'profile',
        resolvedPriority: 100,
        warnings: [],
        category: 'persona',
        metadata: { kind: 'persona' },
      },
      {
        id: 'policy.safe',
        name: 'Policy',
        description: '',
        enabled: true,
        instruction: 'policy',
        compiledInstruction: 'policy',
        activationReason: 'profile',
        resolvedPriority: 100,
        warnings: [],
        category: 'policy',
        metadata: { kind: 'policy' },
      },
    ],
    context: {
      route: { pathname: '/agent' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    tools: { discovered: [], available: [], blocked: [], byName: {} },
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    memories: [],
    warnings: ['runtime warning'],
    history: [],
    userMessage: '继续',
  })

  const ids = built.debugParts.map((part) => part.id)
  assert.ok(ids.indexOf('runtime.core') < ids.indexOf('context.summary'))
  assert.ok(ids.indexOf('context.summary') < ids.indexOf('skill.persona.default'))
  assert.ok(ids.indexOf('skill.persona.default') < ids.indexOf('skill.policy.safe'))
  assert.ok(ids.indexOf('skill.policy.safe') < ids.indexOf('skill.workflow.story'))
  assert.ok(ids.indexOf('skill.workflow.story') < ids.indexOf('context.warnings'))
  assert.equal(built.promptStats.totalChars, built.systemPrompt.length)
  assert.ok(built.promptStats.byLayer.level0_core > 0)
  assert.ok(built.promptStats.byLayer.level1_context > 0)
  assert.ok(built.promptStats.byLayer.level2_behavior > 0)
  assert.ok(built.promptStats.byLayer.runtime_warnings > 0)
  assert.equal(built.promptStats.parts.some((part) => part.id === 'skill.workflow.story' && part.layer === 'level2_behavior'), true)
})

test('buildContext renders current plan and worker state for planner decisions', () => {
  const built = buildContext({
    manifest: DEFAULT_AGENT_MANIFEST,
    skills: [],
    context: {
      route: { pathname: '/agent' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
      agentPlan: {
        id: 'plan_1',
        title: 'Subagent rollout',
        status: 'running',
        progress: 0.5,
        role: 'planner',
        currentTaskId: 'task_a',
        rootRunId: 'run_planner',
        tasks: [
          { id: 'task_a', title: 'Implement planner', status: 'done', progress: 1, deps: [] },
          { id: 'task_b', subagentName: '爱因斯坦', title: 'Run worker', status: 'running', progress: 0.25, deps: ['task_a'], ownerRunId: 'run_worker' },
          { id: 'task_c', subagentName: '爱因斯坦', title: 'Duplicate name', status: 'pending', progress: 0, deps: [] },
        ],
        workers: [
          { id: 'run_worker', subagentName: '爱因斯坦', status: 'in_progress', taskId: 'task_b', parentRunId: 'run_planner', progress: 0.25 },
        ],
        nameConflicts: [
          { subagentName: '爱因斯坦', taskIds: ['task_b', 'task_c'] },
        ],
        summary: {
          taskCount: 3,
          taskStatusCounts: { pending: 1, running: 1, blocked: 0, needs_review: 0, done: 1, failed: 0, cancelled: 0 },
          workerCount: 1,
          activeWorkerCount: 1,
          artifactCount: 1,
          nameConflictCount: 1,
          blockedTaskIds: [],
          needsReviewTaskIds: [],
          failedTaskIds: [],
        },
        artifacts: [
          {
            id: 'artifact_worker_result',
            type: 'rollback-policy',
            title: 'Manual rollback required',
            uri: 'agent-draft:draft_1',
            taskId: 'task_b',
            subagentName: '爱因斯坦',
            sourceRunId: 'run_worker',
            sourceTaskId: 'task_b',
            sourceTaskTitle: 'Run worker',
            sourceTaskStatus: 'running',
            sourceTaskOwnerRunId: 'run_worker',
            toolName: 'movscript_create_draft',
            policy: 'manual_compensation',
          },
        ],
      },
    },
    tools: { discovered: [], available: [], blocked: [], byName: {} },
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    memories: [],
    warnings: [],
    history: [],
    userMessage: '继续',
  })

  assert.match(built.systemPrompt, /### Agent Plan/)
  assert.match(built.systemPrompt, /plan#plan_1/)
  assert.match(built.systemPrompt, /#### Plan Summary/)
  assert.match(built.systemPrompt, /Tasks: 3 \(pending=1, running=1, done=1\)/)
  assert.match(built.systemPrompt, /Workers: 1; active=1/)
  assert.match(built.systemPrompt, /Artifacts: 1; nameConflicts=1/)
  assert.match(built.systemPrompt, /爱因斯坦: Run worker/)
  assert.match(built.systemPrompt, /taskRef=task#task_b/)
  assert.match(built.systemPrompt, /#### Subagent Name Conflicts/)
  assert.match(built.systemPrompt, /爱因斯坦: Run worker \(task#task_b; status=running; owner=run#run_worker; worker=in_progress\) \| Duplicate name \(task#task_c; status=pending\)/)
  assert.match(built.systemPrompt, /爱因斯坦: in_progress/)
  assert.match(built.systemPrompt, /runRef=run#run_worker/)
  assert.match(built.systemPrompt, /#### Plan Artifact References/)
  assert.match(built.systemPrompt, /Manual rollback required/)
  assert.match(built.systemPrompt, /subagent=爱因斯坦/)
  assert.match(built.systemPrompt, /run=run#run_worker/)
  assert.match(built.systemPrompt, /sourceTitle=Run worker/)
  assert.match(built.systemPrompt, /sourceStatus=running/)
  assert.match(built.systemPrompt, /sourceOwner=run#run_worker/)
  assert.match(built.systemPrompt, /tool=movscript_create_draft/)
  assert.match(built.systemPrompt, /policy=manual_compensation/)
  assert.match(built.systemPrompt, /ref=agent-draft:draft_1/)
})

test('buildContext degrades oversized prompts using manifest prompt limit', () => {
  const manifest = {
    ...DEFAULT_AGENT_MANIFEST,
    metadata: {
      systemPromptCharLimit: 4000,
    },
  }
  const activeSkills = [
    {
      id: 'test.low',
      name: 'Low Skill',
      description: 'low',
      enabled: true,
      priority: 50,
      instruction: 'low skill '.repeat(300),
    },
    {
      id: 'test.workflow',
      name: 'Workflow Skill',
      description: 'workflow',
      enabled: true,
      priority: 100,
      instruction: 'workflow '.repeat(300),
    },
  ]
  const built = buildContext({
    manifest,
    skills: activeSkills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      enabled: skill.enabled,
      instruction: skill.instruction,
      compiledInstruction: skill.instruction,
      activationReason: 'trigger' as const,
      resolvedPriority: skill.priority,
      warnings: [],
    })),
    context: {
      route: { pathname: '/test' },
      projects: [],
      recentResources: [],
      attachments: [],
      memories: [],
      labels: [],
    },
    tools: { discovered: [], available: [], blocked: [], byName: {} },
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    memories: [],
    warnings: [],
    history: [],
    userMessage: 'hello',
  })

  assert.equal(built.debugParts.some((part) => part.id === 'skill.test.low'), false)
  assert.equal(built.debugParts.some((part) => part.id === 'skill.test.workflow'), false)
  assert.equal(built.degraded, 'dropped_workflows')
  assert.ok(built.warnings.some((warning) => warning.includes('dropped non-critical skill')))
  assert.ok(built.systemPrompt.length <= 4000)
})
