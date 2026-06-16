import { ipcMain } from 'electron'
import { getElectronRuntimeConfig } from '../services/runtimeConfig'

export function registerRuntimeConfigIpcHandlers(): void {
  ipcMain.handle('app:get-runtime-config', () => getElectronRuntimeConfig())
}
