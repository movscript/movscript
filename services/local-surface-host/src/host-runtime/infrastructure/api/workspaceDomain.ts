import { configureSurfaceWorkspaceDomainClient } from '@movscript/shared'
import { createElectronMovScriptWorkspaceService } from '../workspaceDomainRepository'

configureSurfaceWorkspaceDomainClient({
  createWorkspaceDomainService: (context) => createElectronMovScriptWorkspaceService(context),
})
