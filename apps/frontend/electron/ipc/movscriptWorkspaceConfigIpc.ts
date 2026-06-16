import { ipcMain } from 'electron'
import {
  ensureMovScriptWorkspace,
  readMovScriptWorkspaceConfig,
  resolveMovScriptWorkspacePaths,
  writeMovScriptWorkspaceConfig,
  type MovScriptWorkspaceConfig,
} from '@movscript/core/workspace/node'
import { resolveMovScriptHomeDir } from '../services/movscriptHomeInput'
import type { ElectronMovScriptHomeInput, ElectronMovScriptWorkspaceConfigSaveInput } from '../../src/shared/contracts/electronApi'

export function registerMovScriptWorkspaceConfigIpcHandlers(): void {
  ipcMain.handle('movscript:workspace-config-get', (_event, input?: ElectronMovScriptHomeInput & { providerProfileKey?: string }) => {
    return readWorkspaceConfig(input)
  })
  ipcMain.handle('movscript:workspace-config-save', (_event, input: ElectronMovScriptWorkspaceConfigSaveInput) => {
    return saveWorkspaceConfig(input)
  })
}

function workspaceConfigPath(input?: ElectronMovScriptHomeInput & { providerProfileKey?: string }) {
  const paths = resolveMovScriptWorkspacePaths(resolveMovScriptHomeDir(input), { configDirName: input?.providerProfileKey })
  ensureMovScriptWorkspace(paths)
  return paths.configPath
}

function readWorkspaceConfig(input?: ElectronMovScriptHomeInput & { providerProfileKey?: string }): MovScriptWorkspaceConfig {
  return readMovScriptWorkspaceConfig(workspaceConfigPath(input))
}

function saveWorkspaceConfig(input: ElectronMovScriptWorkspaceConfigSaveInput): MovScriptWorkspaceConfig {
  const configPath = workspaceConfigPath(input)
  const current = readMovScriptWorkspaceConfig(configPath)
  const next: MovScriptWorkspaceConfig = {
    ...current,
    updatedAt: new Date().toISOString(),
  }
  applyNullableField(next, 'modelConfig', input.modelConfig)
  applyNullableField(next, 'agentCatalog', input.agentCatalog)
  applyNullableField(next, 'toolProviders', input.toolProviders)
  applyNullableField(next, 'modelProviders', input.modelProviders)
  applyNullableField(next, 'permissions', input.permissions)
  applyNullableField(next, 'environment', input.environment)
  applyNullableField(next, 'providers', input.providers)
  writeMovScriptWorkspaceConfig(configPath, next)
  return readMovScriptWorkspaceConfig(configPath)
}

function applyNullableField<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | null | undefined): void {
  if (value === undefined) return
  if (value === null) {
    delete target[key]
    return
  }
  target[key] = value
}
