import {
  ensurePluginCatalogPackStoreDirs as ensureSharedPluginCatalogPackStoreDirs,
  installPluginCatalogPack as installSharedPluginCatalogPack,
  listPluginCatalogPackPlugins as listSharedPluginCatalogPackPlugins,
  resolvePluginCatalogPackStoreDirs as resolveSharedPluginCatalogPackStoreDirs,
  uninstallPluginCatalogPack as uninstallSharedPluginCatalogPack,
  type PluginCatalogPackStoreDirs,
  type InstallPluginCatalogPackInput,
  type UninstallPluginCatalogPackInput,
} from '@movscript/core/plugins/node'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'

export function resolvePluginCatalogPackStoreDirs(): PluginCatalogPackStoreDirs {
  return resolveSharedPluginCatalogPackStoreDirs({
    dataDir: resolveDesktopDefaultMovScriptWorkspaceDir(),
    env: process.env,
  })
}

export function ensurePluginCatalogPackStoreDirs(): PluginCatalogPackStoreDirs {
  return ensureSharedPluginCatalogPackStoreDirs(resolvePluginCatalogPackStoreDirs())
}

export function installPluginCatalogPack(input: InstallPluginCatalogPackInput) {
  return installSharedPluginCatalogPack({
    ...input,
    dirs: resolvePluginCatalogPackStoreDirs(),
  })
}

export function uninstallPluginCatalogPack(input: UninstallPluginCatalogPackInput) {
  return uninstallSharedPluginCatalogPack({
    ...input,
    dirs: resolvePluginCatalogPackStoreDirs(),
  })
}

export function listPluginCatalogPackPlugins() {
  return listSharedPluginCatalogPackPlugins(ensurePluginCatalogPackStoreDirs())
}
