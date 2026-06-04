import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import test from 'node:test'

const toolExecutorSource = readFileSync(new URL('../executor/toolExecutor.ts', import.meta.url), 'utf8')
const toolExecutionPipelineSource = readFileSync(new URL('../pipeline/toolExecutionPipeline.ts', import.meta.url), 'utf8')
const agentGraphSource = readFileSync(new URL('../../../graph/runner/agentGraph.ts', import.meta.url), 'utf8')
const agentGraphPermissionTurnSource = readFileSync(new URL('../../../model/permissions/turn/agentGraphPermissionTurn.ts', import.meta.url), 'utf8')
const toolExecutionGateSource = readFileSync(new URL('../../gate/toolExecutionGate.ts', import.meta.url), 'utf8')
const runtimeToolHandlerPortSource = readFileSync(new URL('../../../../ports/runtime/runtimeToolHandlerPort.ts', import.meta.url), 'utf8')
const agentGraphTypesSource = readFileSync(new URL('../../../graph/types/agentGraphTypes.ts', import.meta.url), 'utf8')
const runtimeToolHandlersSource = readFileSync(new URL('../../../../application/shared/tools/runtimeToolHandlers.ts', import.meta.url), 'utf8')
const mcpExternalToolGatewaySource = readFileSync(new URL('../../../../adapters/mcp/gateway/mcpExternalToolGatewayAdapter.ts', import.meta.url), 'utf8')
const mcpFocusContextAdapterSource = readFileSync(new URL('../../../../adapters/mcp/focus/mcpFocusContextAdapter.ts', import.meta.url), 'utf8')
const fileHandlerSource = readFileSync(new URL('../../../../tools/handlers/core/files/fileToolHandler.ts', import.meta.url), 'utf8')
const memoryHandlerSource = readFileSync(new URL('../../../../tools/handlers/core/memory/memoryToolHandler.ts', import.meta.url), 'utf8')
const videoFrameHandlerSource = readFileSync(new URL('../../../../tools/handlers/core/video/videoFrameToolHandler.ts', import.meta.url), 'utf8')
const runtimeControlHandlerSource = readFileSync(new URL('../../../../tools/handlers/core/runtime-control/runtimeControlToolHandler.ts', import.meta.url), 'utf8')
const runtimeFocusContextSource = readFileSync(new URL('../../../../application/run/view/focus/runtimeFocusContext.ts', import.meta.url), 'utf8')
const runtimeRunPreviewSource = readFileSync(new URL('../../../../application/run/preview/core/runtimeRunPreview.ts', import.meta.url), 'utf8')
const imagePreprocessingSource = readFileSync(new URL('../../../../media/image/imagePreprocessing.ts', import.meta.url), 'utf8')
const videoFrameExtractionSource = readFileSync(new URL('../../../../media/video/videoFrameExtraction.ts', import.meta.url), 'utf8')
const backendVideoFrameExtractionAdapterSource = readFileSync(new URL('../../../../adapters/media/backendVideoFrameExtractionAdapter.ts', import.meta.url), 'utf8')

test('legacy business tools are not registered by runtime handlers', () => {
  for (const toolName of ['movscript_project_standards_get', 'reference_search', 'reference_get']) {
    assert.equal(
      toolExecutorSource.includes(`if (toolName === '${toolName}')`),
      false,
      `toolExecutor should not directly branch on ${toolName}`,
    )
    assert.equal(
      runtimeToolHandlersSource.includes(toolName),
      false,
      `${toolName} should be provided by MCP or installed plugins, not runtime handlers`,
    )
  }
})

test('reference tools are provided externally instead of by runtime context managers', () => {
  for (const source of [
    runtimeToolHandlerPortSource,
    toolExecutorSource,
    toolExecutionPipelineSource,
    agentGraphTypesSource,
  ]) {
    assert.equal(
      source.includes('referenceManager') || source.includes('ReferenceManager'),
      false,
      'reference business access should stay behind MCP/plugins, not runtime tool context',
    )
  }
})

test('core runtime control tools are implemented behind the core tool handler boundary', () => {
  for (const toolName of [
    'core_catalog_inspect',
    'core_skill_update',
    'core_update_plan',
    'core_work_start',
    'core_work_get',
    'core_work_list',
    'core_work_wait',
    'core_work_cancel',
  ]) {
    assert.equal(
      toolExecutorSource.includes(`if (toolName === '${toolName}')`),
      false,
      `toolExecutor should not directly branch on ${toolName}`,
    )
    assert.equal(
      runtimeControlHandlerSource.includes(`'${toolName}'`),
      true,
      `${toolName} should be registered by the core runtime control handler`,
    )
  }
})

