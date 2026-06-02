import { createMCPResourceFilePort } from '../../../adapters/files/mcpResourceFileAdapter.js'
import { createMCPExternalToolGatewayPort } from '../../../adapters/mcp/gateway/mcpExternalToolGatewayAdapter.js'
import { createBackendVideoFrameExtractionPort, type BackendVideoFrameExtractor } from '../../../adapters/media/backendVideoFrameExtractionAdapter.js'
import { createApplicationWorkspaceApplyPort } from '../../../adapters/workspace/apply/applicationWorkspaceApplyAdapter.js'
import { createBackendWorkspaceApplyPreviewPort } from '../../../adapters/workspace/preview/backendWorkspaceApplyPreviewAdapter.js'
import { createBackendRuntimeWorkspaceApplyWriterPort } from '../../../adapters/workspace/backend/backendRuntimeWorkspaceApplyAdapter.js'
import { createMCPWorkspaceSnapshotHydrationPort } from '../../../adapters/workspace/hydration/mcpWorkspaceSnapshotHydrationAdapter.js'
import { createBackendProjectStandardsPort } from '../../../adapters/project/backendProjectStandardsAdapter.js'
import { createCoreFileToolHandler } from '../../../tools/handlers/core/files/fileToolHandler.js'
import { createCoreReferenceToolHandler } from '../../../tools/handlers/core/reference/referenceToolHandler.js'
import { createCoreImageToolHandler } from '../../../tools/handlers/core/images/imageToolHandler.js'
import { createCoreVideoFrameToolHandler } from '../../../tools/handlers/core/video/videoFrameToolHandler.js'
import { createCoreMemoryToolHandler } from '../../../tools/handlers/core/memory/memoryToolHandler.js'
import { createCoreRuntimeControlToolHandler } from '../../../tools/handlers/core/runtime-control/runtimeControlToolHandler.js'
import { createWorkspaceOpenToolHandler } from '../../../tools/handlers/workspaces/open/workspaceOpenToolHandler.js'
import { createWorkspaceApplyToolHandler } from '../../../tools/handlers/workspaces/apply/workspaceApplyToolHandler.js'
import { createProjectStandardsToolHandler } from '../../../tools/handlers/project/projectStandardsToolHandler.js'
import type { WorkspaceApplyPort } from '../../../ports/workspace/apply/workspaceApplyPort.js'
import type { WorkspaceApplyPreviewPort } from '../../../ports/workspace/preview/workspaceApplyPreviewPort.js'
import type { MCPClient } from '../../../adapters/mcp/client/mcpClient.js'
import type { WorkspaceWorkspaceSnapshotHydrationPort } from '../../../ports/workspace/hydration/workspaceSnapshotHydrationPort.js'
import type { BackendApplyClient } from '../../../workspaces/adapters/backend/backendApplyClient.js'
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
    createWorkspaceApplyToolHandler(),
    createWorkspaceOpenToolHandler(),
    createProjectStandardsToolHandler(),
  ])
}

export function createDefaultExternalToolGatewayPort(
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>,
): ExternalToolGatewayPort {
  return createMCPExternalToolGatewayPort(mcpClient)
}

export function createDefaultWorkspaceApplyPort(
  backendApplyClient: Pick<BackendApplyClient, 'applyReview'>,
): WorkspaceApplyPort {
  return createApplicationWorkspaceApplyPort(createBackendRuntimeWorkspaceApplyWriterPort(backendApplyClient))
}

export function createDefaultWorkspaceApplyPreviewPort(
  backendApplyClient: Pick<BackendApplyClient, 'previewApplyReview'>,
): WorkspaceApplyPreviewPort {
  return createBackendWorkspaceApplyPreviewPort(backendApplyClient)
}

export function createDefaultWorkspaceSnapshotHydrationPort(
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>,
): WorkspaceWorkspaceSnapshotHydrationPort {
  return createMCPWorkspaceSnapshotHydrationPort(mcpClient)
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
