import { app } from 'electron'
import {
  ensureAgentCatalogPackStoreDirs as ensureSharedAgentCatalogPackStoreDirs,
  installAgentCatalogPack as installSharedAgentCatalogPack,
  listAgentCatalogPackPlugins as listSharedAgentCatalogPackPlugins,
  resolveAgentCatalogPackStoreDirs as resolveSharedAgentCatalogPackStoreDirs,
  uninstallAgentCatalogPack as uninstallSharedAgentCatalogPack,
  type AgentCatalogPackStoreDirs,
  type InstallAgentCatalogPackInput,
  type UninstallAgentCatalogPackInput,
} from '@movscript/agent-runtime'

export function resolveAgentCatalogPackStoreDirs(): AgentCatalogPackStoreDirs {
  return resolveSharedAgentCatalogPackStoreDirs({
    dataDir: app.getPath('userData'),
    env: process.env,
  })
}

export function ensureAgentCatalogPackStoreDirs(): AgentCatalogPackStoreDirs {
  return ensureSharedAgentCatalogPackStoreDirs(resolveAgentCatalogPackStoreDirs())
}

export function installAgentCatalogPack(input: InstallAgentCatalogPackInput) {
  return installSharedAgentCatalogPack({
    ...input,
    dirs: resolveAgentCatalogPackStoreDirs(),
  })
}

export function uninstallAgentCatalogPack(input: UninstallAgentCatalogPackInput) {
  return uninstallSharedAgentCatalogPack({
    ...input,
    dirs: resolveAgentCatalogPackStoreDirs(),
  })
}

export function listAgentCatalogPackPlugins() {
  return listSharedAgentCatalogPackPlugins(ensureAgentCatalogPackStoreDirs())
}