test('memory tools are implemented behind core tool handler boundaries', () => {
  for (const toolName of [
    'core_memory_search',
    'core_memory_get',
    'core_memory_create',
    'core_memory_delete',
  ]) {
    assert.equal(
      toolExecutorSource.includes(`if (toolName === '${toolName}')`),
      false,
      `toolExecutor should not directly branch on ${toolName}`,
    )
    assert.equal(
      memoryHandlerSource.includes(`'${toolName}'`),
      true,
      `${toolName} should be registered by the core memory handler`,
    )
  }

})

test('core file tools are implemented behind the core tool handler boundary', () => {
  for (const toolName of [
    'core_file_read',
    'core_file_search',
    'core_file_edit',
  ]) {
    assert.equal(
      toolExecutorSource.includes(`if (toolName === '${toolName}')`),
      false,
      `toolExecutor should not directly branch on ${toolName}`,
    )
    assert.equal(
      fileHandlerSource.includes(`'${toolName}'`),
      true,
      `${toolName} should be registered by the core file handler`,
    )
  }
})

test('core video frame extraction is implemented behind the core tool handler boundary', () => {
  assert.equal(
    toolExecutorSource.includes("call.name === 'core_video_extract_frames'"),
    false,
    'toolExecutor should not directly branch on core_video_extract_frames',
  )
  assert.equal(
    videoFrameHandlerSource.includes("'core_video_extract_frames'"),
    true,
    'core_video_extract_frames should be registered by the core media handler',
  )
})

test('core video frame handler extracts frames through a port', () => {
  assert.equal(
    videoFrameHandlerSource.includes('backendApplyClient'),
    false,
    'videoFrameToolHandler should not depend on the backend client directly',
  )
  assert.equal(
    videoFrameHandlerSource.includes('extractVideoFramesFromBackendResource'),
    false,
    'videoFrameToolHandler should not import the backend resource extraction adapter',
  )
  assert.equal(
    videoFrameHandlerSource.includes('videoFrameExtractionPort.extract'),
    true,
    'videoFrameToolHandler should extract frames through CoreVideoFrameExtractionPort',
  )
})

test('media runtime code depends on resource download ports instead of backend apply clients', () => {
  for (const source of [
    imagePreprocessingSource,
    videoFrameExtractionSource,
    backendVideoFrameExtractionAdapterSource,
    runtimeToolHandlersSource,
  ]) {
    assert.equal(
      source.includes('BackendApplyClient') || source.includes('backendApplyClient'),
      false,
      'media runtime code should depend on ResourceFileDownloadPort, not backend apply clients',
    )
    assert.equal(
      source.includes('ResourceFileDownloadPort'),
      true,
      'media runtime code should expose resource download as a narrow port',
    )
  }
})

test('workspace lifecycle tools are not implemented by agent runtime handlers', () => {
  for (const toolName of ['workspace_open', 'workspace_validate', 'workspace_apply']) {
    assert.equal(
      toolExecutorSource.includes(`if (toolName === '${toolName}')`),
      false,
      `toolExecutor should not directly branch on ${toolName}`,
    )
    assert.equal(
      runtimeToolHandlersSource.includes(toolName),
      false,
      `${toolName} should be provided by frontend MCP/plugins, not agent runtime handlers`,
    )
  }
  assert.equal(
    existsSync(new URL('../../../../tools/handlers/workspaces/open/workspaceOpenToolHandler.ts', import.meta.url)),
    false,
    'workspace_open runtime handler should not exist in the agent',
  )
  assert.equal(
    existsSync(new URL('../../../../tools/handlers/workspaces/apply/workspaceApplyToolHandler.ts', import.meta.url)),
    false,
    'workspace apply runtime handler should not exist in the agent',
  )
})

