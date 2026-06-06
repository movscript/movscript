import { ipcMain } from 'electron'
import {
  installPluginCatalogPack,
  listPluginCatalogPackPlugins,
  uninstallPluginCatalogPack,
} from '../services/pluginCatalogPackStore'
import type {
  ElectronPluginCatalogPackInstallInput,
  ElectronPluginCatalogPackUninstallInput,
} from '../../src/shared/contracts/electronApi'

export function registerPluginCatalogPackStoreIpcHandlers(): void {
  ipcMain.handle('plugin-catalog-pack-store:list', () => {
    return listPluginCatalogPackPlugins()
  })
  ipcMain.handle('plugin-catalog-pack-store:install', (_event, input: ElectronPluginCatalogPackInstallInput) => {
    return installPluginCatalogPack(input)
  })
  ipcMain.handle('plugin-catalog-pack-store:uninstall', (_event, input: ElectronPluginCatalogPackUninstallInput) => {
    return uninstallPluginCatalogPack(input)
  })
}
