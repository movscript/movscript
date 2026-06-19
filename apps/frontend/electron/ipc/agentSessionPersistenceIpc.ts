import { ipcMain } from 'electron'
import {
  readDesktopAgentSessionState,
  writeDesktopAgentSessionState,
} from '../services/agentSessionPersistence'
import type { ElectronAgentSessionStateSaveInput, ElectronMovScriptHomeInput } from '../../src/shared/contracts/electronApi'

export function registerAgentSessionPersistenceIpcHandlers(): void {
  ipcMain.handle('agent-session-state:get', (_event, input?: ElectronMovScriptHomeInput) => {
    return readDesktopAgentSessionState(input)
  })
  ipcMain.handle('agent-session-state:set', (_event, input: ElectronMovScriptHomeInput & ElectronAgentSessionStateSaveInput) => {
    return writeDesktopAgentSessionState(input)
  })
}
