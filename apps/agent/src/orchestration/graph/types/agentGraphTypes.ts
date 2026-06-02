import type { AgentManifest } from '../../../catalog/manifest/agentManifest.js'
import type { AgentCommandRuntime } from '../../../context/command/commandRouter.js'
import type { NormalizedClientInput } from '../../../context/input/client/normalizeClientInput.js'
import type { RuntimeHistoricalVisionContext, SkillDiscoverySummary } from '../../../context/prompt/builder/modelContextBuilder.js'
import type { AgentWorkspaceStore } from '../../../workspaces/store/workspaceStore.js'
import type { GenerationEvent } from '../../../generation/events/generationEvents.js'
import type { ReferenceManager } from '../../../reference/manager/referenceManager.js'
import type { AgentMemory } from '../../../memory/shared/types.js'
import type { MemoryManager } from '../../../memory/manager/memoryManager.js'
import type {
  ConfiguredRuntimeModelConfig,
  RuntimeModelAuthContext,
} from '../../../model/config/modelConfig.js'
import type { RuntimeModelRouter } from '../../../model/router/modelRouter.js'
import type { AgentRuntimeContractResolver } from '../../../contracts/runtime/runtimeContract.js'
import type { AgentToolResultStore } from '../../../state/store/tool-results/toolResultStore.js'
import type { CoreResourceFilePort } from '../../../ports/files/resourceFilePort.js'
import type { CoreImageProcessingPort } from '../../../ports/media/imageProcessingPort.js'
import type { CoreVideoFrameExtractionPort } from '../../../ports/media/videoFrameExtractionPort.js'
import type { WorkspaceApplyPort } from '../../../ports/workspace/apply/workspaceApplyPort.js'
import type { WorkspaceApplyPreviewPort } from '../../../ports/workspace/preview/workspaceApplyPreviewPort.js'
import type { WorkspaceWorkspaceSnapshotHydrationPort } from '../../../ports/workspace/hydration/workspaceSnapshotHydrationPort.js'
import type { ProjectStandardsPort } from '../../../ports/project/projectStandardsPort.js'
import type {
  AgentCatalogToolManager,
  RuntimeToolHandlerRegistry,
} from '../../../ports/runtime/runtimeToolHandlerPort.js'
import type { ExternalToolGatewayPort } from '../../../ports/tools/externalToolGatewayPort.js'
import type {
  AgentDebugContextPanel,
  AgentMessage,
  AgentRun,
  AgentRuntimeLimits,
  AgentTraceEventKind,
  JSONValue,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
  ToolCall,
} from '../../../state/shared/types.js'
import type { ToolRegistry } from '../../../tools/registry/core/toolRegistry.js'

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
  historicalVisionContext?: RuntimeHistoricalVisionContext
  rootUserMessageId?: string
  runtimeState?: unknown
  config: ConfiguredRuntimeModelConfig
  modelRouter?: RuntimeModelRouter
  auth: RuntimeModelAuthContext
  runtimeLimits: AgentRuntimeLimits
  workspaceStore: AgentWorkspaceStore
  externalToolGatewayPort: ExternalToolGatewayPort
  workspaceApplyPort: WorkspaceApplyPort
  workspaceApplyPreviewPort: WorkspaceApplyPreviewPort
  workspaceSnapshotHydrationPort: WorkspaceWorkspaceSnapshotHydrationPort
  resourceFilePort: CoreResourceFilePort
  imageProcessingPort?: CoreImageProcessingPort
  videoFrameExtractionPort: CoreVideoFrameExtractionPort
  projectStandardsPort: ProjectStandardsPort
  registry: ToolRegistry
  runtimeToolHandlers: RuntimeToolHandlerRegistry
  contractResolver?: AgentRuntimeContractResolver
  memoryManager?: MemoryManager
  referenceManager?: ReferenceManager
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
