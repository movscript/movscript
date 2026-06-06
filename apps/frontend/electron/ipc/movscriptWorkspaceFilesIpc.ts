import { ipcMain } from 'electron'
import {
  deleteMovScriptWorkspaceFile,
  listMovScriptWorkspaceFiles,
  readMovScriptWorkspaceFile,
  writeMovScriptWorkspaceFile,
} from '../services/movscriptWorkspaceFiles'
import type {
  ElectronMovScriptWorkspaceFilesInput,
  ElectronMovScriptWorkspaceFileWriteInput,
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
}
