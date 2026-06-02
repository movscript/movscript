import { createMCPResourceFilePort } from '../../../adapters/files/mcpResourceFileAdapter.js'
import { createMCPExternalToolGatewayPort } from '../../../adapters/mcp/gateway/mcpExternalToolGatewayAdapter.js'
import { createBackendVideoFrameExtractionPort, type BackendVideoFrameExtractor } from '../../../adapters/media/backendVideoFrameExtractionAdapter.js'
import { createApplicationDraftApplyPort } from '../../../adapters/draft/apply/applicationDraftApplyAdapter.js'
import { createBackendDraftApplyPreviewPort } from '../../../adapters/draft/preview/backendDraftApplyPreviewAdapter.js'
import { createBackendRuntimeDraftApplyWriterPort } from '../../../adapters/draft/backend/backendRuntimeDraftApplyAdapter.js'
import { createMCPProposalSnapshotHydrationPort } from '../../../adapters/draft/hydration/mcpProposalSnapshotHydrationAdapter.js'
import { createBackendProjectStandardsPort } from '../../../adapters/project/backendProjectStandardsAdapter.js'
import { createCoreFileToolHandler } from '../../../tools/handlers/core/files/fileToolHandler.js'
import { createCoreReferenceToolHandler } from '../../../tools/handlers/core/reference/referenceToolHandler.js'
import { createCoreImageToolHandler } from '../../../tools/handlers/core/images/imageToolHandler.js'
import { createCoreVideoFrameToolHandler } from '../../../tools/handlers/core/video/videoFrameToolHandler.js'
import { createCoreMemoryToolHandler } from '../../../tools/handlers/core/memory/memoryToolHandler.js'
import { createCoreRuntimeControlToolHandler } from '../../../tools/handlers/core/runtime-control/runtimeControlToolHandler.js'
import { createDraftApplyToolHandler } from '../../../tools/handlers/drafts/apply/draftApplyToolHandler.js'
import { createDraftCreateToolHandler } from '../../../tools/handlers/drafts/create/draftCreateToolHandler.js'
import { createProjectStandardsToolHandler } from '../../../tools/handlers/project/projectStandardsToolHandler.js'
import type { DraftApplyPort } from '../../../ports/draft/apply/draftApplyPort.js'
import type { DraftApplyPreviewPort } from '../../../ports/draft/preview/draftApplyPreviewPort.js'
import type { MCPClient } from '../../../adapters/mcp/client/mcpClient.js'
import type { DraftProposalSnapshotHydrationPort } from '../../../ports/draft/hydration/proposalSnapshotHydrationPort.js'
import type { BackendApplyClient } from '../../../drafts/adapters/backend/backendApplyClient.js'
import type { CoreResourceFilePort } from '../../../ports/files/resourceFilePort.js'
import type { CoreImageProcessingPort } from '../../../ports/media/imageProcessingPort.js'
import type { CoreVideoFrameExtractionPort } from '../../../ports/media/videoFrameExtractionPort.js'
import type { ProjectStandardsPort } from '../../../ports/project/projectStandardsPort.js'
import type { ExternalToolGatewayPort } from '../../../ports/tools/externalToolGatewayPort.js'
import {
  createRuntimeToolHandlerRegistry,
  type RuntimeToolHandlerRegistry,
} from '../../../ports/runtime/runtimeToolHandlerPort.js'
import { createSharpImageProcessingPort } from '../../../media/image/imagePreprocessing.js'

export function createDefaultRuntimeToolHandlerRegistry(): RuntimeToolHandlerRegistry {
  return createRuntimeToolHandlerRegistry([
    createCoreFileToolHandler(),
    createCoreReferenceToolHandler(),
    createCoreImageToolHandler(),
    createCoreVideoFrameToolHandler(),
    createCoreMemoryToolHandler(),
    createCoreRuntimeControlToolHandler(),
    createDraftApplyToolHandler(),
    createDraftCreateToolHandler(),
    createProjectStandardsToolHandler(),
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
  mcpClient: Pick<MCPClient, 'initialize'> & { readResource?: (uri: string) => Promise<import('../../../state/shared/types.js').JSONValue> },
): CoreResourceFilePort {
  return createMCPResourceFilePort(mcpClient)
}

export function createDefaultVideoFrameExtractionPort(
  backendApplyClient: Pick<BackendApplyClient, 'downloadResourceFile'>,
  extractor?: BackendVideoFrameExtractor,
): CoreVideoFrameExtractionPort {
  return createBackendVideoFrameExtractionPort(backendApplyClient, extractor)
}

export function createDefaultImageProcessingPort(
  backendApplyClient: Pick<BackendApplyClient, 'downloadResourceFile'>,
): CoreImageProcessingPort {
  return createSharpImageProcessingPort({ backendApplyClient })
}

export function createDefaultProjectStandardsPort(
  backendApplyClient: Pick<BackendApplyClient, 'getProject'>,
): ProjectStandardsPort {
  return createBackendProjectStandardsPort(backendApplyClient)
}
