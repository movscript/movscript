import type {
  GenerationToolServer,
  GenerationToolServerType,
} from '../../../src/shared/contracts/generationTools'
import { fetchAdminGenerationToolsSettings, type RemoteGenerationToolsSettings } from './adminSettings'
import {
  compareGenerationToolServers,
  localDefaultGenerationToolServerID,
  localGenerationToolServers,
} from './settings'

export async function generationToolServersWithAdmin(type: GenerationToolServerType, adminSettings?: RemoteGenerationToolsSettings): Promise<GenerationToolServer[]> {
  const remoteSettings = adminSettings ?? await fetchAdminGenerationToolsSettings()
  const adminServers = remoteSettings.servers.filter((server) => server.type === type)
  const localServers = remoteSettings.allowLocal === false ? [] : localGenerationToolServers(type)
  return [...localServers, ...adminServers].sort(compareGenerationToolServers)
}

export async function selectGenerationToolServer(type: GenerationToolServerType, serverID?: string, serverScope?: GenerationToolServer['scope']): Promise<GenerationToolServer> {
  const adminSettings = await fetchAdminGenerationToolsSettings()
  const servers = (await generationToolServersWithAdmin(type, adminSettings))
    .filter((server) => !serverScope || server.scope === serverScope)
  const localDefaultServerID = localDefaultGenerationToolServerID(type)
  const remoteDefaultServerID = adminSettings.defaultServerIds?.[type] ?? adminSettings.defaultServerId
  const selected = serverID
    ? servers.find((server) => server.id === serverID)
    : servers.find((server) => server.id === localDefaultServerID && server.enabled)
      ?? servers.find((server) => server.id === remoteDefaultServerID && server.enabled)
      ?? servers.find((server) => server.enabled)

  if (!selected) {
    if (adminSettings.remoteUnavailable) {
      throw new Error(`Generation tool policy is unavailable; reconnect to the backend before using configured ${type === 'comfyui' ? 'ComfyUI' : 'WebUI'} servers`)
    }
    throw new Error(`No configured ${type === 'comfyui' ? 'ComfyUI' : 'WebUI'} server is available`)
  }
  if (!selected.enabled) {
    throw new Error(`Configured generation server ${selected.name} is disabled`)
  }
  return selected
}
