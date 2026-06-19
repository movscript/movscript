import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import test from 'node:test'

const homeBackedBrowserStorageAllowlist = [
  'features/agent/state/agentSessionStore.ts',
  'features/agent/state/agentStore.ts',
  'features/app-shell/application/editingProjectRegistry.ts',
  'features/app-shell/application/useRouteLayoutPaneController.ts',
  'features/canvas/runtime/runHistoryStore.ts',
  'features/content/application/contentCanvasViewState.ts',
  'features/editing/application/layoutPersistence.ts',
  'features/project/application/projectEntrySessionStore.ts',
  'features/resources/application/externalResourceSearchSnapshot.ts',
  'shared/infrastructure/appSettingsStore.ts',
  'shared/infrastructure/generationToolsStore.ts',
  'shared/infrastructure/providerConfigStore.ts',
  'shared/infrastructure/session/lastWorkspaceStore.ts',
  'shared/infrastructure/session/projectStore.ts',
  'shared/infrastructure/session/userStore.ts',
].sort()

const instrumentedFallbackBrowserStorageAllowlist = [
  'features/agent/state/agentPerformanceStore.ts',
].sort()

const lowRiskBrowserStorageAllowlist = [
  'features/agent/application/agentChatShellDebug.ts',
  'features/canvas/presentation/canvasDebugOptions.ts',
  'features/project/presentation/localAdminPromptPreference.ts',
  'i18n/index.ts',
  'shared/infrastructure/adminConsole.ts',
  'shared/infrastructure/config.ts',
  'shared/ui/resourceMediaDiagnostics.ts',
].sort()

const testBootstrapBrowserStorageAllowlist = [
  'shared/infrastructure/e2eBootstrap.ts',
].sort()

const rendererBrowserStorageAllowlist = [
  ...homeBackedBrowserStorageAllowlist,
  ...instrumentedFallbackBrowserStorageAllowlist,
  ...lowRiskBrowserStorageAllowlist,
  ...testBootstrapBrowserStorageAllowlist,
].sort()

const directRendererLocalStorageAllowlist: string[] = []

const persistedStoreAllowlist = [
  'features/agent/state/agentContentAreaStore.ts',
  'features/agent/state/agentStore.ts',
  'features/canvas/runtime/runHistoryStore.ts',
  'features/project/application/projectEntrySessionStore.ts',
  'shared/infrastructure/appSettingsStore.ts',
  'shared/infrastructure/generationToolsStore.ts',
  'shared/infrastructure/providerConfigStore.ts',
  'shared/infrastructure/session/lastWorkspaceStore.ts',
  'shared/infrastructure/session/projectStore.ts',
  'shared/infrastructure/session/userStore.ts',
  'shared/ui/toastStore.ts',
].sort()

const homeBackedPersistentStores = [
  'features/agent/state/agentContentAreaStore.ts',
  'features/agent/state/agentStore.ts',
  'features/canvas/runtime/runHistoryStore.ts',
  'features/project/application/projectEntrySessionStore.ts',
  'shared/infrastructure/generationToolsStore.ts',
  'shared/infrastructure/providerConfigStore.ts',
  'shared/infrastructure/session/lastWorkspaceStore.ts',
  'shared/infrastructure/session/projectStore.ts',
  'shared/infrastructure/session/userStore.ts',
]

const browserOnlyPersistentStores = [
  'shared/ui/toastStore.ts',
].sort()

const electronUserDataAllowlist = [
  'services/backend/paths.ts',
  'services/desktopIdentity.ts',
  'services/mediaPipeline/home.ts',
].sort()

const devUserDataScriptAllowlist = [
  'dev-sdk-runtimes.mjs',
  'dev-workspace.mjs',
].sort()

test('renderer browser storage usage is explicitly classified', () => {
  const files = rendererSourceFiles()
  const actual = files
    .filter((filePath) => rendererBrowserStoragePattern().test(readFileSync(filePath, 'utf8')))
    .map((filePath) => sourceRelative(filePath))
    .sort()

  assert.deepEqual(actual, rendererBrowserStorageAllowlist)
})

test('renderer source uses the browser storage helper instead of direct localStorage calls', () => {
  const files = rendererSourceFiles()
  const actual = files
    .filter((filePath) => directLocalStoragePattern().test(readFileSync(filePath, 'utf8')))
    .map((filePath) => sourceRelative(filePath))
    .sort()

  assert.deepEqual(actual, directRendererLocalStorageAllowlist)
})

test('renderer browser storage classifications stay mutually exclusive', () => {
  const categories = [
    homeBackedBrowserStorageAllowlist,
    instrumentedFallbackBrowserStorageAllowlist,
    lowRiskBrowserStorageAllowlist,
    testBootstrapBrowserStorageAllowlist,
  ]
  const allEntries = categories.flat()
  assert.equal(new Set(allEntries).size, allEntries.length)
})

