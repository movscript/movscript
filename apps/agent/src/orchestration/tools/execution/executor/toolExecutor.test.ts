import assert from 'node:assert/strict'
import test from 'node:test'

import { MCPError } from '../../../../adapters/mcp/client/mcpClient.js'
import type { AgentRun, JSONValue } from '../../../../state/shared/types.js'
import { MemoryManager } from '../../../../memory/manager/memoryManager.js'
import { InMemoryAgentMemoryStore } from '../../../../memory/store/in-memory/memoryStore.js'
import { executeTool } from './toolExecutor.js'
import {
  createDefaultExternalToolGatewayPort,
  createDefaultResourceFilePort,
  createDefaultVideoFrameExtractionPort,
  createDefaultRuntimeToolHandlerRegistry,
} from '../../../../application/shared/tools/runtimeToolHandlers.js'
import { StaticToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import { createRuntimeToolHandlerRegistry } from '../../../../ports/runtime/runtimeToolHandlerPort.js'
import { DEFAULT_AGENT_MANIFEST } from '../../../../catalog/manifest/agentManifest.js'

const defaultRuntimeToolHandlers = createDefaultRuntimeToolHandlerRegistry()


function testRun(): AgentRun {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    status: 'in_progress',
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    steps: [],
  }
}

function testOptions(mcpClient: { initialize(): Promise<JSONValue>; callTool(name: string, args?: Record<string, JSONValue>): Promise<JSONValue>; readResource?(uri: string): Promise<JSONValue> }) {
  return {
    run: testRun(),
    mcpClient,
    externalToolGatewayPort: createDefaultExternalToolGatewayPort(mcpClient),
    resourceFilePort: createDefaultResourceFilePort(mcpClient),
    videoFrameExtractionPort: createDefaultVideoFrameExtractionPort({ downloadResourceFile: async () => ({ performed: false, skippedReason: 'backend disabled in test' }) }),
    registry: { get: () => undefined, list: () => [] },
    runtimeToolHandlers: defaultRuntimeToolHandlers,
    sandboxMode: false,
  }
}

test('executeTool serves runtime work wait through the runtime catalog manager', async () => {
  const calls: string[] = []
  const result = await executeTool({
    name: 'core_work_wait',
    args: { workIds: ['op_42'] },
  }, {
    ...testOptions({
      initialize: async () => {
        calls.push('mcp.initialize')
        return {}
      },
      callTool: async () => {
        calls.push('mcp.callTool')
        return {}
      },
    }),
    catalogManager: {
      inspectAgentCatalog: () => ({}),
      updateActiveSkills: () => ({}),
      updatePlan: () => ({}),
      startWork: () => ({}),
      getWork: () => ({}),
      listWork: () => ({}),
      waitWork: (_run: AgentRun, input?: Record<string, JSONValue>) => {
        calls.push(`runtime.wait:${(input?.workIds as JSONValue[] | undefined)?.join(',')}`)
        return { status: 'completed', done: true }
      },
      cancelWork: () => ({}),
    },
  })

  assert.equal(result.source, 'runtime')
  assert.deepEqual(result.result, { status: 'completed', done: true })
  assert.deepEqual(calls, ['runtime.wait:op_42'])
})

test('executeTool returns schema validation errors before runtime or external execution', async () => {
  let externalCalled = false
  const result = await executeTool({
    name: 'studio_schema_tool',
    args: { count: 'two' },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        externalCalled = true
        return {}
      },
    }),
    registry: new StaticToolRegistry([{
      name: 'studio_schema_tool',
      description: 'Validate input.',
      permission: 'studio.write',
      risk: 'write',
      source: 'runtime',
      inputSchema: {
        type: 'object',
        required: ['name', 'count'],
        properties: {
          name: { type: 'string' },
          count: { type: 'integer' },
        },
      },
      projectScoped: false,
      requiresApprovalByDefault: false,
    }]),
    runtimeToolHandlers: createRuntimeToolHandlerRegistry([{
      toolNames: ['studio_schema_tool'],
      execute() {
        throw new Error('runtime handler should not run after schema validation fails')
      },
    }]),
  })

  assert.equal(externalCalled, false)
  assert.equal(result.source, 'runtime')
  assert.match(result.error ?? '', /schema validation failed/)
  assert.equal((result.errorData as any)?.code, 'schema_invalid')
  assert.equal(result.pipeline?.stages.some((stage) => stage.name === 'schema_validation' && stage.status === 'failed'), true)
})

