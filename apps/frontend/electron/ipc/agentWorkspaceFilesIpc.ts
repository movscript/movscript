import { ipcMain } from 'electron'
import {
  deleteAgentWorkspaceFile,
  listAgentWorkspaceFiles,
  readAgentWorkspaceFile,
  writeAgentWorkspaceFile,
} from '../services/agentWorkspaceFiles'
import type {
  ElectronAgentWorkspaceFilesInput,
  ElectronAgentWorkspaceFileWriteInput,
} from '../../src/shared/contracts/electronApi'

export function registerAgentWorkspaceFilesIpcHandlers(): void {
  ipcMain.handle('agent:workspace-files-list', (_event, input?: ElectronAgentWorkspaceFilesInput) => {
    return listAgentWorkspaceFiles(input)
  })
  ipcMain.handle('agent:workspace-files-read', (_event, input: ElectronAgentWorkspaceFilesInput) => {
    return readAgentWorkspaceFile(input)
  })
  ipcMain.handle('agent:workspace-files-write', (_event, input: ElectronAgentWorkspaceFileWriteInput) => {
    return writeAgentWorkspaceFile(input)
  })
  ipcMain.handle('agent:workspace-files-delete', async (_event, input: ElectronAgentWorkspaceFilesInput) => {
    await deleteAgentWorkspaceFile(input)
    return { ok: true as const }
  })
}