test('agent runtime no longer owns workspace operations or workspace services', () => {
  assert.equal(
    existsSync(new URL('../../../../application/workspace/operations/runtimeWorkspaceOperations.ts', import.meta.url)),
    false,
    'runtime workspace operations should not exist in the agent',
  )
  assert.equal(
    existsSync(new URL('../../../../application/workspace/bridge/runtimeWorkspaceOperationsBridge.ts', import.meta.url)),
    false,
    'runtime workspace operations bridge should not exist in the agent',
  )
  assert.equal(
    existsSync(new URL('../../../../workspaces/store/workspaceStore.ts', import.meta.url)),
    false,
    'agent workspace store should not exist',
  )
  assert.equal(
    existsSync(new URL('../../../../workspaces/workspace/workspaceWorkspaceCreationService.ts', import.meta.url)),
    false,
    'agent workspace creation services should not exist',
  )
  assert.equal(
    existsSync(new URL('../../../../workspaces/apply/workspaceApply.ts', import.meta.url)),
    false,
    'agent workspace apply helpers should not exist',
  )
})

test('toolExecutor has no legacy local runtime tool name branches', () => {
  assert.equal(
    /(?:toolName|call\.name) === ['"][a-z0-9_]+['"]/.test(toolExecutorSource),
    false,
    'runtime tool behavior should live behind RuntimeToolHandler implementations',
  )
})

test('runtime tool execution uses explicit source routes', () => {
  assert.equal(
    runtimeToolHandlersSource.includes('createRuntimeToolHandlerRegistry'),
    true,
    'runtime tool composition should use an explicit handler registry',
  )
  assert.equal(
    toolExecutionPipelineSource.includes('runtimeToolHandlers.get(call.name)'),
    true,
    'tool execution pipeline should resolve runtime handlers through the handler registry',
  )
  assert.equal(
    toolExecutionPipelineSource.includes("tool.source === 'mcp' || tool.source === 'plugin' ? 'external' : 'runtime'"),
    true,
    'tool execution pipeline should route MCP and plugin tools to the external gateway explicitly',
  )
  assert.equal(
    toolExecutionPipelineSource.includes('runtime tools do not fall back to external gateway'),
    true,
    'runtime tools should not implicitly fall back to MCP when no runtime executor exists',
  )
})

test('toolExecutor calls external tools through a gateway port', () => {
  assert.equal(
    toolExecutorSource.includes('MCPClient'),
    false,
    'toolExecutor should not depend on the MCP transport type',
  )
  assert.equal(
    toolExecutorSource.includes('mcpClient'),
    false,
    'toolExecutor should not initialize or call MCP directly',
  )
  assert.equal(
    toolExecutionPipelineSource.includes('externalToolGatewayPort.executeTool'),
    true,
    'tool execution pipeline should call non-runtime tools through ExternalToolGatewayPort',
  )
  assert.equal(
    mcpExternalToolGatewaySource.includes('runtimeToolName'),
    true,
    'MCP tool name translation belongs in the MCP external tool gateway adapter',
  )
})

test('frontend focus context is accessed through a port backed by the external tool gateway', () => {
  for (const source of [runtimeFocusContextSource, runtimeRunPreviewSource]) {
    assert.equal(
      source.includes(".callTool('get_focus_context'") || source.includes('.callTool("get_focus_context"'),
      false,
      'application focus context code should not call the MCP transport directly',
    )
    assert.equal(
      source.includes('focusContextPort.getFocusContext'),
      true,
      'application focus context code should depend on RuntimeFocusContextPort',
    )
  }
  assert.equal(
    mcpFocusContextAdapterSource.includes('externalToolGatewayPort.executeTool'),
    true,
    'focus context adapter should use ExternalToolGatewayPort to reach frontend/plugin tools',
  )
})

test('agentGraph delegates default workspace apply policy', () => {
  assert.equal(
    agentGraphSource.includes('DEFAULT_WORKSPACE_APPLY_KIND_ORDER'),
    false,
    'agentGraph should not own domain-specific workspace apply ordering',
  )
  assert.equal(
    agentGraphSource.includes('hasExplicitWorkspaceApplyIntent'),
    false,
    'agentGraph should not own workspace apply intent parsing',
  )
  assert.equal(
    agentGraphSource.includes('buildDefaultWorkspaceApplyCalls'),
    false,
    'agentGraph should not directly construct default workspace apply calls',
  )
  assert.equal(
    agentGraphSource.includes('runAgentGraphExecuteTurn'),
    true,
    'agentGraph should delegate default workspace apply call construction through execute turn',
  )
})

test('agentGraph delegates generation monitoring details', () => {
  assert.equal(
    agentGraphSource.includes('generationEventChangeKey'),
    false,
    'agentGraph should not own generation monitor change-key logic',
  )
  assert.equal(
    agentGraphSource.includes('buildGenerationTimeoutEvent'),
    false,
    'agentGraph should not own generation monitor timeout event construction',
  )
  assert.equal(
    agentGraphSource.includes('monitorGenerationJob'),
    false,
    'agentGraph should not directly coordinate generation job monitoring',
  )
})

test('agentGraph delegates tool context ledger tracing', () => {
  assert.equal(
    agentGraphSource.includes('buildLedgerUpdatedTrace'),
    false,
    'agentGraph should not own context ledger trace construction',
  )
  assert.equal(
    agentGraphSource.includes('buildReferenceTrace'),
    false,
    'agentGraph should not own reference context trace construction',
  )
  assert.equal(
    agentGraphSource.includes('recordToolResultContext'),
    false,
    'agentGraph should not own tool context trace recording',
  )
})

test('agentGraph delegates catalog refresh trace construction', () => {
  assert.equal(
    agentGraphSource.includes('buildCatalogRefreshSummary'),
    false,
    'agentGraph should not own catalog refresh summary formatting',
  )
  assert.equal(
    agentGraphSource.includes('buildCatalogRefreshTrace'),
    false,
    'agentGraph should not directly construct catalog refresh traces',
  )
  assert.equal(
    agentGraphSource.includes('runAgentGraphExecuteTurn'),
    true,
    'agentGraph should delegate catalog refresh trace construction through execute turn',
  )
})

test('agentGraph delegates policy helper details', () => {
  assert.equal(
    agentGraphSource.includes('applyToolPermissions'),
    false,
    'agentGraph should not directly apply tool permission',
  )
  assert.equal(
    agentGraphSource.includes('TOOL_SKILL_ACTIVATION_REPAIRS'),
    false,
    'agentGraph should not own skill activation repair lookup tables',
  )
  assert.equal(
    agentGraphSource.includes('function normalizeChoices'),
    false,
    'agentGraph should not own user input request argument normalization',
  )
  assert.equal(
    agentGraphSource.includes('buildSkillActivationRepairCalls'),
    false,
    'agentGraph should not directly construct skill activation repair calls',
  )
  assert.equal(
    agentGraphSource.includes('buildInputRequest'),
    false,
    'agentGraph should not directly construct user input requests',
  )
  assert.equal(
    agentGraphSource.includes('runAgentGraphPermissionTurn'),
    true,
    'agentGraph should delegate permission turn decisions',
  )
  assert.equal(
    agentGraphPermissionTurnSource.includes('applyToolPermissions'),
    false,
    'permission turn should consume runtime gate decisions instead of applying tool permission directly',
  )
  assert.equal(
    agentGraphPermissionTurnSource.includes('buildInputRequest'),
    false,
    'permission turn should not construct input request DTOs directly',
  )
  assert.equal(
    agentGraphPermissionTurnSource.includes('buildPendingApprovalRequests'),
    false,
    'permission turn should not construct approval request DTOs directly',
  )
  assert.equal(
    agentGraphPermissionTurnSource.includes('buildToolExecutionGatePendingActions'),
    false,
    'permission turn should not materialize pause request DTOs directly',
  )
  assert.equal(
    agentGraphPermissionTurnSource.includes('preflightToolExecutionPipeline'),
    true,
    'permission turn should ask the tool execution pipeline for pause/allow preflight decisions',
  )
  assert.equal(
    agentGraphPermissionTurnSource.includes('preflight.permissions.'),
    true,
    'permission turn should consume the pipeline-owned permissions projection',
  )
  assert.equal(
    /(?:const\s+gate\s*=|preflight\.gate|gate\.)/.test(agentGraphPermissionTurnSource),
    false,
    'permission turn should not reach through pipeline preflight into the raw gate object',
  )
  assert.equal(
    agentGraphPermissionTurnSource.includes('evaluateToolExecutionGate'),
    false,
    'permission turn should not call the runtime gate directly after pipeline preflight owns pause and repair checks',
  )
  assert.equal(
    toolExecutionPipelineSource.includes('ToolExecutionPipelinePreflightPermissionsView'),
    true,
    'tool execution pipeline should expose a graph-facing permissions projection for preflight results',
  )
  assert.equal(
    toolExecutionPipelineSource.includes('evaluateToolExecutionGate'),
    true,
    'tool execution pipeline should reuse the runtime gate decision object for defensive policy checks',
  )
  assert.equal(
    toolExecutionPipelineSource.includes('buildToolExecutionGatePendingActions'),
    true,
    'tool execution pipeline should own pending approval/input request materialization',
  )
  assert.equal(
    toolExecutionPipelineSource.includes('buildSkillActivationRepairCalls'),
    true,
    'tool execution pipeline should own skill activation repair preflight',
  )
  assert.equal(
    toolExecutionGateSource.includes('approvalBlockedToolCalls'),
    true,
    'runtime gate decision should expose approval-required calls for permissions and pipeline callers',
  )
  assert.equal(
    toolExecutionGateSource.includes('buildToolExecutionGatePendingActions'),
    true,
    'runtime gate should own pending approval/input request construction',
  )
})

test('agentGraph delegates tool result summary formatting', () => {
  assert.equal(
    agentGraphSource.includes('summarizeCatalogInspectResult'),
    false,
    'agentGraph should not own catalog inspect result summary formatting',
  )
  assert.equal(
    agentGraphSource.includes('summarizeSkillStateResult'),
    false,
    'agentGraph should not own skill state result summary formatting',
  )
  assert.equal(
    agentGraphSource.includes('summarizeResult'),
    false,
    'agentGraph should not own or directly invoke tool result summary formatting',
  )
})

test('agentGraph delegates rollback policy classification', () => {
  assert.equal(
    agentGraphSource.includes('isBackendWriteTool'),
    false,
    'agentGraph should not own backend write rollback classification',
  )
  assert.equal(
    agentGraphSource.includes('isRuntimeStateTool'),
    false,
    'agentGraph should not own runtime state rollback classification',
  )
  assert.equal(
    agentGraphSource.includes('buildRollbackRecord'),
    false,
    'agentGraph should not directly construct rollback records',
  )
})

test('agentGraph delegates model tool call parsing helpers', () => {
  assert.equal(
    agentGraphSource.includes('function parseArgs'),
    false,
    'agentGraph should not own model tool argument parsing',
  )
  assert.equal(
    agentGraphSource.includes('function formatToolCallStreamSummary'),
    false,
    'agentGraph should not own model tool call stream summary formatting',
  )
  assert.equal(
    agentGraphSource.includes('buildModelToolCallsRequestedTrace'),
    true,
    'agentGraph should delegate model tool call trace construction',
  )
})

test('agentGraph delegates model trace construction details', () => {
  assert.equal(
    agentGraphSource.includes('contextBundleTraceData'),
    false,
    'agentGraph should not own context bundle trace payload construction',
  )
  assert.equal(
    agentGraphSource.includes('summarizeModelHTTPTrace'),
    false,
    'agentGraph should not own model HTTP trace summarization',
  )
  assert.equal(
    agentGraphSource.includes('createModelTraceCallback'),
    false,
    'agentGraph should not directly handle model transport trace callbacks',
  )
  assert.equal(
    agentGraphSource.includes('buildModelRoundCompletedTrace'),
    false,
    'agentGraph should not directly construct model round completion traces',
  )
  assert.equal(
    agentGraphSource.includes('callReasoningModelTurn'),
    true,
    'agentGraph should delegate model routing and transport execution',
  )
})

test('agentGraph delegates model transport call details', () => {
  assert.equal(
    agentGraphSource.includes('modelRouter.call'),
    false,
    'agentGraph should not call the model transport directly',
  )
  assert.equal(
    agentGraphSource.includes('createDefaultRuntimeModelRouter'),
    false,
    'agentGraph should not compose model router defaults directly',
  )
  assert.equal(
    agentGraphSource.includes('buildModelRetryInputRequest'),
    false,
    'agentGraph should not own model retry input construction',
  )
  assert.equal(
    agentGraphSource.includes('callReasoningModelTurn'),
    true,
    'agentGraph should delegate model round trace construction',
  )
})

test('agentGraph delegates model input preparation details', () => {
  assert.equal(
    agentGraphSource.includes('collectPendingRuntimeInputMessages'),
    false,
    'agentGraph should not own runtime input message collection',
  )
  assert.equal(
    agentGraphSource.includes('appendRuntimeInputMessagesToUserMessage'),
    false,
    'agentGraph should not own runtime input message formatting',
  )
  assert.equal(
    agentGraphSource.includes('compactThreadHistory'),
    false,
    'agentGraph should not own prompt history compaction',
  )
  assert.equal(
    agentGraphSource.includes('prepareModelInput'),
    true,
    'agentGraph should delegate model input preparation',
  )
  assert.equal(
    agentGraphSource.includes('composeModelTurn'),
    false,
    'agentGraph should not own model turn context composition',
  )
  assert.equal(
    agentGraphSource.includes('composeAgentGraphModelTurn'),
    true,
    'agentGraph should delegate model turn context composition',
  )
})

test('agentGraph delegates final result shaping', () => {
  assert.equal(
    agentGraphSource.includes('function collectAssistantContents'),
    false,
    'agentGraph should not own assistant content aggregation',
  )
  assert.equal(
    agentGraphSource.includes('function getLastAssistantContent'),
    false,
    'agentGraph should not own assistant content fallback extraction',
  )
  assert.equal(
    agentGraphSource.includes('buildAgentGraphResult('),
    true,
    'agentGraph should delegate final DTO shaping to a dedicated helper',
  )
})

test('agentGraph exposes graph contracts from a dedicated type module', () => {
  assert.equal(
    agentGraphSource.includes('export interface AgentGraphInput'),
    false,
    'agentGraph should not own the graph input contract',
  )
  assert.equal(
    agentGraphSource.includes('export interface AgentGraphTraceInput'),
    false,
    'agentGraph should not own the graph trace contract',
  )
  assert.equal(
    agentGraphSource.includes("from '../types/agentGraphTypes.js'"),
    true,
    'agentGraph should import graph contracts from the type module',
  )
})

test('agentGraph helper modules depend on graph type contracts instead of the runner', () => {
  const helperFiles = listTypeScriptFiles(new URL('../../../graph/', import.meta.url))
    .filter((fileURL) => {
      const pathname = fileURL.pathname
      if (!pathname.includes('/agentGraph')) return false
      return !pathname.endsWith('/agentGraph.ts')
        && !pathname.endsWith('/agentGraph.test.ts')
        && !pathname.endsWith('/agentGraphTypes.ts')
    })
  assert.ok(helperFiles.length > 0, 'agentGraph helper files should be present')
  for (const fileURL of helperFiles) {
    const source = readFileSync(fileURL, 'utf8')
    assert.equal(
      source.includes("from './agentGraph.js'"),
      false,
      `${fileURL.pathname} should import AgentGraphInput/TraceInput from agentGraphTypes`,
    )
  }
})

test('agentGraph delegates forced tool call injection details', () => {
  assert.equal(
    agentGraphSource.includes('Forced tool calls injected'),
    false,
    'agentGraph should not own forced tool call trace copy',
  )
  assert.equal(
    agentGraphSource.includes('buildForcedToolCallInjection'),
    true,
    'agentGraph should delegate forced tool call injection construction',
  )
})

test('agentGraph delegates policy trace construction details', () => {
  assert.equal(
    agentGraphSource.includes('tool.call.permission_decision'),
    false,
    'agentGraph should not own policy decision trace payloads',
  )
  assert.equal(
    agentGraphSource.includes('approval.requested'),
    false,
    'agentGraph should not own approval request trace payloads',
  )
  assert.equal(
    agentGraphSource.includes('tool.call.skill_activation_repair'),
    false,
    'agentGraph should not own skill activation repair trace payloads',
  )
  assert.equal(
    agentGraphSource.includes('buildToolPermissionDecisionTrace'),
    false,
    'agentGraph should not directly construct policy traces',
  )
  assert.equal(
    agentGraphSource.includes('runAgentGraphPermissionTurn'),
    true,
    'agentGraph should delegate policy trace and decision construction',
  )
})

test('agentGraph delegates tool execution trace construction details', () => {
  assert.equal(
    agentGraphSource.includes('summarizeToolCallTrace'),
    false,
    'agentGraph should not own tool call trace summarization',
  )
  assert.equal(
    agentGraphSource.includes('Tool completed:'),
    false,
    'agentGraph should not own successful tool trace copy',
  )
  assert.equal(
    agentGraphSource.includes('buildToolCompletedTrace'),
    false,
    'agentGraph should not directly construct successful tool traces',
  )
  assert.equal(
    agentGraphSource.includes('buildToolFailedTrace'),
    false,
    'agentGraph should not directly construct failed tool traces',
  )
  assert.equal(
    agentGraphSource.includes('executeToolTurn'),
    false,
    'agentGraph should not directly execute single tool turns',
  )
  assert.equal(
    agentGraphSource.includes('runAgentGraphExecuteTurn'),
    true,
    'agentGraph should delegate execute turn orchestration',
  )
})

test('agentGraph delegates execute node aggregate trace construction', () => {
  assert.equal(
    agentGraphSource.includes('Read tools executed concurrently'),
    false,
    'agentGraph should not own concurrent read trace copy',
  )
  assert.equal(
    agentGraphSource.includes('Default workspace apply queued'),
    false,
    'agentGraph should not own default workspace apply queued trace copy',
  )
  assert.equal(
    agentGraphSource.includes('approval.remaining'),
    false,
    'agentGraph should not own remaining approval trace payloads',
  )
  assert.equal(
    agentGraphSource.includes('buildConcurrentReadToolsTrace'),
    false,
    'agentGraph should not directly construct execute node aggregate traces',
  )
  assert.equal(
    agentGraphSource.includes('runAgentGraphExecuteTurn'),
    true,
    'agentGraph should delegate execute node aggregate trace construction',
  )
})

test('agentGraph delegates execution concurrency policy', () => {
  assert.equal(
    agentGraphSource.includes("call.name === 'core_work_get'"),
    false,
    'agentGraph should not own special-case concurrent execution rule',
  )
  assert.equal(
    agentGraphSource.includes("tool?.risk === 'read'"),
    false,
    'agentGraph should not own risk-based concurrent execution rule',
  )
  assert.equal(
    agentGraphSource.includes('canExecuteConcurrently'),
    false,
    'agentGraph should not directly invoke concurrent execution policy',
  )
  assert.equal(
    agentGraphSource.includes('runAgentGraphExecuteTurn'),
    true,
    'agentGraph should delegate concurrent execution policy',
  )
})

test('toolExecutor does not compose tool handlers or adapters directly', () => {
  assert.equal(
    /from ['"][^'"]*domains\//.test(toolExecutorSource),
    false,
    'toolExecutor should receive tool handlers through the runtime handler registry',
  )
  assert.equal(
    /from ['"][^'"]*adapters\//.test(toolExecutorSource),
    false,
    'toolExecutor should receive external adapters through ports',
  )
})

test('tool handlers do not import application services directly', () => {
  const handlerFiles = listTypeScriptFiles(new URL('../../../../tools/handlers/', import.meta.url))
  assert.ok(handlerFiles.length > 0, 'tool handler files should be present')
  for (const fileURL of handlerFiles) {
    const source = readFileSync(fileURL, 'utf8')
    assert.equal(
      /from ['"][^'"]*application\//.test(source),
      false,
      `${fileURL.pathname} should depend on a port or domain service instead of importing application directly`,
    )
  }
})

test('tool handlers depend on runtime ports instead of orchestration internals', () => {
  const handlerFiles = listTypeScriptFiles(new URL('../../../../tools/handlers/', import.meta.url))
  assert.ok(handlerFiles.length > 0, 'tool handler files should be present')
  for (const fileURL of handlerFiles) {
    const source = readFileSync(fileURL, 'utf8')
    assert.equal(
      /from ['"][^'"]*orchestration\//.test(source),
      false,
      `${fileURL.pathname} should depend on runtime ports instead of importing orchestration directly`,
    )
  }
})

test('core file handler reads readonly resources through a port', () => {
  assert.equal(
    fileHandlerSource.includes('mcpClient'),
    false,
    'fileToolHandler should not depend on the MCP client directly',
  )
  assert.equal(
    fileHandlerSource.includes('readResource'),
    false,
    'fileToolHandler should not read MCP resources directly',
  )
  assert.equal(
    fileHandlerSource.includes('resourceFilePort.readFile'),
    true,
    'fileToolHandler should read external resources through CoreResourceFilePort',
  )
})

function listTypeScriptFiles(directoryURL: URL): URL[] {
  const files: URL[] = []
  for (const entry of readdirSync(directoryURL, { withFileTypes: true })) {
    const entryURL = new URL(entry.name, directoryURL)
    if (entry.isDirectory()) {
      files.push(...listTypeScriptFiles(new URL(`${entry.name}/`, directoryURL)))
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
    if (!statSync(entryURL).isFile()) continue
    files.push(entryURL)
  }
  return files
}