test('executeTool schema validation covers catalog JSON schema constraints', async () => {
  const result = await executeTool({
    name: 'studio_rich_schema_tool',
    args: {
      name: 'valid name',
      count: 0,
      mode: 'invalid',
      tags: [],
      nested: { flag: 'yes', extra: true },
      extra: 'not allowed',
      target: false,
    },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('external gateway should not run after schema validation fails')
      },
    }),
    registry: new StaticToolRegistry([{
      name: 'studio_rich_schema_tool',
      description: 'Validate richer schema constraints.',
      permission: 'studio.write',
      risk: 'write',
      source: 'runtime',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'count', 'mode', 'tags', 'nested', 'target'],
        properties: {
          name: { type: 'string', maxLength: 20 },
          count: { type: 'integer', minimum: 1, maximum: 3 },
          mode: { type: 'string', enum: ['fast', 'safe'] },
          tags: { type: 'array', minItems: 1, items: { type: 'string' } },
          nested: {
            type: 'object',
            additionalProperties: false,
            properties: {
              flag: { type: 'boolean' },
            },
          },
          target: {
            anyOf: [
              { type: 'string' },
              { type: 'number' },
            ],
          },
        },
      },
      projectScoped: false,
      requiresApprovalByDefault: false,
    }]),
  })

  const errors = (result.errorData as any)?.errors as string[]
  assert.equal((result.errorData as any)?.code, 'schema_invalid')
  assert.ok(errors.includes('args.count must be >= 1'))
  assert.ok(errors.includes('args.mode must be one of "fast", "safe"'))
  assert.ok(errors.includes('args.tags must contain at least 1 item(s)'))
  assert.ok(errors.includes('args.nested.flag expected boolean'))
  assert.ok(errors.includes('args.nested.extra is not allowed'))
  assert.ok(errors.includes('args.extra is not allowed'))
  assert.ok(errors.includes('args.target must match at least one allowed schema'))
})

test('executeTool pipeline normalizes legacy call arguments and records runtime stages', async () => {
  const result = await executeTool({
    name: 'studio_runtime_tool',
    arguments: { value: 'ok' },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('external gateway should not run for runtime handler')
      },
    }),
    registry: new StaticToolRegistry([{
      name: 'studio_runtime_tool',
      description: 'Runtime tool.',
      permission: 'studio.read',
      risk: 'read',
      source: 'runtime',
      inputSchema: {
        type: 'object',
        required: ['value'],
        properties: { value: { type: 'string' } },
      },
      projectScoped: false,
      requiresApprovalByDefault: false,
    }]),
    runtimeToolHandlers: createRuntimeToolHandlerRegistry([{
      toolNames: ['studio_runtime_tool'],
      execute(context) {
        return { result: { received: context.args.value ?? null } }
      },
    }]),
  })

  assert.deepEqual(result.result, { received: 'ok' })
  assert.equal(result.pipeline?.source, 'runtime')
  assert.equal(result.pipeline?.execution.concurrencySafe, true)
  assert.deepEqual(result.pipeline?.stages.map((stage) => `${stage.name}:${stage.status}`), [
    'resolve:completed',
    'schema_validation:completed',
    'permission_gate:skipped',
    'sandbox:skipped',
    'runtime_handler:completed',
    'external_gateway:skipped',
    'result_shaping:completed',
  ])
})

