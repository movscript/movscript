import { ipcMain } from 'electron'
import type { ElectronDockShortcutSnapshot } from '../../src/shared/contracts/electronApi'
import { updateDockShortcutMenu } from '../services/dockShortcutMenu'

export function registerDockShortcutIpcHandlers(): void {
  ipcMain.handle('dock-shortcuts:update', (_event, snapshot?: ElectronDockShortcutSnapshot) => {
    updateDockShortcutMenu(snapshot ?? {})
  })
}
