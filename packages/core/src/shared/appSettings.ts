export type AppLaunchMode = 'cloud' | 'local'
export type AppDataConnectionKind = 'local' | 'cloud' | 'external'
export type AppWorkMode = 'project' | 'tool' | 'agent'
export type AppLanguage = 'zh-CN' | 'en-US'

export interface AppDataConnectionSettings {
  kind: AppDataConnectionKind
  url?: string
}

export interface AppSettings {
  dataConnection: AppDataConnectionSettings
  /** @deprecated Use dataConnection and daemonGatewayBaseURL. */
  apiBaseURL: string
  /** @deprecated Use dataConnection.kind for user intent. */
  launchMode: AppLaunchMode
  workMode: AppWorkMode
  onboardingCompleted: boolean
  language?: AppLanguage
  /** @deprecated Use dataConnection.url for cloud/external data connections. */
  cloudAPIBaseURL?: string
  daemonGatewayBaseURL?: string
  movScriptWorkspaceDir?: string
  localDisplayName?: string
  shotLibrarySources?: ShotLibrarySourceConfig[]
  defaultShotLibrarySourceId?: string
}

export interface ShotLibrarySourceConfig {
  id: string
  name: string
  baseURL: string
  enabled?: boolean
  readOnly?: boolean
  authToken?: string
}

export interface NormalizeAppSettingsOptions {
  defaultSettings: AppSettings
  daemonGatewayBaseURL?: string
}

type LegacyAppSettings = Partial<AppSettings> & {
  localAPIBaseURL?: string
}

