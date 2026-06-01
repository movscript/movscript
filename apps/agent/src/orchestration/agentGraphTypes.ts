import type { AgentManifest } from '../catalog/agentManifest.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import type { NormalizedClientInput } from '../context/normalizeClientInput.js'
import type { SkillDiscoverySummary } from '../contextManager/modelContextBuilder.js'
import type { AgentDraftStore } from '../drafts/draftStore.js'
import type { GenerationEvent } from '../generation/generationEvents.js'
import type { KnowledgeManager } from '../knowledge/knowledgeManager.js'
import type { AgentMemory } from '../memory/types.js'
import type { MemoryManager } from '../memory/memoryManager.js'
import type {
  ConfiguredRuntimeModelConfig,
  RuntimeModelAuthContext,
} from '../model/modelConfig.js'
import type { RuntimeModelRouter } from '../model/modelRouter.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { AgentToolResultStore } from '../state/toolResultStore.js'
import type { CoreResourceFilePort } from '../ports/core/resourceFilePort.js'
import type { CoreVideoFrameExtractionPort } from '../ports/core/videoFrameExtractionPort.js'
import type { DraftApplyPort } from '../ports/draft/draftApplyPort.js'
import type { DraftApplyPreviewPort } from '../ports/draft/draftApplyPreviewPort.js'
import type { DraftProposalSnapshotHydrationPort } from '../ports/draft/proposalSnapshotHydrationPort.js'
import type { MovscriptProjectStandardsPort } from '../ports/movscript/projectStandardsPort.js'
import type {
  AgentCatalogToolManager,
  RuntimeToolHandlerRegistry,
} from '../ports/runtime/runtimeToolHandlerPort.js'
import type { ExternalToolGatewayPort } from '../ports/tools/externalToolGatewayPort.js'
import type {
  AgentDebugContextPanel,
  AgentMessage,
  AgentRun,
  AgentRunPolicy,
  AgentTraceEventKind,
  JSONValue,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
  ToolCall,
} from '../state/types.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'

export interface AgentGraphTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: 'started' | 'completed' | 'blocked' | 'failed' | 'info'
  roundIndex: number
  roundLabel: string
  roundSource: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  stepId?: string
  toolName?: string
  data?: unknown
  durationMs?: number
  volatile?: boolean
  volatileKey?: string
}

export interface AgentGraphInput {
  run: AgentRun
  threadMessages: AgentMessage[]
  manifest: AgentManifest
  capabilities: ResolvedToolCatalog
  skills: ResolvedAgentSkill[]
  skillDiscovery?: SkillDiscoverySummary
  context: AgentDebugContextPanel
  memories: AgentMemory[]
  warnings: string[]
  command?: AgentCommandRuntime
  userMessage?: string
  clientInput?: NormalizedClientInput
  rootUserMessageId?: string
  runtimeState?: unknown
  config: ConfiguredRuntimeModelConfig
  modelRouter?: RuntimeModelRouter
  auth: RuntimeModelAuthContext
  policy: AgentRunPolicy
  draftStore: AgentDraftStore
  externalToolGatewayPort: ExternalToolGatewayPort
  draftApplyPort: DraftApplyPort
  draftApplyPreviewPort: DraftApplyPreviewPort
  proposalSnapshotHydrationPort: DraftProposalSnapshotHydrationPort
  resourceFilePort: CoreResourceFilePort
  videoFrameExtractionPort: CoreVideoFrameExtractionPort
  projectStandardsPort: MovscriptProjectStandardsPort
  registry: ToolRegistry
  runtimeToolHandlers: RuntimeToolHandlerRegistry
  contractResolver?: AgentRuntimeContractResolver
  memoryManager?: MemoryManager
  knowledgeManager?: KnowledgeManager
  catalogManager?: AgentCatalogToolManager
  toolResultStore?: AgentToolResultStore
  forcedToolCalls?: ToolCall[]
  approvedToolNames?: string[]
  signal?: AbortSignal
  onCatalogRefresh?: () => Promise<{
    manifest: AgentManifest
    capabilities: ResolvedToolCatalog
    skills: ResolvedAgentSkill[]
    skillDiscovery?: SkillDiscoverySummary
    registry: ToolRegistry
    warnings: string[]
  }>
  onTrace: (input: AgentGraphTraceInput) => void
  onGenerationEvent?: (event: GenerationEvent, trace: Omit<AgentGraphTraceInput, 'kind' | 'title' | 'summary' | 'status' | 'data'>) => void
  getThreadMessages?: () => AgentMessage[]
  onRuntimeInputConsumed?: (
    messages: AgentMessage[],
    trace: Omit<AgentGraphTraceInput, 'kind' | 'title' | 'summary' | 'status' | 'data'>,
  ) => void
  onStepCreate: (type: 'tool_call' | 'message', roundIndex: number, roundLabel: string, roundSource: AgentGraphTraceInput['roundSource'], toolName?: string, args?: Record<string, JSONValue>) => string
  onStepComplete: (stepId: string, result?: JSONValue, error?: string, sandboxed?: boolean) => void
}
