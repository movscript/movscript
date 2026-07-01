import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveMovScriptDataServiceSession } from '@movscript/data-client'
import {
  ensureMovScriptWorkspaceRoot,
  resolveMovScriptWorkspaceRootPaths,
} from '@movscript/workspace/home'
import type { AppSettings } from '../../src/shared/contracts/appSettings'

const APP_SETTINGS_FILE_NAME = 'app-settings.json'
const APP_SETTINGS_SCHEMA = 'movscript.desktop-app-settings.v1'

export function readDesktopAppSettings(movScriptHomeDir: string): AppSettings | null {
  const parsed = readJSON(resolveAppSettingsPath(movScriptHomeDir))
  if (!isRecord(parsed) || parsed.schema !== APP_SETTINGS_SCHEMA || !isRecord(parsed.settings)) return null
  return parsed.settings as unknown as AppSettings
}

export function readDesktopAppSettingsForRenderer(movScriptHomeDir: string): AppSettings | null {
  const settings = readDesktopAppSettings(movScriptHomeDir)
  if (!settings || settings.launchMode !== 'cloud') return settings
  const session = resolveMovScriptDataServiceSession({ workspaceDir: movScriptHomeDir })
  return {
    ...settings,
    dataConnection: { kind: 'cloud', url: session.baseURL },
    apiBaseURL: session.baseURL,
    cloudAPIBaseURL: session.baseURL,
  }
}

export function writeDesktopAppSettings(movScriptHomeDir: string, settings: AppSettings): void {
  writeJSONAtomic(resolveAppSettingsPath(movScriptHomeDir), {
    schema: APP_SETTINGS_SCHEMA,
    updatedAt: new Date().toISOString(),
    settings: sanitizeDesktopAppSettings(settings),
  })
}

type PersistedDesktopAppSettings = Omit<
  AppSettings,
  'apiBaseURL' | 'cloudAPIBaseURL' | 'daemonGatewayBaseURL' | 'dataConnection'
> & {
  dataConnection: Pick<AppSettings['dataConnection'], 'kind'>
}

function sanitizeDesktopAppSettings(settings: AppSettings): PersistedDesktopAppSettings {
  const {
    apiBaseURL: _derivedAPIBaseURL,
    cloudAPIBaseURL: _derivedCloudAPIBaseURL,
    daemonGatewayBaseURL: _derivedDaemonGatewayBaseURL,
    dataConnection: rawDataConnection,
    localAPIBaseURL: _legacyLocalAPIBaseURL,
    ...settingsWithoutLegacy
  } = settings as AppSettings & {
    localAPIBaseURL?: string
  }
  const { url: _derivedDataConnectionURL, ...dataConnection } = rawDataConnection ?? { kind: 'cloud' as const }
  return {
    ...settingsWithoutLegacy,
    dataConnection: {
      kind: dataConnection.kind === 'local' ? 'local' : 'cloud',
    },
    shotLibrarySources: settings.shotLibrarySources?.map((source) => ({
      id: source.id,
      name: source.name,
      baseURL: source.baseURL,
      enabled: source.enabled,
      readOnly: source.readOnly,
    })),
  }
}

function resolveAppSettingsPath(movScriptHomeDir: string): string {
  const root = resolveMovScriptWorkspaceRootPaths(movScriptHomeDir)
  ensureMovScriptWorkspaceRoot(root)
  return join(root.backendDir, APP_SETTINGS_FILE_NAME)
}

function readJSON(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch (error) {
    if (isNotFoundError(error)) return undefined
    throw error
  }
}

function writeJSONAtomic(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmpPath, filePath)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT'
}