test('zustand persisted stores are explicitly classified', () => {
  const files = rendererSourceFiles()
  const actual = files
    .filter((filePath) => /\bpersist\(/.test(readFileSync(filePath, 'utf8')))
    .map((filePath) => sourceRelative(filePath))
    .sort()

  assert.deepEqual(actual, persistedStoreAllowlist)
})

test('browser-only persisted stores remain limited to UI debug preferences', () => {
  assert.deepEqual(browserOnlyPersistentStores, ['shared/ui/toastStore.ts'])

  const toastStoreSource = readFileSync(resolve('src/shared/ui/toastStore.ts'), 'utf8')
  assert.match(toastStoreSource, /name: 'toast-debug'/)
  assert.match(toastStoreSource, /partialize: \(s\) => \(\{ debugMode: s\.debugMode \}\)/)
  assert.doesNotMatch(toastStoreSource, /partialize:[^\n]*toasts/)
})

test('desktop business stores route through MovScript Home storage', () => {
  for (const file of homeBackedPersistentStores) {
    const source = readFileSync(resolve('src', file), 'utf8')
    assert.match(source, /createDesktopStateStorage\(/, `${file} should use desktop Home storage`)
  }

  for (const file of homeBackedBrowserStorageAllowlist) {
    const source = readFileSync(resolve('src', file), 'utf8')
    assert.match(source, /createDesktopStateStorage\(|getDesktopState|getAgentSessionState|getAppSettings/, `${file} should only keep browser storage as Home fallback or migration`)
  }

  const agentPerformanceStoreSource = readFileSync(resolve('src/features/agent/state/agentPerformanceStore.ts'), 'utf8')
  assert.match(agentPerformanceStoreSource, /createInstrumentedAgentStateStorage/)
  assert.match(agentPerformanceStoreSource, /browserAgentStateStorage/)

  const configSource = readFileSync(resolve('src/shared/infrastructure/config.ts'), 'utf8')
  assert.match(configSource, /if \(readElectronApi\(\)\?\.getRuntimeConfig\) return null/)

  const appSettingsSource = readFileSync(resolve('src/shared/infrastructure/appSettingsStore.ts'), 'utf8')
  assert.match(appSettingsSource, /getAppSettings/)
  assert.match(appSettingsSource, /setAppSettings/)

  const agentSessionSource = readFileSync(resolve('src/features/agent/state/agentSessionStore.ts'), 'utf8')
  assert.match(agentSessionSource, /getAgentSessionState/)
  assert.match(agentSessionSource, /setAgentSessionState/)

  const editingRegistrySource = readFileSync(resolve('src/features/app-shell/application/editingProjectRegistry.ts'), 'utf8')
  assert.match(editingRegistrySource, /getDesktopState/)
  assert.match(editingRegistrySource, /setDesktopState/)

  const contentCanvasViewStateSource = readFileSync(resolve('src/features/content/application/contentCanvasViewState.ts'), 'utf8')
  assert.match(contentCanvasViewStateSource, /getDesktopState/)
  assert.match(contentCanvasViewStateSource, /setDesktopState/)
  assert.match(contentCanvasViewStateSource, /removeDesktopState/)

  const routeLayoutPaneControllerSource = readFileSync(resolve('src/features/app-shell/application/useRouteLayoutPaneController.ts'), 'utf8')
  assert.match(routeLayoutPaneControllerSource, /ROUTE_LAYOUT_PANE_DESKTOP_PREFIX = 'movscript-route-layout-pane-v1'/)
  assert.match(routeLayoutPaneControllerSource, /getDesktopState/)
  assert.match(routeLayoutPaneControllerSource, /setDesktopState/)

  const editingLayoutSource = readFileSync(resolve('src/features/editing/application/layoutPersistence.ts'), 'utf8')
  assert.match(editingLayoutSource, /EDITING_LAYOUT_DESKTOP_STATE_KEY = 'movscript-editing-workspace-layout-v1'/)
  assert.match(editingLayoutSource, /getDesktopState/)
  assert.match(editingLayoutSource, /setDesktopState/)
  assert.doesNotMatch(editingLayoutSource, /window\.localStorage/)

  const externalResourceSearchSnapshotSource = readFileSync(resolve('src/features/resources/application/externalResourceSearchSnapshot.ts'), 'utf8')
  assert.match(externalResourceSearchSnapshotSource, /EXTERNAL_RESOURCE_SEARCH_DESKTOP_STATE_KEY = 'movscript-external-resource-search-last-v1'/)
  assert.match(externalResourceSearchSnapshotSource, /getDesktopState/)
  assert.match(externalResourceSearchSnapshotSource, /setDesktopState/)
  assert.doesNotMatch(externalResourceSearchSnapshotSource, /window\.localStorage/)

  const electronApiCoreSource = readFileSync(resolve('src/shared/contracts/electronApiCore.ts'), 'utf8')
  assert.match(electronApiCoreSource, /export type ElectronMovScriptHomeInput = \{[\s\S]*movScriptHomeDir\?: string[\s\S]*workspaceDir\?: string/)
  assert.doesNotMatch(electronApiCoreSource, /from '\.\/electronApiWorkspace'/)
  assert.match(electronApiCoreSource, /export type ElectronDesktopStateInput = ElectronMovScriptHomeInput & \{[\s\S]*key: string/)
  assert.doesNotMatch(electronApiCoreSource, /export type ElectronDesktopStateInput = \{[\s\S]*workspaceDir\?: string/)
})

test('Electron userData access is limited to Chromium identity and legacy compatibility', () => {
  const electronActual = sourceFiles(resolve('electron'))
    .filter((filePath) => electronUserDataPattern().test(readFileSync(filePath, 'utf8')))
    .map((filePath) => electronRelative(filePath))
    .sort()
  const scriptActual = sourceFiles(resolve('scripts'))
    .filter((filePath) => electronUserDataPattern().test(readFileSync(filePath, 'utf8')))
    .map((filePath) => scriptsRelative(filePath))
    .sort()

  assert.deepEqual(electronActual, electronUserDataAllowlist)
  assert.deepEqual(scriptActual, devUserDataScriptAllowlist)
})

test('storage architecture docs describe the MovScript Home boundary', () => {
  const storageDoc = readFileSync(resolve('../../docs/movscript-home-storage-architecture.zh-CN.md'), 'utf8')
  const agentArchitecture = readFileSync(resolve('src/features/agent/ARCHITECTURE.md'), 'utf8')
  const unifiedAgentArchitecture = readFileSync(resolve('../../docs/unified-agent-chat-sdk-runtime-architecture.zh-CN.md'), 'utf8')

  assert.match(storageDoc, /MovScript Home.+唯一可信持久化边界/)
  assert.match(storageDoc, /<MovScript Home>\/agent\/sessions\.json/)
  assert.match(storageDoc, /<MovScript Home>\/desktop-state\/<key>\.json/)
  assert.match(storageDoc, /Electron `userData` 是 Chromium profile\/runtime 目录/)
  assert.match(storageDoc, /新增桌面业务状态不得使用 `app\.getPath\('userData'\)` 或 renderer `localStorage`/)
  assert.match(storageDoc, /普通 renderer 源码不得直接调用 `window\.localStorage`/)
  assert.match(storageDoc, /一旦存在 `getRuntimeConfig` bridge，`getAPIBaseURL\(\)` 不得从 browser app settings 读取旧 API 地址/)
  assert.match(storageDoc, /desktopStorageArchitecture\.test\.ts/)

  assert.match(agentArchitecture, /MovScript Home-backed desktop state/)
  assert.doesNotMatch(agentArchitecture, /syncing browser storage/)

  assert.match(unifiedAgentArchitecture, /MovScript Home 管理目录/)
  assert.match(unifiedAgentArchitecture, /不得用 Electron `userData` 或 browser storage 承载业务状态/)
  assert.doesNotMatch(unifiedAgentArchitecture, /桌面\/user data/)
})

function rendererBrowserStoragePattern(): RegExp {
  return /(?:read|write|remove)BrowserStorageItem\(\s*'local'|(?:window\.)?localStorage\.(?:getItem|setItem|removeItem)\(/
}

function directLocalStoragePattern(): RegExp {
  return /(?:window\.)?localStorage\.(?:getItem|setItem|removeItem)\(/
}

function electronUserDataPattern(): RegExp {
  return /(?:app\.)?(?:getPath|setPath)\(\s*['"]userData['"]\)|\buserDataDir\b|MOVSCRIPT_DESKTOP_USER_DATA_DIR/
}

function rendererSourceFiles(): string[] {
  return sourceFiles(resolve('src')).filter((filePath) => {
    const rel = sourceRelative(filePath)
    return !rel.startsWith('e2e/')
  })
}

function sourceFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path))
      continue
    }
    if (!isSourceFile(path) || isTestFile(path)) continue
    files.push(path)
  }
  return files
}

function isSourceFile(filePath: string): boolean {
  return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)
}

function isTestFile(filePath: string): boolean {
  return /\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filePath)
}

function sourceRelative(filePath: string): string {
  return relative(resolve('src'), filePath).replaceAll('\\', '/')
}

function electronRelative(filePath: string): string {
  return relative(resolve('electron'), filePath).replaceAll('\\', '/')
}

function scriptsRelative(filePath: string): string {
  return relative(resolve('scripts'), filePath).replaceAll('\\', '/')
}
