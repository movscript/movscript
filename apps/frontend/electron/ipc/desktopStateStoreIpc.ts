import { ipcMain } from 'electron'
import {
  readDesktopState,
  removeDesktopState,
  writeDesktopState,
} from '../services/desktopStateStore'
import type { ElectronDesktopStateInput, ElectronDesktopStateSaveInput } from '../../src/shared/contracts/electronApi'

export function registerDesktopStateStoreIpcHandlers(): void {
  ipcMain.handle('desktop-state:get', (_event, input: ElectronDesktopStateInput) => {
    return readDesktopState(input)
  })
  ipcMain.handle('desktop-state:set', (_event, input: ElectronDesktopStateSaveInput) => {
    return writeDesktopState(input)
  })
  ipcMain.handle('desktop-state:remove', (_event, input: ElectronDesktopStateInput) => {
    return removeDesktopState(input)
  })
}
