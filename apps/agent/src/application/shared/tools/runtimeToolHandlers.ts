import { createMCPResourceFilePort } from '../../../adapters/files/mcpResourceFileAdapter.js'
import { createExternalToolFocusContextPort } from '../../../adapters/mcp/focus/mcpFocusContextAdapter.js'
import { createMCPExternalToolGatewayPort } from '../../../adapters/mcp/gateway/mcpExternalToolGatewayAdapter.js'
import { createBackendVideoFrameExtractionPort, type BackendVideoFrameExtractor } from '../../../adapters/media/backendVideoFrameExtractionAdapter.js'
import { createCoreFileToolHandler } from '../../../tools/handlers/core/files/fileToolHandler.js'
import { createCoreImageToolHandler } from '../../../tools/handlers/core/images/imageToolHandler.js'
import { createCoreVideoFrameToolHandler } from '../../../tools/handlers/core/video/videoFrameToolHandler.js'
import { createCoreMemoryToolHandler } from '../../../tools/handlers/core/memory/memoryToolHandler.js'
import { createCoreRuntimeControlToolHandler } from '../../../tools/handlers/core/runtime-control/runtimeControlToolHandler.js'
import type { MCPClient } from '../../../adapters/mcp/client/mcpClient.js'
import type { CoreResourceFilePort } from '../../../ports/files/resourceFilePort.js'
import type { ResourceFileDownloadPort } from '../../../ports/files/resourceDownloadPort.js'
import type { CoreImageProcessingPort } from '../../../ports/media/imageProcessingPort.js'
import type { CoreVideoFrameExtractionPort } from '../../../ports/media/videoFrameExtractionPort.js'
import type { RuntimeFocusContextPort } from '../../../ports/context/focusContextPort.js'
import type { ExternalToolGatewayPort } from '../../../ports/tools/externalToolGatewayPort.js'
import {
  createRuntimeToolHandlerRegistry,
  type RuntimeToolHandlerRegistry,
} from '../../../ports/runtime/runtimeToolHandlerPort.js'
import { createSharpImageProcessingPort } from '../../../media/image/imagePreprocessing.js'

export function createDefaultRuntimeToolHandlerRegistry(): RuntimeToolHandlerRegistry {
  return createRuntimeToolHandlerRegistry([
    createCoreFileToolHandler(),
    createCoreImageToolHandler(),
    createCoreVideoFrameToolHandler(),
    createCoreMemoryToolHandler(),
    createCoreRuntimeControlToolHandler(),
  ])
}

export function createDefaultExternalToolGatewayPort(
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>,
): ExternalToolGatewayPort {
  return createMCPExternalToolGatewayPort(mcpClient)
}

export function createDefaultFocusContextPort(
  externalToolGatewayPort: ExternalToolGatewayPort,
): RuntimeFocusContextPort {
  return createExternalToolFocusContextPort(externalToolGatewayPort)
}

export function createDefaultResourceFilePort(
  mcpClient: Pick<MCPClient, 'initialize'> & { readResource?: (uri: string) => Promise<import('../../../state/shared/types.js').JSONValue> },
): CoreResourceFilePort {
  return createMCPResourceFilePort(mcpClient)
}

export function createDefaultVideoFrameExtractionPort(
  resourceFileDownloader: ResourceFileDownloadPort,
  extractor?: BackendVideoFrameExtractor,
): CoreVideoFrameExtractionPort {
  return createBackendVideoFrameExtractionPort(resourceFileDownloader, extractor)
}

export function createDefaultImageProcessingPort(
  resourceFileDownloader: ResourceFileDownloadPort,
): CoreImageProcessingPort {
  return createSharpImageProcessingPort({ resourceFileDownloader })
}