type LegacyNormalizeAppSettingsOptions = NormalizeAppSettingsOptions & {
  localAPIBaseURL?: string
  defaultSettings: AppSettings & {
    localAPIBaseURL?: string
  }
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function normalizeAPIBaseURL(value: string): string {
  const trimmed = trimTrailingSlash(value.trim())
  return trimmed.endsWith('/api/v1') ? trimmed.slice(0, -'/api/v1'.length) : trimmed
}

export function isLocalLaunchMode(settings?: Pick<AppSettings, 'launchMode'> | null): boolean {
  return settings?.launchMode === 'local'
}

export function isLocalDataConnection(settings?: { dataConnection?: AppDataConnectionSettings | null } | null): boolean {
  return settings?.dataConnection?.kind === 'local'
}

export function getSettingsDataConnectionBaseURL(
  settings?: { dataConnection?: AppDataConnectionSettings | null; cloudAPIBaseURL?: string; apiBaseURL?: string } | null,
): string {
  return normalizeAPIBaseURL(
    settings?.dataConnection?.url?.trim()
      || settings?.cloudAPIBaseURL?.trim()
      || settings?.apiBaseURL?.trim()
      || '',
  )
}

export function getSettingsDaemonGatewayBaseURL(
  settings?: { daemonGatewayBaseURL?: string; dataConnection?: AppDataConnectionSettings | null; apiBaseURL?: string } | null,
): string {
  return normalizeAPIBaseURL(
    settings?.daemonGatewayBaseURL?.trim()
      || (isLocalDataConnection(settings) ? settings?.dataConnection?.url?.trim() : '')
      || settings?.apiBaseURL?.trim()
      || '',
  )
}

export function normalizeAppSettings(
  settings: Partial<AppSettings> | null | undefined,
  options: NormalizeAppSettingsOptions,
): AppSettings {
  const legacySettings = (settings ?? {}) as LegacyAppSettings
  const legacyOptions = options as LegacyNormalizeAppSettingsOptions
  const {
    localAPIBaseURL: _legacySettingsLocalAPIBaseURL,
    ...settingsWithoutLegacyLocalAPIBaseURL
  } = legacySettings
  const {
    localAPIBaseURL: _legacyDefaultLocalAPIBaseURL,
    ...defaultSettingsWithoutLegacyLocalAPIBaseURL
  } = legacyOptions.defaultSettings
  const cloudAPIBaseURL = normalizeOptionalAPIBaseURL(settings?.cloudAPIBaseURL)
    ?? (settings?.launchMode === 'cloud' ? normalizeOptionalAPIBaseURL(settings?.apiBaseURL) : undefined)
    ?? options.defaultSettings.cloudAPIBaseURL
    ?? options.defaultSettings.apiBaseURL
  const daemonGatewayBaseURL = normalizeOptionalAPIBaseURL(settings?.daemonGatewayBaseURL)
    ?? normalizeOptionalAPIBaseURL(legacySettings.localAPIBaseURL)
    ?? (settings?.launchMode === 'local' ? normalizeOptionalAPIBaseURL(settings?.apiBaseURL) : undefined)
    ?? options.daemonGatewayBaseURL
    ?? legacyOptions.localAPIBaseURL
    ?? options.defaultSettings.daemonGatewayBaseURL
    ?? legacyOptions.defaultSettings.localAPIBaseURL
    ?? options.defaultSettings.apiBaseURL
  const dataConnectionKind = normalizeDataConnectionKind(
    settings?.dataConnection?.kind,
    settings?.launchMode,
    options.defaultSettings.dataConnection?.kind,
  )
  const dataConnectionURL = normalizeOptionalAPIBaseURL(settings?.dataConnection?.url)
    ?? (dataConnectionKind === 'local' ? daemonGatewayBaseURL : undefined)
    ?? (settings?.launchMode === 'cloud' ? normalizeOptionalAPIBaseURL(settings?.apiBaseURL) : undefined)
    ?? (dataConnectionKind !== 'local' ? cloudAPIBaseURL : undefined)
  const dataConnection: AppDataConnectionSettings = {
    kind: dataConnectionKind,
    ...(dataConnectionURL ? { url: dataConnectionURL } : {}),
  }
  const fallbackAPIBaseURL = dataConnection.kind === 'local'
    ? daemonGatewayBaseURL
    : dataConnection.url ?? cloudAPIBaseURL
  const apiBaseURL = normalizeAPIBaseURL(settings?.apiBaseURL || fallbackAPIBaseURL)
  const shotLibrarySources = normalizeShotLibrarySources(settings?.shotLibrarySources, apiBaseURL)
  const defaultShotLibrarySourceId = normalizeDefaultShotLibrarySourceId(settings?.defaultShotLibrarySourceId, shotLibrarySources)
  return {
    ...defaultSettingsWithoutLegacyLocalAPIBaseURL,
    ...settingsWithoutLegacyLocalAPIBaseURL,
    dataConnection,
    launchMode: dataConnection.kind === 'local' ? 'local' : 'cloud',
    workMode: normalizeWorkMode(settings?.workMode, options.defaultSettings.workMode),
    onboardingCompleted: settings?.onboardingCompleted ?? options.defaultSettings.onboardingCompleted,
    language: normalizeLanguage(settings?.language, options.defaultSettings.language),
    cloudAPIBaseURL,
    daemonGatewayBaseURL,
    movScriptWorkspaceDir: settings?.movScriptWorkspaceDir?.trim() || undefined,
    localDisplayName: settings?.localDisplayName?.trim() || undefined,
    apiBaseURL,
    shotLibrarySources,
    defaultShotLibrarySourceId,
  }
}

function normalizeOptionalAPIBaseURL(value: string | undefined): string | undefined {
  return value?.trim() ? normalizeAPIBaseURL(value) : undefined
}

function normalizeDataConnectionKind(
  value: unknown,
  legacyLaunchMode: unknown,
  fallback: unknown,
): AppDataConnectionKind {
  if (value === 'local' || value === 'cloud' || value === 'external') return value
  if (legacyLaunchMode === 'local') return 'local'
  if (fallback === 'local' || fallback === 'cloud' || fallback === 'external') return fallback
  return 'cloud'
}

function normalizeWorkMode(value: unknown, fallback: AppWorkMode): AppWorkMode {
  if (value === 'agent' || value === 'tool' || value === 'project') return value
  return fallback === 'agent' || fallback === 'tool' ? fallback : 'project'
}

function normalizeLanguage(value: unknown, fallback: AppLanguage | undefined): AppLanguage | undefined {
  if (value === 'zh-CN' || value === 'en-US') return value
  return fallback === 'zh-CN' || fallback === 'en-US' ? fallback : undefined
}

export function normalizeShotLibrarySources(
  sources: ShotLibrarySourceConfig[] | undefined,
  apiBaseURL: string,
): ShotLibrarySourceConfig[] {
  const defaultSource = defaultShotLibrarySource(apiBaseURL)
  const normalized = Array.isArray(sources)
    ? sources
        .map(normalizeShotLibrarySource)
        .filter((source): source is ShotLibrarySourceConfig => Boolean(source))
    : []
  const withoutDuplicateIds = new Map<string, ShotLibrarySourceConfig>()
  for (const source of normalized) {
    withoutDuplicateIds.set(source.id, source)
  }
  if (!withoutDuplicateIds.has(defaultSource.id)) {
    withoutDuplicateIds.set(defaultSource.id, defaultSource)
  } else {
    const current = withoutDuplicateIds.get(defaultSource.id)!
    withoutDuplicateIds.set(defaultSource.id, {
      ...defaultSource,
      ...current,
      baseURL: current.baseURL || defaultSource.baseURL,
      name: current.name || defaultSource.name,
    })
  }
  return Array.from(withoutDuplicateIds.values())
}

export function normalizeShotLibrarySource(
  source: Partial<ShotLibrarySourceConfig> | null | undefined,
): ShotLibrarySourceConfig | null {
  if (!source?.id?.trim() || !source.name?.trim() || !source.baseURL?.trim()) return null
  return {
    id: source.id.trim(),
    name: source.name.trim(),
    baseURL: normalizeAPIBaseURL(source.baseURL),
    enabled: source.enabled !== false,
    readOnly: source.readOnly === true,
    authToken: source.authToken?.trim() || undefined,
  }
}

export function defaultShotLibrarySource(apiBaseURL: string): ShotLibrarySourceConfig {
  return {
    id: 'default',
    name: 'Movscript',
    baseURL: apiBaseURL,
    enabled: true,
    readOnly: false,
  }
}

export function normalizeDefaultShotLibrarySourceId(
  defaultSourceId: string | undefined,
  sources: ShotLibrarySourceConfig[],
): string | undefined {
  const enabledSources = sources.filter((source) => source.enabled !== false)
  if (defaultSourceId && enabledSources.some((source) => source.id === defaultSourceId)) return defaultSourceId
  return enabledSources[0]?.id
}
