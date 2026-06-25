import { configureSurfaceWorkspaceDomainClient } from '@movscript/shared'
import { createElectronMovScriptWorkspaceService } from '@/shared/infrastructure/workspaceDomainRepository'

configureSurfaceWorkspaceDomainClient({
  createWorkspaceDomainService: (context) => createElectronMovScriptWorkspaceService(context),
})
