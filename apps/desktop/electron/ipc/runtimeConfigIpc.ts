import { ipcMain } from 'electron'
import { getElectronRuntimeConfig } from '../services/runtimeConfig'
import { applyRuntimeBundleAction } from '../services/runtimeBundleAction'
import type { ElectronRuntimeBundleActionInput } from '../../src/shared/contracts/electronApi'

export function registerRuntimeConfigIpcHandlers(): void {
  ipcMain.handle('app:get-runtime-config', () => getElectronRuntimeConfig())
  ipcMain.handle('app:apply-runtime-bundle-action', (_event, input?: ElectronRuntimeBundleActionInput) => applyRuntimeBundleAction(input))
}
