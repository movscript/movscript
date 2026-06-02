import assert from 'node:assert/strict'
import test from 'node:test'
import { MCPError } from '../../../../adapters/mcp/client/mcpClient.js'
import { InMemoryAgentWorkspaceStore } from '../../../../workspaces/store/workspaceStore.js'
import type { AgentRun, JSONValue } from '../../../../state/shared/types.js'
import { StaticToolRegistry } from '../../../../tools/registry/core/toolRegistry.js'
import {
  executeRuntimeLocalGenerationTool,
  normalizeRuntimeLocalGenerationToolError,
} from './runtimeLocalGenerationToolExecution.js'
import {
  createDefaultWorkspaceApplyPort,
  createDefaultWorkspaceApplyPreviewPort,
  createDefaultExternalToolGatewayPort,
  createDefaultWorkspaceSnapshotHydrationPort,
  createDefaultProjectStandardsPort,
  createDefaultResourceFilePort,
  createDefaultVideoFrameExtractionPort,
  createDefaultRuntimeToolHandlerRegistry,
} from '../../../shared/tools/runtimeToolHandlers.js'

const defaultRuntimeToolHandlers = createDefaultRuntimeToolHandlerRegistry()
const defaultWorkspaceApplyBackend = {
  async applyReview(): Promise<any> {
    return { performed: false, skippedReason: 'backend disabled in test' }
  },
  async previewApplyReview(): Promise<any> {
    return { performed: false, skippedReason: 'backend disabled in test' }
  },
}
const defaultWorkspaceApplyPort = createDefaultWorkspaceApplyPort(defaultWorkspaceApplyBackend)
const defaultWorkspaceApplyPreviewPort = createDefaultWorkspaceApplyPreviewPort(defaultWorkspaceApplyBackend)
const defaultProjectStandardsBackend = {
  async getProject(): Promise<any> {
    return { performed: false, skippedReason: 'backend disabled in test' }
  },
}

test('executeRuntimeLocalGenerationTool delegates generation calls through the tool executor', async () => {
  const call = {
    name: 'core_work_start' as const,
    args: { kind: 'generation_job' as JSONValue, request: { prompt: 'title card' as JSONValue } as JSONValue },
  }
  const resultValue = { status: 'started', work: { id: 'work_1', kind: 'generation_job', status: 'running' } }
  const mcpClient = {
    initialize: async () => ({}),
    callTool: async () => ({ ok: true }),
  }

  const result = await executeRuntimeLocalGenerationTool({
    call,
    run: makeRun(),
    externalToolGatewayPort: createDefaultExternalToolGatewayPort(mcpClient),
    workspaceStore: new InMemoryAgentWorkspaceStore(),
    workspaceApplyPort: defaultWorkspaceApplyPort,
    workspaceApplyPreviewPort: defaultWorkspaceApplyPreviewPort,
    workspaceSnapshotHydrationPort: createDefaultWorkspaceSnapshotHydrationPort(mcpClient),
    resourceFilePort: createDefaultResourceFilePort(mcpClient),
    videoFrameExtractionPort: createDefaultVideoFrameExtractionPort({ downloadResourceFile: async () => ({ performed: false, skippedReason: 'backend disabled in test' }) }),
    projectStandardsPort: createDefaultProjectStandardsPort(defaultProjectStandardsBackend),
    registry: new StaticToolRegistry([]),
    runtimeToolHandlers: defaultRuntimeToolHandlers,
    catalogManager: {
      startWork: async () => resultValue as JSONValue,
    } as any,
  })

  assert.equal(result.call, call)
  assert.equal(result.source, 'runtime')
  assert.deepEqual(result.result, resultValue)
})

test('executeRuntimeLocalGenerationTool normalizes backend generation errors', async () => {
  const call = {
    name: 'core_work_start' as const,
    args: { kind: 'generation_job' as JSONValue, request: { prompt: 'title card' as JSONValue } as JSONValue },
  }
  const mcpClient = {
    initialize: async () => ({}),
    callTool: async () => {
      throw new MCPError('backend rejected', -32000, {
        type: 'backend_http_error',
        status: 400,
        code: 'bad_prompt',
      })
    },
  }

  const result = await executeRuntimeLocalGenerationTool({
    call,
    run: makeRun(),
    externalToolGatewayPort: createDefaultExternalToolGatewayPort(mcpClient),
    workspaceStore: new InMemoryAgentWorkspaceStore(),
    workspaceApplyPort: defaultWorkspaceApplyPort,
    workspaceApplyPreviewPort: defaultWorkspaceApplyPreviewPort,
    workspaceSnapshotHydrationPort: createDefaultWorkspaceSnapshotHydrationPort(mcpClient),
    resourceFilePort: createDefaultResourceFilePort(mcpClient),
    videoFrameExtractionPort: createDefaultVideoFrameExtractionPort({ downloadResourceFile: async () => ({ performed: false, skippedReason: 'backend disabled in test' }) }),
    projectStandardsPort: createDefaultProjectStandardsPort(defaultProjectStandardsBackend),
    registry: new StaticToolRegistry([]),
    runtimeToolHandlers: defaultRuntimeToolHandlers,
    catalogManager: {
      startWork: async () => {
        throw new MCPError('backend rejected', -32000, {
          type: 'backend_http_error',
          status: 400,
          code: 'bad_prompt',
        })
      },
    } as any,
  })

  assert.equal(result.call, call)
  assert.equal(result.error, 'backend rejected')
  assert.equal(result.source, 'mcp')
  assert.equal(result.errorData !== undefined, true)
})

test('normalizeRuntimeLocalGenerationToolError preserves backend generation error data', () => {
  const call = {
    name: 'core_work_start' as const,
    args: { kind: 'generation_job' as JSONValue, request: { prompt: 'hello' as JSONValue } as JSONValue },
  }
  const error = new MCPError('backend rejected', -32000, {
    type: 'backend_http_error',
    status: 400,
    code: 'bad_prompt',
  })

  const result = normalizeRuntimeLocalGenerationToolError(call, error)

  assert.equal(result.call, call)
  assert.equal(result.error, 'backend rejected')
  assert.equal(result.source, 'mcp')
  assert.equal(result.errorData !== undefined, true)
})

function makeRun(): AgentRun {
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
  }
}
