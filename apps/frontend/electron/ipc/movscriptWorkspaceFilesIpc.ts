import { ipcMain } from 'electron'
import {
  deleteMovScriptWorkspaceFile,
  listMovScriptWorkspaceFiles,
  readMovScriptWorkspaceFile,
  readMovScriptWorkspaceMediaFile,
  writeMovScriptWorkspaceFile,
} from '../services/movscriptWorkspaceFiles'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from '../services/movscriptWorkspaceDefaults'
import { projectEngineRegistry } from '../services/projectEngineRegistry'
import type {
  ElectronMovScriptWorkspaceInterpretActionInput,
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
  ipcMain.handle('movscript:workspace-files-read-media', (_event, input: ElectronMovScriptWorkspaceFilesInput) => {
    return readMovScriptWorkspaceMediaFile(input)
  })
  ipcMain.handle('movscript:workspace-files-write', (_event, input: ElectronMovScriptWorkspaceFileWriteInput) => {
    return writeMovScriptWorkspaceFile(input)
  })
  ipcMain.handle('movscript:workspace-files-delete', async (_event, input: ElectronMovScriptWorkspaceFilesInput) => {
    await deleteMovScriptWorkspaceFile(input)
    return { ok: true as const }
  })
  ipcMain.handle('movscript:workspace-review', (_event, input?: ElectronMovScriptWorkspaceInterpretActionInput) => {
    const action = actionInput(input)
    return projectEngineRegistry.get(action).review()
  })
  ipcMain.handle('movscript:workspace-interpret', (_event, input?: ElectronMovScriptWorkspaceInterpretActionInput) => {
    const action = actionInput(input)
    return projectEngineRegistry.get(action).interpret()
  })
}

function actionInput(input?: ElectronMovScriptWorkspaceInterpretActionInput): {
  workspaceDir: string
  userId?: number | string
  orgId?: number | string
  projectId?: number | string
} {
  return {
    workspaceDir: input?.workspaceDir?.trim() || resolveDesktopDefaultMovScriptWorkspaceDir(),
    ...(input?.userId !== undefined ? { userId: input.userId } : {}),
    ...(input?.orgId !== undefined ? { orgId: input.orgId } : {}),
    ...(input?.projectId !== undefined ? { projectId: input.projectId } : {}),
  }
}
