import { ipcMain } from 'electron'
import {
  deleteMovScriptWorkspaceFile,
  listMovScriptWorkspaceFiles,
  readMovScriptWorkspaceFile,
  writeMovScriptWorkspaceFile,
} from '../services/movscriptWorkspaceFiles'
import { resolveMovScriptProjectCwd } from '@movscript/core/workspace/node'
import { createNodeMovScriptEngine } from '@movscript/engine/node'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from '../services/movscriptWorkspaceDefaults'
import type {
  ElectronMovScriptWorkspaceBuildActionInput,
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
  ipcMain.handle('movscript:workspace-review', (_event, input?: ElectronMovScriptWorkspaceBuildActionInput) => {
    const action = actionInput(input)
    return createNodeMovScriptEngine({ projectDir: resolveMovScriptProjectCwd(action) }).review()
  })
  ipcMain.handle('movscript:workspace-build', (_event, input?: ElectronMovScriptWorkspaceBuildActionInput) => {
    const action = actionInput(input)
    return createNodeMovScriptEngine({ projectDir: resolveMovScriptProjectCwd(action) }).compile()
  })
}

function actionInput(input?: ElectronMovScriptWorkspaceBuildActionInput): {
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
