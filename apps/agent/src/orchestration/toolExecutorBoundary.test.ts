import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import test from 'node:test'

const toolExecutorSource = readFileSync(new URL('./toolExecutor.ts', import.meta.url), 'utf8')
const toolExecutionPipelineSource = readFileSync(new URL('./toolExecutionPipeline.ts', import.meta.url), 'utf8')
const agentGraphSource = readFileSync(new URL('./agentGraph.ts', import.meta.url), 'utf8')
const agentGraphPolicyTurnSource = readFileSync(new URL('./agentGraphPolicyTurn.ts', import.meta.url), 'utf8')
const toolExecutionGateSource = readFileSync(new URL('./toolExecutionGate.ts', import.meta.url), 'utf8')
const runtimeToolHandlersSource = readFileSync(new URL('../application/runtimeToolHandlers.ts', import.meta.url), 'utf8')
const runtimeDraftOperationsSource = readFileSync(new URL('../application/runtimeDraftOperations.ts', import.meta.url), 'utf8')
const mcpExternalToolGatewaySource = readFileSync(new URL('../adapters/mcp/mcpExternalToolGatewayAdapter.ts', import.meta.url), 'utf8')
const projectStandardsHandlerSource = readFileSync(new URL('../domains/movscript/project/projectStandardsToolHandler.ts', import.meta.url), 'utf8')
const fileHandlerSource = readFileSync(new URL('../domains/core/files/fileToolHandler.ts', import.meta.url), 'utf8')
const memoryHandlerSource = readFileSync(new URL('../domains/core/memory/memoryToolHandler.ts', import.meta.url), 'utf8')
const knowledgeHandlerSource = readFileSync(new URL('../domains/core/knowledge/knowledgeToolHandler.ts', import.meta.url), 'utf8')
const videoFrameHandlerSource = readFileSync(new URL('../domains/core/media/videoFrameToolHandler.ts', import.meta.url), 'utf8')
const runtimeControlHandlerSource = readFileSync(new URL('../domains/core/runtime/runtimeControlToolHandler.ts', import.meta.url), 'utf8')
const draftApplyHandlerSource = readFileSync(new URL('../domains/movscript/draft/draftApplyToolHandler.ts', import.meta.url), 'utf8')
const draftCreateHandlerSource = readFileSync(new URL('../domains/movscript/draft/draftCreateToolHandler.ts', import.meta.url), 'utf8')

test('MovScript project standards tool is implemented behind a domain handler boundary', () => {
  assert.equal(
    toolExecutorSource.includes("if (toolName === 'movscript_project_standards_get')"),
    false,
    'toolExecutor should not directly branch on movscript_project_standards_get',
  )
  assert.equal(
    toolExecutorSource.includes('function buildProjectStandardsToolResult'),
    false,
    'MovScript project standards result shaping belongs in the MovScript project domain',
  )
  assert.equal(
    projectStandardsHandlerSource.includes("toolNames: ['movscript_project_standards_get']"),
    true,
    'MovScript project standards tool should be registered by its domain handler',
  )
})