test('executeTool does not fall back to MCP for registered runtime tools without executors', async () => {
  let externalCalled = false
  const result = await executeTool({
    name: 'studio_missing_runtime_executor',
    args: { value: 'nope' },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        externalCalled = true
        return { ok: false }
      },
    }),
    registry: new StaticToolRegistry([{
      name: 'studio_missing_runtime_executor',
      description: 'Runtime tool missing an executor.',
      permission: 'studio.read',
      risk: 'read',
      source: 'runtime',
      inputSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
      },
      projectScoped: false,
      requiresApprovalByDefault: false,
    }]),
    runtimeToolHandlers: createRuntimeToolHandlerRegistry([]),
  })

  assert.equal(externalCalled, false)
  assert.equal(result.source, 'runtime')
  assert.equal((result.errorData as any)?.code, 'runtime_tool_executor_missing')
  assert.equal(result.pipeline?.route, 'runtime')
  assert.equal(result.pipeline?.stages.some((stage) => stage.name === 'external_gateway' && stage.status === 'skipped'), true)
})

test('executeTool routes registered MCP and plugin tools through the external gateway', async () => {
  const externalCalls: string[] = []
  const options = {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(name: string): Promise<JSONValue> {
        externalCalls.push(name)
        return { routed: name }
      },
    }),
    registry: new StaticToolRegistry([
      {
        name: 'studio_mcp_tool',
        description: 'MCP-owned tool.',
        permission: 'studio.mcp',
        risk: 'read',
        source: 'mcp',
        inputSchema: {},
        projectScoped: false,
        requiresApprovalByDefault: false,
      },
      {
        name: 'studio_plugin_tool',
        description: 'Plugin-owned external tool.',
        permission: 'studio.plugin',
        risk: 'read',
        source: 'plugin',
        pluginId: 'studio.plugin',
        inputSchema: {},
        projectScoped: false,
        requiresApprovalByDefault: false,
      },
    ]),
    runtimeToolHandlers: createRuntimeToolHandlerRegistry([{
      toolNames: ['studio_mcp_tool', 'studio_plugin_tool'],
      execute() {
        throw new Error('external tools should not be claimed by runtime handlers')
      },
    }]),
  }

  const mcpResult = await executeTool({ name: 'studio_mcp_tool', args: {} }, options)
  const pluginResult = await executeTool({ name: 'studio_plugin_tool', args: {} }, options)

  assert.deepEqual(externalCalls, ['studio_mcp_tool', 'studio_plugin_tool'])
  assert.equal(mcpResult.source, 'mcp')
  assert.equal(pluginResult.source, 'mcp')
  assert.equal(mcpResult.pipeline?.route, 'external')
  assert.equal(pluginResult.pipeline?.route, 'external')
  assert.equal(pluginResult.pipeline?.stages.some((stage) => stage.name === 'runtime_handler' && stage.status === 'skipped'), true)
})

test('executeTool permission gate blocks ungranted calls before runtime handlers execute', async () => {
  let runtimeCalled = false
  const result = await executeTool({
    name: 'studio_permission_tool',
    args: { value: 'blocked' },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('external gateway should not run after permission gate blocks')
      },
    }),
    registry: new StaticToolRegistry([{
      name: 'studio_permission_tool',
      description: 'Policy-gated tool.',
      permission: 'studio.write',
      risk: 'write',
      source: 'runtime',
      inputSchema: {
        type: 'object',
        required: ['value'],
        properties: { value: { type: 'string' } },
      },
      projectScoped: false,
      requiresApprovalByDefault: false,
    }]),
    runtimeToolHandlers: createRuntimeToolHandlerRegistry([{
      toolNames: ['studio_permission_tool'],
      execute() {
        runtimeCalled = true
        return { result: { ok: true } }
      },
    }]),
    permissionGate: {
      manifest: DEFAULT_AGENT_MANIFEST,
      catalog: { discovered: [], available: [], blocked: [], byName: {} },
      approvalMode: 'interactive',
    },
  })

  assert.equal(runtimeCalled, false)
  assert.match(result.error ?? '', /blocked by permissions/)
  assert.equal((result.errorData as any)?.code, 'tool_permission_blocked')
  assert.equal((result.errorData as any)?.reason, 'not_granted')
  assert.equal(result.pipeline?.stages.some((stage) => stage.name === 'permission_gate' && stage.status === 'failed'), true)
})

