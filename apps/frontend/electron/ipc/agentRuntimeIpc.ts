import { ipcMain } from 'electron'
import {
  ensureAgentWorkspaceRuntime,
  listAgentSessionRuntimeSummaries,
  readAgentWorkspaceConfig,
  resolveAgentWorkspaceRuntimePaths,
  writeAgentWorkspaceConfig,
  type AgentWorkspaceConfig,
} from '@movscript/agent-runtime'
import { ensureAgentRuntimeRunning } from '../services/agentRuntime'
import { resolveDesktopDefaultAgentWorkspaceDir } from '../services/agentRuntime/sessionTransport'
import { agentRuntimeRequest } from './agent-runtime/request'
import { agentRuntimeOpenEventStream, closeAgentRuntimeEventStream, pumpAgentRuntimeStream } from './agent-runtime/stream'
import type {
  ElectronAgentRuntimeEnsureInput,
  ElectronAgentRuntimeRequestInput,
  ElectronAgentRuntimeStreamCloseInput,
  ElectronAgentRuntimeStreamInput,
  ElectronAgentWorkspaceConfigSaveInput,
} from '../../src/shared/contracts/electronApi'

export function registerAgentRuntimeIpcHandlers(): void {
  ipcMain.handle('agent:ensure-running', async (_e, input?: ElectronAgentRuntimeEnsureInput) => {
    return ensureAgentRuntimeRunning(input)
  })
  ipcMain.handle('agent:runtime-request', async (_e, input?: ElectronAgentRuntimeRequestInput) => {
    return agentRuntimeRequest(input)
  })
  ipcMain.handle('agent:runtime-open-event-stream', async (event, input?: ElectronAgentRuntimeStreamInput) => {
    if (!input?.streamId) throw new Error('agent runtime stream requires streamId')
    const stream = await agentRuntimeOpenEventStream(input)
    if (stream.status < 200 || stream.status >= 300) return stream.response
    void pumpAgentRuntimeStream(input.streamId, stream.stream, (message) => {
      event.sender.send('agent:runtime-stream-message', message)
    })
    return stream.response
  })
  ipcMain.handle('agent:runtime-close-event-stream', (_event, input?: ElectronAgentRuntimeStreamCloseInput) => {
    closeAgentRuntimeEventStream(input)
  })
  ipcMain.handle('agent:runtime-list-sessions', (_event, input?: { workspaceDir?: string }) => {
    return { sessions: listAgentSessionRuntimeSummaries(input?.workspaceDir || resolveDesktopDefaultAgentWorkspaceDir()) }
  })
  ipcMain.handle('agent:workspace-config-get', (_event, input?: { workspaceDir?: string }) => {
    return readWorkspaceConfig(input?.workspaceDir)
  })
  ipcMain.handle('agent:workspace-config-save', (_event, input: ElectronAgentWorkspaceConfigSaveInput) => {
    return saveWorkspaceConfig(input)
  })
}

function workspaceConfigPath(workspaceDir?: string) {
  const paths = resolveAgentWorkspaceRuntimePaths(workspaceDir || resolveDesktopDefaultAgentWorkspaceDir())
  ensureAgentWorkspaceRuntime(paths)
  return paths.configPath
}

function readWorkspaceConfig(workspaceDir?: string): AgentWorkspaceConfig {
  return readAgentWorkspaceConfig(workspaceConfigPath(workspaceDir))
}

function saveWorkspaceConfig(input: ElectronAgentWorkspaceConfigSaveInput): AgentWorkspaceConfig {
  const configPath = workspaceConfigPath(input.workspaceDir)
  const current = readAgentWorkspaceConfig(configPath)
  const next: AgentWorkspaceConfig = {
    ...current,
    updatedAt: new Date().toISOString(),
  }
  applyNullableField(next, 'modelConfig', input.modelConfig)
  applyNullableField(next, 'toolProviders', input.toolProviders)
  applyNullableField(next, 'permissions', input.permissions)
  applyNullableField(next, 'environment', input.environment)
  writeAgentWorkspaceConfig(configPath, next)
  return readAgentWorkspaceConfig(configPath)
}

function applyNullableField<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | null | undefined): void {
  if (value === undefined) return
  if (value === null) {
    delete target[key]
    return
  }
  target[key] = value
}
