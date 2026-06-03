import { ipcMain } from 'electron'
import {
  installAgentCatalogPack,
  listAgentCatalogPackPlugins,
  uninstallAgentCatalogPack,
} from '../services/agentCatalogPackStore'
import type {
  ElectronAgentCatalogPackInstallInput,
  ElectronAgentCatalogPackUninstallInput,
} from '../../src/shared/contracts/electronApi'

export function registerAgentCatalogPackStoreIpcHandlers(): void {
  ipcMain.handle('agent-catalog-pack-store:list', () => {
    return listAgentCatalogPackPlugins()
  })
  ipcMain.handle('agent-catalog-pack-store:install', (_event, input: ElectronAgentCatalogPackInstallInput) => {
    return installAgentCatalogPack(input)
  })
  ipcMain.handle('agent-catalog-pack-store:uninstall', (_event, input: ElectronAgentCatalogPackUninstallInput) => {
    return uninstallAgentCatalogPack(input)
  })
}