test('executeTool routes reference tools through the external gateway', async () => {
  const calls: string[] = []
  const options = testOptions({
    async initialize(): Promise<JSONValue> {
      return {}
    },
    async callTool(name: string): Promise<JSONValue> {
      calls.push(name)
      return { ok: true, tool: name }
    },
  })

  const search = await executeTool({
    name: 'reference_search',
    args: { query: '关键帧 分镜', domain: 'storyboard', limit: 2 },
  }, options)
  const body = await executeTool({
    name: 'reference_get',
    args: { id: 'local_reference:storyboard.hook.short_drama', maxChars: 32 },
  }, options)

  assert.deepEqual(calls, ['reference_search', 'reference_get'])
  assert.equal(search.source, 'mcp')
  assert.equal(body.source, 'mcp')
  assert.equal(search.pipeline?.route, 'external')
  assert.equal(body.pipeline?.route, 'external')
})

test('executeTool extracts local video frames and returns image parts only through supplemental model messages', async () => {
  const calls: any[] = []
  const run = testRun()
  run.metadata = {
    backendAuthToken: 'backend-token',
    backendAPIBaseURL: 'http://backend.local/api/v1',
    context: { user: { id: 7 } },
  }
  const result = await executeTool({
    name: 'core_video_extract_frames',
    args: { resource_id: 77, mode: 'range', count: 2, max_frames: 6, max_width: 320, start_sec: 0, end_sec: 2, fps: 2, timestamps_sec: [0, 1.5] },
  }, {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for local video frame extraction')
      },
    }),
    run,
    videoFrameExtractionPort: {
      async extract(input) {
        calls.push(input)
        return {
          status: 'extracted',
          resourceId: input.resourceId,
          frameCount: 2,
          durationSec: 3,
          video: { durationSec: 3, width: 1920, height: 1080, fps: 30 },
          sampling: {
            mode: input.mode ?? 'timestamps',
            timestampsSec: input.timestampsSec ?? [],
            requestedFrameCount: input.timestampsSec?.length ?? 0,
            returnedFrameCount: 2,
            maxFrames: input.maxFrames ?? 2,
            ...(input.startSec !== undefined ? { startSec: input.startSec } : {}),
            ...(input.endSec !== undefined ? { endSec: input.endSec } : {}),
            ...(input.fps !== undefined ? { fps: input.fps } : {}),
            warnings: [],
          },
          outputLayout: input.outputLayout ?? 'individual',
          download: { performed: true, method: 'GET', url: 'http://backend.local/api/v1/resources/77/file', contentType: 'video/mp4', contentLength: 1234 },
          frames: [
            { index: 1, timestampSec: 0, mimeType: 'image/jpeg', sizeBytes: 10, dataUrl: 'data:image/jpeg;base64,AAAA' },
            { index: 2, timestampSec: 1.5, mimeType: 'image/jpeg', sizeBytes: 11, dataUrl: 'data:image/jpeg;base64,BBBB' },
          ],
        }
      },
    },
  })

  assert.equal(result.source, 'runtime')
  assert.equal(calls[0]?.resourceId, 77)
  assert.equal(calls[0]?.count, 2)
  assert.equal(calls[0]?.mode, 'range')
  assert.equal(calls[0]?.maxFrames, 6)
  assert.equal(calls[0]?.startSec, 0)
  assert.equal(calls[0]?.endSec, 2)
  assert.equal(calls[0]?.fps, 2)
  assert.equal(calls[0]?.maxWidth, 320)
  assert.deepEqual(calls[0]?.timestampsSec, [0, 1.5])
  assert.equal(calls[0]?.run.metadata?.backendAuthToken, 'backend-token')
  assert.equal((result.result as any)?.video?.width, 1920)
  assert.equal((result.result as any)?.sampling?.mode, 'range')
  assert.deepEqual((result.result as any)?.sampling?.timestamps_sec, [0, 1.5])
  assert.equal((result.result as any)?.frames[0]?.image_payload, 'sent_to_model_as_image_part')
  assert.equal(JSON.stringify(result.result).includes('data:image'), false)
  assert.equal(result.supplementalMessages?.length, 1)
  const supplemental = result.supplementalMessages?.[0]
  assert.equal(supplemental?.role, 'user')
  assert.equal(supplemental?.content.filter((part: any) => part.type === 'image').length, 2)
})