test('core runtime control tools are implemented behind the core runtime handler boundary', () => {
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

test('memory and knowledge tools are implemented behind core domain handler boundaries', () => {
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

  for (const toolName of ['knowledge_search', 'knowledge_get']) {
    assert.equal(
      toolExecutorSource.includes(`if (toolName === '${toolName}')`),
      false,
      `toolExecutor should not directly branch on ${toolName}`,
    )
    assert.equal(
      knowledgeHandlerSource.includes(`'${toolName}'`),
      true,
      `${toolName} should be registered by the core knowledge handler`,
    )
  }
})

test('core file tools are implemented behind the core files handler boundary', () => {
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

test('core video frame extraction is implemented behind the core media handler boundary', () => {
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

test('draft apply tools are implemented behind the MovScript draft handler boundary', () => {
  for (const toolName of ['draft_apply_preview', 'draft_apply']) {
    assert.equal(
      toolExecutorSource.includes(`if (toolName === '${toolName}')`),
      false,
      `toolExecutor should not directly branch on ${toolName}`,
    )
    assert.equal(
      draftApplyHandlerSource.includes(`'${toolName}'`),
      true,
      `${toolName} should be registered by the MovScript draft apply handler`,
    )
  }
})

test('draft apply handler applies and previews through ports', () => {
  assert.equal(
    draftApplyHandlerSource.includes('BackendApplyClient'),
    false,
    'draftApplyToolHandler should not depend on the backend apply client type',
  )
  assert.equal(
    draftApplyHandlerSource.includes('BackendApplyHTTPError'),
    false,
    'draftApplyToolHandler should not handle backend transport errors directly',
  )
  assert.equal(
    draftApplyHandlerSource.includes('backendApplyClient'),
    false,
    'draftApplyToolHandler should not access the backend apply client directly',
  )
  assert.equal(
    draftApplyHandlerSource.includes('draftApplyPort.apply'),
    true,
    'draftApplyToolHandler should apply drafts through DraftApplyPort',
  )
  assert.equal(
    draftApplyHandlerSource.includes('draftApplyPreviewPort.previewApplyReview'),
    true,
    'draftApplyToolHandler should preview backend apply through DraftApplyPreviewPort',
  )
})

test('runtime draft operations apply through backend ports', () => {
  assert.equal(
    runtimeDraftOperationsSource.includes('BackendApplyHTTPError'),
    false,
    'runtimeDraftOperations should not handle backend transport errors directly',
  )
  assert.equal(
    runtimeDraftOperationsSource.includes('BackendApplyClient'),
    false,
    'runtimeDraftOperations should not depend on the backend apply client type',
  )
  assert.equal(
    runtimeDraftOperationsSource.includes('backendApplyClient'),
    false,
    'runtimeDraftOperations should not access backend apply clients directly',
  )
  assert.equal(
    runtimeDraftOperationsSource.includes('backendApplyPort.previewApplyReview'),
    true,
    'runtimeDraftOperations should preview backend apply through RuntimeDraftBackendApplyPort',
  )
  assert.equal(
    runtimeDraftOperationsSource.includes('backendApplyPort.applyReview'),
    true,
    'runtimeDraftOperations should apply backend writes through RuntimeDraftBackendApplyPort',
  )
})

test('draft create tool is implemented behind the MovScript draft handler boundary', () => {
  assert.equal(
    toolExecutorSource.includes("if (toolName === 'draft_create')"),
    false,
    'toolExecutor should not directly branch on draft_create',
  )
  assert.equal(
    draftCreateHandlerSource.includes("'draft_create'"),
    true,
    'draft_create should be registered by the MovScript draft create handler',
  )
})

test('draft create handler stays a thin runtime adapter', () => {
  assert.equal(
    draftCreateHandlerSource.split(/\r?\n/).length <= 80,
    true,
    'draftCreateToolHandler should delegate proposal creation to domain services',
  )
  assert.equal(
    draftCreateHandlerSource.includes('DRAFT_CONTENT_SCHEMA_IDS'),
    false,
    'draftCreateToolHandler should not own proposal schema validation',
  )
  assert.equal(
    draftCreateHandlerSource.includes('hydrateProjectLayer'),
    false,
    'draftCreateToolHandler should not own proposal snapshot hydration',
  )
})

test('toolExecutor has no legacy local runtime tool name branches', () => {
  assert.equal(
    /(?:toolName|call\.name) === ['"][a-z0-9_]+['"]/.test(toolExecutorSource),
    false,
    'runtime tool behavior should live behind RuntimeToolHandler implementations',
  )
})

test('runtime tool execution uses an explicit handler registry before MCP fallback', () => {
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
    toolExecutionPipelineSource.indexOf('executeRuntimeHandler(call') < toolExecutionPipelineSource.indexOf('externalToolGatewayPort.executeTool'),
    true,
    'tool execution pipeline should attempt runtime handlers before external tool fallback',
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

test('agentGraph delegates default draft apply policy', () => {
  assert.equal(
    agentGraphSource.includes('DEFAULT_DRAFT_APPLY_KIND_ORDER'),
    false,
    'agentGraph should not own domain-specific draft apply ordering',
  )
  assert.equal(
    agentGraphSource.includes('hasExplicitDraftApplyIntent'),
    false,
    'agentGraph should not own draft apply intent parsing',
  )
  assert.equal(
    agentGraphSource.includes('buildDefaultDraftApplyCalls'),
    false,
    'agentGraph should not directly construct default draft apply calls',
  )
  assert.equal(
    agentGraphSource.includes('runAgentGraphExecuteTurn'),
    true,
    'agentGraph should delegate default draft apply call construction through execute turn',
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
    agentGraphSource.includes('buildKnowledgeTrace'),
    false,
    'agentGraph should not own knowledge context trace construction',
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
    agentGraphSource.includes('applyToolPolicy'),
    false,
    'agentGraph should not directly apply tool policy',
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
    agentGraphSource.includes('runAgentGraphPolicyTurn'),
    true,
    'agentGraph should delegate policy turn decisions',
  )
  assert.equal(
    agentGraphPolicyTurnSource.includes('applyToolPolicy'),
    false,
    'policy turn should consume runtime gate decisions instead of applying tool policy directly',
  )
  assert.equal(
    agentGraphPolicyTurnSource.includes('buildInputRequest'),
    false,
    'policy turn should not construct input request DTOs directly',
  )
  assert.equal(
    agentGraphPolicyTurnSource.includes('buildPendingApprovalRequests'),
    false,
    'policy turn should not construct approval request DTOs directly',
  )
  assert.equal(
    agentGraphPolicyTurnSource.includes('buildToolExecutionGatePendingActions'),
    false,
    'policy turn should not materialize pause request DTOs directly',
  )
  assert.equal(
    agentGraphPolicyTurnSource.includes('preflightToolExecutionPipeline'),
    true,
    'policy turn should ask the tool execution pipeline for pause/allow preflight decisions',
  )
  assert.equal(
    agentGraphPolicyTurnSource.includes('preflight.policy.'),
    true,
    'policy turn should consume the pipeline-owned policy projection',
  )
  assert.equal(
    /(?:const\s+gate\s*=|preflight\.gate|gate\.)/.test(agentGraphPolicyTurnSource),
    false,
    'policy turn should not reach through pipeline preflight into the raw gate object',
  )
  assert.equal(
    agentGraphPolicyTurnSource.includes('evaluateToolExecutionGate'),
    false,
    'policy turn should not call the runtime gate directly after pipeline preflight owns pause and repair checks',
  )
  assert.equal(
    toolExecutionPipelineSource.includes('ToolExecutionPipelinePreflightPolicyView'),
    true,
    'tool execution pipeline should expose a graph-facing policy projection for preflight results',
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
    'runtime gate decision should expose approval-required calls for policy and pipeline callers',
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
    agentGraphSource.includes("from './agentGraphTypes.js'"),
    true,
    'agentGraph should import graph contracts from the type module',
  )
})

test('agentGraph helper modules depend on graph type contracts instead of the runner', () => {
  const helperFiles = listTypeScriptFiles(new URL('.', import.meta.url))
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
    agentGraphSource.includes('tool.call.policy_decision'),
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
    agentGraphSource.includes('buildPolicyDecisionTrace'),
    false,
    'agentGraph should not directly construct policy traces',
  )
  assert.equal(
    agentGraphSource.includes('runAgentGraphPolicyTurn'),
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
    agentGraphSource.includes('Default draft apply queued'),
    false,
    'agentGraph should not own default draft apply queued trace copy',
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
    'agentGraph should not own special-case concurrent tool policy',
  )
  assert.equal(
    agentGraphSource.includes("tool?.risk === 'read'"),
    false,
    'agentGraph should not own risk-based concurrent tool policy',
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

test('toolExecutor does not compose domain handlers or adapters directly', () => {
  assert.equal(
    /from ['"][^'"]*domains\//.test(toolExecutorSource),
    false,
    'toolExecutor should receive domain handlers through the runtime handler registry',
  )
  assert.equal(
    /from ['"][^'"]*adapters\//.test(toolExecutorSource),
    false,
    'toolExecutor should receive external adapters through ports',
  )
})

test('domain handlers do not import application services directly', () => {
  const domainFiles = listTypeScriptFiles(new URL('../domains/', import.meta.url))
  assert.ok(domainFiles.length > 0, 'domain files should be present')
  for (const fileURL of domainFiles) {
    const source = readFileSync(fileURL, 'utf8')
    assert.equal(
      /from ['"][^'"]*application\//.test(source),
      false,
      `${fileURL.pathname} should depend on a port or domain service instead of importing application directly`,
    )
  }
})

test('domain handlers depend on runtime ports instead of orchestration internals', () => {
  const domainFiles = listTypeScriptFiles(new URL('../domains/', import.meta.url))
  assert.ok(domainFiles.length > 0, 'domain files should be present')
  for (const fileURL of domainFiles) {
    const source = readFileSync(fileURL, 'utf8')
    assert.equal(
      /from ['"][^'"]*orchestration\//.test(source),
      false,
      `${fileURL.pathname} should depend on runtime ports instead of importing orchestration directly`,
    )
  }
})

test('MovScript domains do not import MCP transport directly', () => {
  const domainFiles = listTypeScriptFiles(new URL('../domains/movscript/', import.meta.url))
  assert.ok(domainFiles.length > 0, 'MovScript domain files should be present')
  for (const fileURL of domainFiles) {
    const source = readFileSync(fileURL, 'utf8')
    assert.equal(
      /from ['"][^'"]*mcpClient/.test(source),
      false,
      `${fileURL.pathname} should use ports instead of importing the MCP client transport`,
    )
  }
})

test('project standards handler reads project snapshots through a port', () => {
  assert.equal(
    projectStandardsHandlerSource.includes('backendApplyClient'),
    false,
    'projectStandardsToolHandler should not depend on the backend apply client directly',
  )
  assert.equal(
    projectStandardsHandlerSource.includes('.getProject('),
    false,
    'projectStandardsToolHandler should not perform backend project reads directly',
  )
  assert.equal(
    projectStandardsHandlerSource.includes('projectStandardsPort.loadProject'),
    true,
    'projectStandardsToolHandler should load projects through MovscriptProjectStandardsPort',
  )
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
