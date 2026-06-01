import { createMCPResourceFilePort } from '../adapters/core/mcpResourceFileAdapter.js'
import { createMCPExternalToolGatewayPort } from '../adapters/mcp/mcpExternalToolGatewayAdapter.js'
import { createBackendVideoFrameExtractionPort, type BackendVideoFrameExtractor } from '../adapters/core/backendVideoFrameExtractionAdapter.js'
import { createApplicationDraftApplyPort } from '../adapters/draft/applicationDraftApplyAdapter.js'
import { createBackendDraftApplyPreviewPort } from '../adapters/draft/backendDraftApplyPreviewAdapter.js'
import { createBackendRuntimeDraftApplyWriterPort } from '../adapters/draft/backendRuntimeDraftApplyAdapter.js'
import { createMCPProposalSnapshotHydrationPort } from '../adapters/draft/mcpProposalSnapshotHydrationAdapter.js'
import { createBackendProjectStandardsPort } from '../adapters/movscript/backendProjectStandardsAdapter.js'
import { createCoreFileToolHandler } from '../domains/core/files/fileToolHandler.js'
import { createCoreKnowledgeToolHandler } from '../domains/core/knowledge/knowledgeToolHandler.js'
import { createCoreVideoFrameToolHandler } from '../domains/core/media/videoFrameToolHandler.js'
import { createCoreMemoryToolHandler } from '../domains/core/memory/memoryToolHandler.js'
import { createCoreRuntimeControlToolHandler } from '../domains/core/runtime/runtimeControlToolHandler.js'
import { createMovscriptDraftApplyToolHandler } from '../domains/movscript/draft/draftApplyToolHandler.js'
import { createMovscriptDraftCreateToolHandler } from '../domains/movscript/draft/draftCreateToolHandler.js'
import { createMovscriptProjectStandardsToolHandler } from '../domains/movscript/project/projectStandardsToolHandler.js'
import type { DraftApplyPort } from '../ports/draft/draftApplyPort.js'
import type { DraftApplyPreviewPort } from '../ports/draft/draftApplyPreviewPort.js'
import type { MCPClient } from '../mcpClient.js'
import type { DraftProposalSnapshotHydrationPort } from '../ports/draft/proposalSnapshotHydrationPort.js'
import type { BackendApplyClient } from '../drafts/backendApplyClient.js'
import type { CoreResourceFilePort } from '../ports/core/resourceFilePort.js'
import type { CoreVideoFrameExtractionPort } from '../ports/core/videoFrameExtractionPort.js'
import type { MovscriptProjectStandardsPort } from '../ports/movscript/projectStandardsPort.js'
import type { ExternalToolGatewayPort } from '../ports/tools/externalToolGatewayPort.js'
import {
  createRuntimeToolHandlerRegistry,
  type RuntimeToolHandlerRegistry,
} from '../ports/runtime/runtimeToolHandlerPort.js'

export function createDefaultRuntimeToolHandlerRegistry(): RuntimeToolHandlerRegistry {
  return createRuntimeToolHandlerRegistry([
    createCoreFileToolHandler(),
    createCoreKnowledgeToolHandler(),
    createCoreVideoFrameToolHandler(),
    createCoreMemoryToolHandler(),
    createCoreRuntimeControlToolHandler(),
    createMovscriptDraftApplyToolHandler(),
    createMovscriptDraftCreateToolHandler(),
    createMovscriptProjectStandardsToolHandler(),
  ])
}

export function createDefaultExternalToolGatewayPort(
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>,
): ExternalToolGatewayPort {
  return createMCPExternalToolGatewayPort(mcpClient)
}

export function createDefaultDraftApplyPort(
  backendApplyClient: Pick<BackendApplyClient, 'applyReview'>,
): DraftApplyPort {
  return createApplicationDraftApplyPort(createBackendRuntimeDraftApplyWriterPort(backendApplyClient))
}

export function createDefaultDraftApplyPreviewPort(
  backendApplyClient: Pick<BackendApplyClient, 'previewApplyReview'>,
): DraftApplyPreviewPort {
  return createBackendDraftApplyPreviewPort(backendApplyClient)
}

export function createDefaultProposalSnapshotHydrationPort(
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>,
): DraftProposalSnapshotHydrationPort {
  return createMCPProposalSnapshotHydrationPort(mcpClient)
}

export function createDefaultResourceFilePort(
  mcpClient: Pick<MCPClient, 'initialize'> & { readResource?: (uri: string) => Promise<import('../state/types.js').JSONValue> },
): CoreResourceFilePort {
  return createMCPResourceFilePort(mcpClient)
}

export function createDefaultVideoFrameExtractionPort(
  backendApplyClient: Pick<BackendApplyClient, 'downloadResourceFile'>,
  extractor?: BackendVideoFrameExtractor,
): CoreVideoFrameExtractionPort {
  return createBackendVideoFrameExtractionPort(backendApplyClient, extractor)
}

export function createDefaultProjectStandardsPort(
  backendApplyClient: Pick<BackendApplyClient, 'getProject'>,
): MovscriptProjectStandardsPort {
  return createBackendProjectStandardsPort(backendApplyClient)
}