test('executeTool routes workspace tools through the external gateway', async () => {
  const calls: string[] = []
  const options = testOptions({
    async initialize(): Promise<JSONValue> {
      return {}
    },
    async callTool(name: string): Promise<JSONValue> {
      calls.push(name)
      return { ok: true, tool: name }
    },
  })

  const opened = await executeTool({
    name: 'workspace_open',
    args: {
      kind: 'content_unit_workspace',
      workspace: true,
      projectId: 1,
      content: JSON.stringify({ workspace: {} }),
    },
  }, options)
  const applied = await executeTool({
    name: 'workspace_apply',
    args: { workspaceId: 'workspace_1' },
  }, options)

  assert.deepEqual(calls, ['workspace_open', 'workspace_apply'])
  assert.equal(opened.source, 'mcp')
  assert.equal(applied.source, 'mcp')
  assert.equal(opened.pipeline?.route, 'external')
  assert.equal(applied.pipeline?.route, 'external')
})

test('executeTool delegates agent file tools to the injected file system without requiring a workspace', async () => {
  const files = new Map([['/workspace/notes.md', 'alpha\nbeta\ngamma']])
  const fileSystem = {
    read(input: { ref: string }) {
      const filePath = input.ref
      const content = files.get(filePath)
      if (content === undefined) throw new Error(`missing file: ${filePath}`)
      return {
        file: { provider: 'workspace', kind: 'markdown', id: 'notes', ref: filePath },
        content,
        contentLength: content.length,
        revision: 'sha256:one',
      }
    },
    search() {
      throw new Error('search not used')
    },
    edit(input: { ref: string; edits: Array<{ type: string; oldText?: string; newText?: string }> }) {
      const filePath = input.ref
      const content = files.get(filePath)
      if (content === undefined) throw new Error(`missing file: ${filePath}`)
      const edit = input.edits[0]!
      const replacementCount = content.includes(edit.oldText ?? '') ? 1 : 0
      const next = content.replace(edit.oldText ?? '', edit.newText ?? '')
      files.set(filePath, next)
      return {
        file: { provider: 'workspace', kind: 'markdown', id: 'notes', ref: filePath },
        contentLength: next.length,
        changeSet: {
          id: 'changeset_1',
          fileRef: filePath,
          baseRevision: 'sha256:one',
          nextRevision: 'sha256:two',
          edits: input.edits,
          replacementCount,
          createdAt: '2026-05-21T00:00:00.000Z',
        },
      }
    },
  }
  const options = {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime file tools')
      },
    }),
    fileSystem: fileSystem as any,
  }

  const read = await executeTool({
    name: 'core_file_read',
    args: { ref: '/workspace/notes.md' },
  }, options)
  assert.equal((read.result as any)?.workspace, undefined)
  assert.equal((read.result as any)?.file.provider, 'workspace')
  assert.equal((read.result as any)?.content, 'alpha\nbeta\ngamma')

  const rangedRead = await executeTool({
    name: 'core_file_read',
    args: { ref: '/workspace/notes.md', startLine: 2, lineCount: 1 },
  }, options)
  assert.equal((rangedRead.result as any)?.content, 'beta')
  assert.equal((rangedRead.result as any)?.startLine, 2)
  assert.equal((rangedRead.result as any)?.endLine, 2)
  assert.equal((rangedRead.result as any)?.totalLines, 3)

  const edited = await executeTool({
    name: 'core_file_edit',
    args: {
      ref: '/workspace/notes.md',
      edits: [{
        type: 'replace_text',
        oldText: 'beta',
        newText: 'delta',
      }],
    },
  }, options)
  assert.equal((edited.result as any)?.workspace, undefined)
  assert.equal((edited.result as any)?.replacementCount, 1)
  assert.equal(files.get('/workspace/notes.md'), 'alpha\ndelta\ngamma')
})

