import { ipcMain } from 'electron'
import {
  deleteMovScriptWorkspaceFile,
  listMovScriptWorkspaceFiles,
  readMovScriptWorkspaceFile,
  writeMovScriptWorkspaceFile,
} from '../services/movscriptWorkspaceFiles'
import {
  buildMovScriptWorkspace,
  createNodeMovScriptWorkspaceFileRepository,
  reviewMovScriptBuildWorkspace,
} from '@movscript/core/workspace/node'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from '../services/movscriptWorkspaceDefaults'
import type {
  ElectronMovScriptWorkspaceCloudActionInput,
  ElectronMovScriptWorkspaceFileWriteInput,
  ElectronMovScriptWorkspaceFilesInput,
} from '../../src/shared/contracts/electronApi'

export function registerMovScriptWorkspaceFilesIpcHandlers(): void {
  ipcMain.handle('movscript:workspace-files-list', (_event, input?: ElectronMovScriptWorkspaceFilesInput) => {
    return listMovScriptWorkspaceFiles(input)
  })
  ipcMain.handle('movscript:workspace-files-read', (_event, input: ElectronMovScriptWorkspaceFilesInput) => {
    return readMovScriptWorkspaceFile(input)
  })
  ipcMain.handle('movscript:workspace-files-write', (_event, input: ElectronMovScriptWorkspaceFileWriteInput) => {
    return writeMovScriptWorkspaceFile(input)
  })
  ipcMain.handle('movscript:workspace-files-delete', async (_event, input: ElectronMovScriptWorkspaceFilesInput) => {
    await deleteMovScriptWorkspaceFile(input)
    return { ok: true as const }
  })
  ipcMain.handle('movscript:workspace-projection-update', (_event, input?: ElectronMovScriptWorkspaceCloudActionInput) => {
    const action = actionInput(input)
    return {
      status: 'noop' as const,
      reason: 'Workspace fetch/update is removed; edit files are local and build controls effectiveness.',
      workspaceDir: action.workspaceDir,
    }
  })
  ipcMain.handle('movscript:workspace-projection-apply-preview', (_event, input?: ElectronMovScriptWorkspaceCloudActionInput) => {
    const action = actionInput(input)
    return reviewMovScriptBuildWorkspace({
      fileRepository: createNodeMovScriptWorkspaceFileRepository(action.workspaceDir),
    })
  })
  ipcMain.handle('movscript:workspace-projection-apply', (_event, input?: ElectronMovScriptWorkspaceCloudActionInput) => {
    const action = actionInput(input)
    return buildMovScriptWorkspace({
      fileRepository: createNodeMovScriptWorkspaceFileRepository(action.workspaceDir),
    })
  })
}

function actionInput(input?: ElectronMovScriptWorkspaceCloudActionInput): {
  namespace?: string
  workspaceDir: string
  reviewPath?: string
  userId?: number | string
  fetchMode: 'safe' | 'overwrite'
} {
  const mode = input?.mode === 'overwrite' ? 'overwrite' : 'safe'
  return {
    workspaceDir: resolveDesktopDefaultMovScriptWorkspaceDir(),
    ...(input?.namespace ? { namespace: input.namespace } : {}),
    ...(input?.reviewPath ? { reviewPath: input.reviewPath } : {}),
    ...(input?.userId !== undefined ? { userId: input.userId } : {}),
    fetchMode: mode,
  }
}
