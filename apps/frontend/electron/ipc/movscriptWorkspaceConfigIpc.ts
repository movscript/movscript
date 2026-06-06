import { ipcMain } from 'electron'
import {
  ensureMovScriptWorkspace,
  readMovScriptWorkspaceConfig,
  resolveMovScriptWorkspacePaths,
  writeMovScriptWorkspaceConfig,
  type MovScriptWorkspaceConfig,
} from '@movscript/workspaces/node'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from '../services/movscriptWorkspaceDefaults'
import type { ElectronMovScriptWorkspaceConfigSaveInput } from '../../src/shared/contracts/electronApi'

export function registerMovScriptWorkspaceConfigIpcHandlers(): void {
  ipcMain.handle('movscript:workspace-config-get', (_event, input?: { workspaceDir?: string; providerProfileKey?: string }) => {
    return readWorkspaceConfig(input)
  })
  ipcMain.handle('movscript:workspace-config-save', (_event, input: ElectronMovScriptWorkspaceConfigSaveInput) => {
    return saveWorkspaceConfig(input)
  })
}

function workspaceConfigPath(input?: { workspaceDir?: string; providerProfileKey?: string }) {
  const paths = resolveMovScriptWorkspacePaths(input?.workspaceDir || resolveDesktopDefaultMovScriptWorkspaceDir(), { configDirName: input?.providerProfileKey })
  ensureMovScriptWorkspace(paths)
  return paths.configPath
}

function readWorkspaceConfig(input?: { workspaceDir?: string; providerProfileKey?: string }): MovScriptWorkspaceConfig {
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