test('executeTool reads and searches readonly movscript resources through core file tools', async () => {
  const resourceReads: string[] = []
  const options = testOptions({
    async initialize(): Promise<JSONValue> {
      return {}
    },
    async callTool(): Promise<JSONValue> {
      throw new Error('MCP tools should not be called for resource file reads')
    },
    async readResource(uri: string): Promise<JSONValue> {
      resourceReads.push(uri)
      return {
        contents: [{
          uri,
          mimeType: 'text/plain',
          text: '第一行\n老张把字条塞进伞柄\n第三行',
        }],
      }
    },
  })

  const read = await executeTool({
    name: 'core_file_read',
    args: {
      ref: 'movscript://project/5/script-version/13/content',
      startLine: 2,
      lineCount: 1,
    },
  }, options)
  assert.equal(resourceReads[0], 'movscript://project/5/script-version/13/content?startLine=2&lineCount=1&maxChars=20000')
  assert.equal((read.result as any)?.file.provider, 'mcp')
  assert.equal((read.result as any)?.content, '第一行\n老张把字条塞进伞柄\n第三行')

  const searched = await executeTool({
    name: 'core_file_search',
    args: {
      ref: 'movscript://project/5/script-version/13/content',
      query: '字条',
    },
  }, options)
  assert.equal((searched.result as any)?.matchCount, 1)
  assert.equal((searched.result as any)?.matches[0].line, 2)

  await assert.rejects(
    () => executeTool({
      name: 'core_file_edit',
      args: {
        ref: 'movscript://project/5/script-version/13/content',
        edits: [{ type: 'replace_text', oldText: '字条', newText: '纸条' }],
      },
    }, options),
    /cannot edit readonly MCP resource/,
  )
})

test('executeTool rejects invalid project ids for memory tools', async () => {
  const memoryManager = new MemoryManager(new InMemoryAgentMemoryStore())
  const options = {
    ...testOptions({
      async initialize(): Promise<JSONValue> {
        return {}
      },
      async callTool(): Promise<JSONValue> {
        throw new Error('MCP should not be called for runtime memory tools')
      },
    }),
    memoryManager,
  }
  const invalidProjectIds = [0, 42.5, Number.NaN, Number.POSITIVE_INFINITY, '42']

  for (const projectId of invalidProjectIds) {
    await assert.rejects(
      () => executeTool({
        name: 'core_memory_search',
        args: { projectId, query: 'preference' } as Record<string, JSONValue>,
      }, options),
      /search_memories requires projectId/,
    )
    await assert.rejects(
      () => executeTool({
        name: 'core_memory_get',
        args: { projectId, id: 'mem_1' } as Record<string, JSONValue>,
      }, options),
      /get_memory requires projectId/,
    )
    await assert.rejects(
      () => executeTool({
        name: 'core_memory_create',
        args: { projectId, title: 'Preference', kind: 'preference', content: 'Remember this.' } as Record<string, JSONValue>,
      }, options),
      /create_memory requires projectId/,
    )
    await assert.rejects(
      () => executeTool({
        name: 'core_memory_delete',
        args: { projectId, id: 'mem_1' } as Record<string, JSONValue>,
      }, options),
      /delete_memory requires projectId/,
    )
  }
})

test('executeTool propagates MCP validation errors without repair', async () => {
  const mcpClient = {
    async initialize(): Promise<JSONValue> {
      return {}
    },
    async callTool(): Promise<JSONValue> {
      throw new MCPError('invalid', -32000, {
        type: 'backend_http_error',
        status: 400,
        suggested_fix: { duration: '5' },
      })
    },
  }

  await assert.rejects(
    executeTool({ name: 'generation_model_list', args: { capability: 'video' } }, testOptions(mcpClient)),
    MCPError,
  )
})
