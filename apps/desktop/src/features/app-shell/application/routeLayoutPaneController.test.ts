import assert from 'node:assert/strict'
import test from 'node:test'

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { APP_SIDEBAR_WIDTH_STORAGE_KEY } from '@movscript/ui/layout'
import {
  AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY,
  AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY,
  AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY,
  AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY,
  LEGACY_AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY,
  LEGACY_AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY,
} from '@/features/agent/presentation/agentModePanelSizing'
import {
  TOOL_WORKBENCH_RESOURCE_PANE_DEFAULT_WIDTH,
  TOOL_WORKBENCH_RESOURCE_PANE_ID,
  TOOL_WORKBENCH_RESOURCE_PANE_MIN_WIDTH,
  TOOL_WORKBENCH_RESOURCE_PANE_WIDTH_STORAGE_KEY,
} from '@/features/tools/presentation/toolWorkbenchLayoutSpec'
import {
  APP_SHELL_AGENT_CONTENT_PANE_ID,
  APP_SHELL_AGENT_SIDEBAR_PANE_ID,
  APP_SHELL_SHELL_WORKBENCH_DOCK_DEFAULT_HEIGHT,
  APP_SHELL_SHELL_WORKBENCH_DOCK_HEIGHT_STORAGE_KEY,
  APP_SHELL_SHELL_WORKBENCH_DOCK_MAX_HEIGHT,
  APP_SHELL_SHELL_WORKBENCH_DOCK_MIN_HEIGHT,
  APP_SHELL_SHELL_WORKBENCH_DOCK_PANE_ID,
  APP_SHELL_SHELL_WORKBENCH_DOCK_STATE_STORAGE_KEY,
  APP_SHELL_TOOL_SIDEBAR_PANE_ID,
  CONTENT_CANVAS_STRUCTURE_PANE_ID,
  routeLayoutSpecForPathname,
} from '@/routes/routeLayoutRegistry'
import {
  allowedRouteLayoutPaneState,
  clampRouteLayoutPaneSize,
  readRouteLayoutPaneSize,
  readRouteLayoutPaneState,
  routeLayoutPaneById,
  routeLayoutPaneDefaultState,
  routeLayoutPaneStateStorageKey,
} from './useRouteLayoutPaneController'
import {
  routeLayoutOverlapPaneControllerOptionsForPane,
  routeLayoutOverlapPaneGroupPropsForVisibility,
} from './useRouteLayoutOverlapPaneController'

const legacyShellHostAliasName = ['Local', 'Terminal'].join('')
const legacyShellHostAliasLowerName = ['local', 'Terminal'].join('')
const legacyShellHostAliasPattern = new RegExp([
  `create${legacyShellHostAliasName}`,
  `run${legacyShellHostAliasName}Command`,
  `list${legacyShellHostAliasName}`,
  `get${legacyShellHostAliasName}`,
  `write${legacyShellHostAliasName}`,
  `resize${legacyShellHostAliasName}`,
  `kill${legacyShellHostAliasName}`,
  `on${legacyShellHostAliasName}`,
].join('|'))
const legacyShellHostContractPattern = new RegExp(`Electron${legacyShellHostAliasName}|electronApi${legacyShellHostAliasName}`)
const legacyShellHostManagerPattern = new RegExp(`${legacyShellHostAliasLowerName}Manager|${legacyShellHostAliasName}Manager`)
const legacyShellHostEnvPattern = new RegExp(`${legacyShellHostAliasLowerName}Env|${legacyShellHostAliasName}Env`)

test('route layout pane controller derives tool sidebar state contract from route spec', () => {
  const routeLayout = routeLayoutSpecForPathname('/tools/image')
  const pane = routeLayoutPaneById(routeLayout, APP_SHELL_TOOL_SIDEBAR_PANE_ID)

  assert.equal(pane?.storageKey, APP_SIDEBAR_WIDTH_STORAGE_KEY)
  assert.equal(routeLayoutPaneStateStorageKey(pane), `${APP_SIDEBAR_WIDTH_STORAGE_KEY}.state`)
  assert.equal(routeLayoutPaneDefaultState(pane), 'default')
  assert.equal(allowedRouteLayoutPaneState(pane, 'hidden'), 'hidden')
  assert.equal(allowedRouteLayoutPaneState(pane, 'expanded'), 'default')
})

test('route layout pane controller derives Shell Workbench dock state contract from route spec', () => {
  const routeLayout = routeLayoutSpecForPathname('/project/agent')
  const pane = routeLayoutPaneById(routeLayout, APP_SHELL_SHELL_WORKBENCH_DOCK_PANE_ID)

  assert.equal(routeLayoutPaneStateStorageKey(pane), APP_SHELL_SHELL_WORKBENCH_DOCK_STATE_STORAGE_KEY)
  assert.equal(pane?.storageKey, APP_SHELL_SHELL_WORKBENCH_DOCK_HEIGHT_STORAGE_KEY)
  assert.equal(pane?.defaultSize, APP_SHELL_SHELL_WORKBENCH_DOCK_DEFAULT_HEIGHT)
  assert.equal(pane?.minSize, APP_SHELL_SHELL_WORKBENCH_DOCK_MIN_HEIGHT)
  assert.equal(pane?.maxSize, APP_SHELL_SHELL_WORKBENCH_DOCK_MAX_HEIGHT)
  assert.equal(routeLayoutPaneDefaultState(pane), 'hidden')
  assert.equal(readRouteLayoutPaneState(pane, routeLayoutPaneStateStorageKey(pane)), 'hidden')
  assert.equal(allowedRouteLayoutPaneState(pane, 'default'), 'default')
  assert.equal(allowedRouteLayoutPaneState(pane, 'collapsed'), 'default')
})

test('route layout pane controller derives agent shell pane state contract from route spec', () => {
  const routeLayout = routeLayoutSpecForPathname('/project/agent')
  const sidebarPane = routeLayoutPaneById(routeLayout, APP_SHELL_AGENT_SIDEBAR_PANE_ID)
  const contentPane = routeLayoutPaneById(routeLayout, APP_SHELL_AGENT_CONTENT_PANE_ID)

  assert.equal(sidebarPane?.storageKey, AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY)
  assert.equal(sidebarPane?.stateStorageKey, AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY)
  assert.equal(sidebarPane?.collapsedSize, 0)
  assert.equal(sidebarPane?.defaultState, 'default')
  assert.equal(allowedRouteLayoutPaneState(sidebarPane, 'collapsed'), 'default')
  assert.equal(allowedRouteLayoutPaneState(sidebarPane, 'hidden'), 'hidden')
  assert.notEqual(sidebarPane?.stateStorageKey, LEGACY_AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY)

  assert.equal(contentPane?.storageKey, AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY)
  assert.equal(contentPane?.stateStorageKey, AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY)
  assert.equal(contentPane?.defaultState, 'default')
  assert.equal(contentPane?.collapsedSize, 0)
  assert.equal(allowedRouteLayoutPaneState(contentPane, 'hidden'), 'default')
  assert.notEqual(contentPane?.stateStorageKey, LEGACY_AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY)
})

test('route layout pane controller restores persisted agent shell pane sizes and states', () => {
  const previousWindow = globalThis.window
  const storage = new Map<string, string>()
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    },
  } as typeof window

  try {
    const routeLayout = routeLayoutSpecForPathname('/project/agent')
    const sidebarPane = routeLayoutPaneById(routeLayout, APP_SHELL_AGENT_SIDEBAR_PANE_ID)
    const contentPane = routeLayoutPaneById(routeLayout, APP_SHELL_AGENT_CONTENT_PANE_ID)

    storage.set(AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY, '340')
    storage.set(AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY, 'collapsed')
    storage.set(AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY, '980')
    storage.set(AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY, 'default')

    assert.equal(readRouteLayoutPaneSize(sidebarPane?.storageKey, sidebarPane?.defaultSize ?? 0), 340)
    assert.equal(readRouteLayoutPaneState(sidebarPane, routeLayoutPaneStateStorageKey(sidebarPane)), 'default')
    assert.equal(readRouteLayoutPaneSize(contentPane?.storageKey, contentPane?.defaultSize ?? 0), 980)
    assert.equal(readRouteLayoutPaneState(contentPane, routeLayoutPaneStateStorageKey(contentPane)), 'default')

    storage.set(AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY, 'not-a-number')
    storage.set(AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY, 'hidden')

    assert.equal(readRouteLayoutPaneSize(contentPane?.storageKey, contentPane?.defaultSize ?? 0), contentPane?.defaultSize)
    assert.equal(readRouteLayoutPaneState(contentPane, routeLayoutPaneStateStorageKey(contentPane)), 'default')
  } finally {
    globalThis.window = previousWindow
  }
})

test('route layout pane controller restores persisted Shell Workbench dock height', () => {
  const previousWindow = globalThis.window
  const storage = new Map<string, string>()
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    },
  } as typeof window

  try {
    const routeLayout = routeLayoutSpecForPathname('/project/agent')
    const shellWorkbenchPane = routeLayoutPaneById(routeLayout, APP_SHELL_SHELL_WORKBENCH_DOCK_PANE_ID)

    storage.set(APP_SHELL_SHELL_WORKBENCH_DOCK_HEIGHT_STORAGE_KEY, '420')
    storage.set(APP_SHELL_SHELL_WORKBENCH_DOCK_STATE_STORAGE_KEY, 'default')

    assert.equal(readRouteLayoutPaneSize(shellWorkbenchPane?.storageKey, shellWorkbenchPane?.defaultSize ?? 0), 420)
    assert.equal(readRouteLayoutPaneState(shellWorkbenchPane, routeLayoutPaneStateStorageKey(shellWorkbenchPane)), 'default')

    storage.set(APP_SHELL_SHELL_WORKBENCH_DOCK_HEIGHT_STORAGE_KEY, '1200')
    assert.equal(
      readRouteLayoutPaneSize(shellWorkbenchPane?.storageKey, shellWorkbenchPane?.defaultSize ?? 0, (size) => {
        return Math.min(shellWorkbenchPane?.maxSize as number, Math.max(shellWorkbenchPane?.minSize as number, size))
      }),
      APP_SHELL_SHELL_WORKBENCH_DOCK_MAX_HEIGHT,
    )
  } finally {
    globalThis.window = previousWindow
  }
})

test('route layout pane controller hydrates pane values from MovScript Home desktop state', async () => {
  const previousWindow = globalThis.window
  const storage = new Map<string, string>()
  const desktopReads: Array<{ key: string }> = []
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    },
    api: {
      getDesktopState: async (input: { key: string }) => {
        desktopReads.push(input)
        return {
          key: input.key,
          movScriptHomeDir: '/tmp/movscript-home',
          workspaceDir: '/tmp/movscript-home',
          path: '',
          version: '',
          value: '430',
        }
      },
    },
  } as typeof window

  try {
    const routeLayout = routeLayoutSpecForPathname('/project/agent')
    const shellWorkbenchPane = routeLayoutPaneById(routeLayout, APP_SHELL_SHELL_WORKBENCH_DOCK_PANE_ID)

    assert.equal(readRouteLayoutPaneSize(shellWorkbenchPane?.storageKey, shellWorkbenchPane?.defaultSize ?? 0), APP_SHELL_SHELL_WORKBENCH_DOCK_DEFAULT_HEIGHT)
    assert.match(desktopReads[0]?.key ?? '', /^movscript-route-layout-pane-v1\.[a-z0-9]+$/)

    await waitForAsyncStorage()

    assert.equal(readRouteLayoutPaneSize(shellWorkbenchPane?.storageKey, shellWorkbenchPane?.defaultSize ?? 0), 430)
    assert.equal(storage.has(APP_SHELL_SHELL_WORKBENCH_DOCK_HEIGHT_STORAGE_KEY), false)
  } finally {
    globalThis.window = previousWindow
  }
})

test('route layout pane controller migrates legacy browser pane values into MovScript Home desktop state', async () => {
  const previousWindow = globalThis.window
  const storage = new Map<string, string>([[APP_SHELL_SHELL_WORKBENCH_DOCK_HEIGHT_STORAGE_KEY, '420']])
  const desktopWrites: Array<{ key: string; value: unknown }> = []
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    },
    api: {
      getDesktopState: async (input: { key: string }) => ({
        key: input.key,
        movScriptHomeDir: '/tmp/movscript-home',
        workspaceDir: '/tmp/movscript-home',
        path: '',
        version: '',
        value: null,
      }),
      setDesktopState: async (input: { key: string; value: unknown }) => {
        desktopWrites.push(input)
        return {
          key: input.key,
          movScriptHomeDir: '/tmp/movscript-home',
          workspaceDir: '/tmp/movscript-home',
          path: '',
          version: '',
          value: input.value,
        }
      },
    },
  } as typeof window

  try {
    const routeLayout = routeLayoutSpecForPathname('/project/agent')
    const shellWorkbenchPane = routeLayoutPaneById(routeLayout, APP_SHELL_SHELL_WORKBENCH_DOCK_PANE_ID)

    assert.equal(readRouteLayoutPaneSize(shellWorkbenchPane?.storageKey, shellWorkbenchPane?.defaultSize ?? 0), 420)

    await waitForAsyncStorage()

    assert.equal(desktopWrites.length, 1)
    assert.match(desktopWrites[0]?.key ?? '', /^movscript-route-layout-pane-v1\.[a-z0-9]+$/)
    assert.equal(desktopWrites[0]?.value, '420')
    assert.equal(storage.has(APP_SHELL_SHELL_WORKBENCH_DOCK_HEIGHT_STORAGE_KEY), false)
  } finally {
    globalThis.window = previousWindow
  }
})

test('route layout pane controller clamps restored agent pane sizes', () => {
  const previousWindow = globalThis.window
  const storage = new Map<string, string>()
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    },
  } as typeof window

  try {
    const routeLayout = routeLayoutSpecForPathname('/project/agent')
    const sidebarPane = routeLayoutPaneById(routeLayout, APP_SHELL_AGENT_SIDEBAR_PANE_ID)
    const contentPane = routeLayoutPaneById(routeLayout, APP_SHELL_AGENT_CONTENT_PANE_ID)

    storage.set(AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY, '80')
    storage.set(AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY, '5000')

    assert.equal(
      readRouteLayoutPaneSize(sidebarPane?.storageKey, sidebarPane?.defaultSize ?? 0, (size) => {
        return Math.min(sidebarPane?.maxSize as number, Math.max(sidebarPane?.minSize as number, size))
      }),
      sidebarPane?.minSize,
    )
    assert.equal(
      readRouteLayoutPaneSize(contentPane?.storageKey, contentPane?.defaultSize ?? 0, (size) => {
        return Math.min(contentPane?.maxSize as number, Math.max(contentPane?.minSize as number, size))
      }),
      contentPane?.maxSize,
    )
  } finally {
    globalThis.window = previousWindow
  }
})

test('route layout pane controller derives default size clamp from numeric route pane specs', () => {
  const routeLayout = routeLayoutSpecForPathname('/project/content')
  const structurePane = routeLayoutPaneById(routeLayout, CONTENT_CANVAS_STRUCTURE_PANE_ID)

  assert.ok(!routeLayout.panes.some((pane) => pane.id === 'content-canvas.setting-catalog-pane'))
  assert.equal(clampRouteLayoutPaneSize(structurePane, 287.6), 288)
  assert.equal(clampRouteLayoutPaneSize(undefined, Number.NaN, 240), 240)
})

test('shell layout consumes mode pane state through the route pane controller', () => {
  const appShellSource = readFileSync(resolve('src/features/app-shell/application/AppShellLayout.tsx'), 'utf8')
  const appShellHeadersSource = readFileSync(resolve('src/features/app-shell/application/AppShellLayoutHeaders.tsx'), 'utf8')
  const appShellShellWorkbenchDockSource = readFileSync(resolve('src/features/app-shell/application/AppShellShellWorkbenchDock.tsx'), 'utf8')
  const desktopProjectSurfaceRuntimeSource = readFileSync(resolve('src/features/app-shell/application/desktopProjectSurfaceRuntime.tsx'), 'utf8')
  const desktopProjectSurfaceRuntimeModelSource = readFileSync(resolve('src/features/app-shell/application/desktopProjectSurfaceRuntimeModel.ts'), 'utf8')
  const projectAgentModePageSource = [
    readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebar.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/useProjectAgentModeSidebarController.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/useProjectAgentModeSidebarActions.ts'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ProjectAgentModeSidebarView.tsx'), 'utf8'),
  ].join('\n')
  const projectAgentContentPanelSource = readFileSync(resolve('src/features/agent/components/ProjectAgentContentPanel.tsx'), 'utf8')
  const shellWorkbenchSource = readFileSync(resolve('src/features/shell/ShellWorkbench.tsx'), 'utf8')
  const shellWorkbenchPartsPath = resolve('src/features/shell/ShellWorkbenchParts.tsx')
  const shellCollapsedDockSource = readFileSync(resolve('src/features/shell/ShellCollapsedDock.tsx'), 'utf8')
  const shellCommandBarSource = readFileSync(resolve('src/features/shell/ShellCommandBar.tsx'), 'utf8')
  const shellSessionRailSource = readFileSync(resolve('src/features/shell/ShellSessionRail.tsx'), 'utf8')
  const shellStatusBarSource = readFileSync(resolve('src/features/shell/ShellStatusBar.tsx'), 'utf8')
  const shellJobBannerSource = readFileSync(resolve('src/features/shell/ShellJobBanner.tsx'), 'utf8')
  const shellIntentCardSource = readFileSync(resolve('src/features/shell/ShellIntentCard.tsx'), 'utf8')
  const shellViewModelSource = readFileSync(resolve('src/features/shell/shellViewModel.ts'), 'utf8')
  const shellThemeSource = readFileSync(resolve('src/features/shell/shellTheme.ts'), 'utf8')
  const shellTerminalViewportSource = readFileSync(resolve('src/features/shell/ShellTerminalViewport.tsx'), 'utf8')
  const shellWorkbenchStylesSource = readFileSync(resolve('src/features/shell/ShellWorkbench.css'), 'utf8')
  const shellWorkbenchModelSource = readFileSync(resolve('src/features/shell/ShellWorkbenchModel.ts'), 'utf8')
  const shellWorkbenchControllerSource = readFileSync(resolve('src/features/shell/useShellWorkbenchController.ts'), 'utf8')
  const desktopShellGatewaySource = readFileSync(resolve('src/features/shell/application/desktopShellGateway.ts'), 'utf8')
  const electronApiSource = readFileSync(resolve('src/shared/contracts/electronApi.ts'), 'utf8')
  const desktopShellHostContractSource = readFileSync(resolve('src/shared/contracts/electronApiDesktopShellHost.ts'), 'utf8')
  const desktopShellHostElectronSource = readFileSync(resolve('src/features/shell/application/desktopShellHostElectron.ts'), 'utf8')
  assert.equal(existsSync(resolve('src/features/shell/application/' + ['local', 'TerminalElectron.ts'].join(''))), false)
  assert.equal(existsSync(resolve('src/shared/contracts/' + `electronApi${legacyShellHostAliasName}.ts`)), false)
  assert.equal(existsSync(resolve('electron/ipc/' + ['local', 'TerminalIpc.ts'].join(''))), false)
  assert.equal(existsSync(resolve('electron/preload/api/' + ['local', 'Terminal.ts'].join(''))), false)
  assert.equal(existsSync(resolve('electron/services/' + ['local', 'Terminal.ts'].join(''))), false)
  assert.equal(existsSync(resolve('electron/services/' + ['local', 'TerminalEnv.ts'].join(''))), false)
  const desktopShellHostIpcSource = readFileSync(resolve('electron/ipc/desktopShellHostIpc.ts'), 'utf8')
  const desktopShellHostPreloadSource = readFileSync(resolve('electron/preload/api/desktopShellHost.ts'), 'utf8')
  const desktopShellHostServiceSource = readFileSync(resolve('electron/services/desktopShellHost.ts'), 'utf8')
  const desktopShellHostEnvSource = readFileSync(resolve('electron/services/desktopShellHostEnv.ts'), 'utf8')
  const appWindowRegistrySource = readFileSync(resolve('electron/services/appWindowRegistry.ts'), 'utf8')
  const desktopMainSource = readFileSync(resolve('electron/main.ts'), 'utf8')
  const managedServicesShutdownSource = readFileSync(resolve('electron/managedServices/shutdown.ts'), 'utf8')
  const remotionStudioSurfaceSource = readFileSync(resolve('../../surface/project/src/components/remotion/ProjectRemotionStudioSurface.tsx'), 'utf8')
  const projectSurfaceRuntimeSource = readFileSync(resolve('../../surface/project/src/runtime/ProjectSurfaceRuntime.ts'), 'utf8')
  const projectSurfaceRuntimeIndexSource = readFileSync(resolve('../../surface/project/src/runtime/index.ts'), 'utf8')
  const localDaemonSource = readFileSync(resolve('../../packages/local-daemon/src/index.ts'), 'utf8')
  const routeLayoutPaneControllerSource = readFileSync(resolve('../../packages/ui/src/components/layout/route-layout-pane-controller.tsx'), 'utf8')

  assert.match(appShellSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_TOOL_SIDEBAR_PANE_ID/)
  assert.match(appShellSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_SETTINGS_SIDEBAR_PANE_ID/)
  assert.doesNotMatch(appShellSource, /APP_SHELL_ASSISTANT_DOCK_PANE_ID/)
  assert.doesNotMatch(appShellSource, /clampDetailAgentPanelWidth/)
  assert.doesNotMatch(appShellSource, /AIAgentPanel/)
  assert.match(appShellSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_SHELL_WORKBENCH_DOCK_PANE_ID[\s\S]*fallbackState: 'hidden'/)
  assert.match(appShellSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_SHELL_WORKBENCH_DOCK_PANE_ID[\s\S]*fallbackSize: APP_SHELL_SHELL_WORKBENCH_DOCK_DEFAULT_HEIGHT[\s\S]*clampSize: clampShellWorkbenchDockHeight[\s\S]*fallbackState: 'hidden'/)
  assert.match(appShellSource, /shellWorkspaceContextForRoute\(\{[\s\S]*currentProject,[\s\S]*userId,/)
  assert.doesNotMatch(appShellSource, /scope: 'project' as const,[\s\S]*projectId: currentProject\.ID/)
  assert.match(appShellSource, /<AppShellShellWorkbenchDock[\s\S]*open=\{shellWorkbenchOpen\}[\s\S]*paneSize=\{shellWorkbenchPane\.size\}[\s\S]*onPaneSizeChange=\{shellWorkbenchPane\.setSize\}/)
  assert.match(appShellShellWorkbenchDockSource, /export function clampShellWorkbenchDockHeight/)
  assert.match(appShellShellWorkbenchDockSource, /useResizablePanel\(\{[\s\S]*size: paneSize[\s\S]*onSizeChange: onPaneSizeChange[\s\S]*resizeEdge: 'top'/)
  assert.match(appShellShellWorkbenchDockSource, /className="app-shell-shell-workbench-resize-handle"[\s\S]*\{...shellWorkbenchResizeHandleProps\}/)
  assert.match(appShellSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_AGENT_SIDEBAR_PANE_ID[\s\S]*clampSize: clampAgentModeSidebarWidth[\s\S]*\}\)/)
  assert.match(appShellSource, /useRouteLayoutPaneController\(\{[\s\S]*paneId: APP_SHELL_AGENT_CONTENT_PANE_ID[\s\S]*clampSize: clampAgentModeContentPanelWidth[\s\S]*fallbackState: 'default'[\s\S]*\}\)/)
  assert.match(appShellSource, /toolSidebarPane\.hidden/)
  assert.match(appShellSource, /toolSidebarPane\.setSize/)
  assert.match(appShellSource, /settingsSidebarPane\.hidden/)
  assert.match(appShellSource, /settingsSidebarPane\.setSize/)
  assert.match(appShellSource, /sidebar=\{settingsChrome \? \(/)
  assert.match(appShellSource, /: toolChrome \? \(/)
  assert.match(appShellSource, /centerHeader=\{settingsChrome \? appShellHeaders\.settingsCenterHeader : toolChrome \? appShellHeaders\.toolCenterHeader : homeChrome \? appShellHeaders\.homeCenterHeader : appShellHeaders\.projectCenterHeader\}/)
  assert.match(appShellSource, /leftPaneHidden=\{settingsChrome \? settingsSidebarHidden : toolChrome \? toolSidebarHidden : false\}/)
  assert.match(appShellSource, /const shellWorkbenchOpen = shellWorkbenchSupported && !shellWorkbenchPane\.hidden/)
  assert.match(routeLayoutPaneControllerSource, /const shouldRefreshState = !changedKey \|\| changedKey === stateStorageKey/)
  assert.match(routeLayoutPaneControllerSource, /const shouldRefreshSize = !changedKey \|\| changedKey === sizeStorageKey/)
  assert.match(routeLayoutPaneControllerSource, /controlledState === undefined && shouldRefreshState/)
  assert.match(routeLayoutPaneControllerSource, /if \(shouldRefreshSize\) \{[\s\S]*readRouteLayoutPaneSize\(sizeStorageKey, defaultSize, clampPaneSize\)/)
  assert.match(appShellSource, /selectShellWorkbenchSession,/)
  assert.match(appShellSource, /const showShellWorkbench = \(sessionId\?: string\) => \{[\s\S]*selectShellWorkbenchSession\(sessionId\)[\s\S]*shellWorkbenchPane\.show\(\)/)
  assert.match(appShellSource, /window\.requestAnimationFrame\(\(\) => \{[\s\S]*selectShellWorkbenchSession\(sessionId\)[\s\S]*shellWorkbenchPane\.show\(\)/)
  assert.match(appShellSource, /const handleShellWorkbenchRevealEvent = \(event: Event\) => \{[\s\S]*showShellWorkbench\(typeof detail\?\.sessionId === 'string' \? detail\.sessionId : undefined\)/)
  assert.match(appShellSource, /const unsubscribeReveal = subscribeShellWorkbenchReveal\(showShellWorkbench\)/)
  assert.match(appShellSource, /window\.addEventListener\(SHELL_WORKBENCH_REVEAL_EVENT, handleShellWorkbenchRevealEvent\)/)
  assert.match(appShellSource, /unsubscribeReveal\(\)/)
  assert.match(appShellSource, /window\.cancelAnimationFrame\(revealFrame\)/)
  assert.match(appShellSource, /window\.removeEventListener\(SHELL_WORKBENCH_REVEAL_EVENT, handleShellWorkbenchRevealEvent\)/)
  assert.doesNotMatch(appShellSource, /agentSidebarPane\.collapse/)
  assert.match(appShellSource, /agentContentPane\.collapsed/)
  assert.match(appShellSource, /fallbackState: 'default'/)
  assert.match(appShellSource, /const agentSidebarVisible = agentChrome && !agentSidebarPane\.hidden/)
  assert.match(appShellSource, /const agentLeftSlotStyle = appShellHiddenSlotStyle\(!agentSidebarVisible, agentSidebarPane\.size\)/)
  assert.match(appShellSource, /const agentRightSlotStyle = appShellCollapsedSlotStyle\(\{[\s\S]*collapsed: agentContentPane\.collapsed,[\s\S]*size: agentContentPane\.size,[\s\S]*collapsedSize: agentContentPane\.pane\?\.collapsedSize,/)
  assert.match(appShellHeadersSource, /<AppShellAgentContentToggle[\s\S]*closed=\{agentContentPanelClosed\}[\s\S]*onShow=\{agentContentPane\.show\}[\s\S]*onCollapse=\{agentContentPane\.collapse\}/)
  assert.doesNotMatch(appShellSource, /showAgentContentPanelShortcut/)
  assert.match(appShellSource, /sidebarCollapsed=\{false\}/)
  assert.match(appShellSource, /leftPaneHidden=\{!agentSidebarVisible\}/)
  assert.match(appShellHeadersSource, /<AppShellLeftPaneToggle hidden=\{!agentSidebarVisible\} onShow=\{agentSidebarPane\.show\} onHide=\{agentSidebarPane\.hide\}/)
  assert.match(appShellSource, /<ProjectAgentModeSidebar[\s\S]*width=\{agentSidebarPane\.size\}[\s\S]*onWidthChange=\{agentSidebarPane\.setSize\}/)
  assert.match(appShellSource, /<ProjectAgentContentPanel[\s\S]*collapsed=\{agentContentPane\.collapsed\}[\s\S]*onCollapsedChange=\{\(collapsed\) => \{[\s\S]*agentContentPane\.collapse\(\)[\s\S]*agentContentPane\.show\(\)[\s\S]*width=\{agentContentPane\.size\}[\s\S]*onWidthChange=\{agentContentPane\.setSize\}/)
  assert.match(appShellSource, /onOpenChange=\{\(open\) => \{[\s\S]*shellWorkbenchPane\.show\(\)[\s\S]*shellWorkbenchPane\.hide\(\)/)
  assert.match(appShellShellWorkbenchDockSource, /<ShellWorkbench[\s\S]*open=\{open\}[\s\S]*onOpenChange=\{onOpenChange\}/)
  assert.match(appShellShellWorkbenchDockSource, /ariaLabel: '调整 Shell 高度'/)
  assert.doesNotMatch(shellWorkbenchSource, /SHELL_WORKBENCH_PANEL_OPEN_KEY/)
  assert.doesNotMatch(shellWorkbenchSource, /movscript\.agentMode\.terminal\.open/)
  assert.doesNotMatch(shellWorkbenchSource, /window\.localStorage\.(getItem|setItem)\(/)
  assert.doesNotMatch(shellWorkbenchSource, /ShellWorkbenchParts/)
  assert.equal(existsSync(shellWorkbenchPartsPath), false)
  assert.match(shellWorkbenchSource, /features\/shell\/ShellCommandBar/)
  assert.match(shellWorkbenchSource, /features\/shell\/ShellSessionRail/)
  assert.match(shellWorkbenchSource, /features\/shell\/ShellStatusBar/)
  assert.match(shellWorkbenchSource, /features\/shell\/ShellJobBanner/)
  assert.match(shellWorkbenchSource, /features\/shell\/ShellIntentCard/)
  assert.match(shellWorkbenchSource, /type \{ ShellIntent, ShellJob, ShellSession, ShellWorkbenchMode \}/)
  assert.match(shellWorkbenchSource, /const shellMode: ShellWorkbenchMode = activeIntent \? 'external_shell_intent' : 'desktop_shell_host'/)
  assert.match(shellWorkbenchSource, /data-shell-mode=\{shellMode\}/)
  assert.match(shellWorkbenchSource, /terminal\.sessions\.length === 0/)
  assert.match(shellWorkbenchSource, />暂无 Shell 会话<\/span>/)
  assert.match(shellWorkbenchSource, /terminal\.addShell\(\)/)
  assert.match(shellWorkbenchSource, /<ShellCommandBar[\s\S]*onAddShell=\{terminal\.addShell\}/)
  assert.match(shellWorkbenchSource, /<ShellCommandBar[\s\S]*onSplitShell=\{terminal\.splitShell\}/)
  assert.match(shellWorkbenchSource, /<ShellCommandBar[\s\S]*onStopShell=\{terminal\.stopShell\}/)
  assert.match(shellWorkbenchSource, /const derivedActiveJob = activeJob \?\? shellJobFromSession\(terminal\.activeSession\)/)
  assert.match(shellWorkbenchSource, /<ShellJobBanner[\s\S]*job=\{derivedActiveJob\}/)
  assert.match(shellWorkbenchSource, /const activeShellLogText = terminal\.activeSession[\s\S]*runtimeSnapshot\(terminal\.activeSession\.id\)\?\.outputBuffer/)
  assert.match(shellWorkbenchSource, /const activeJobLogText = derivedActiveJob\?\.sessionId[\s\S]*runtimeSnapshot\(derivedActiveJob\.sessionId\)\?\.outputBuffer/)
  assert.match(shellWorkbenchSource, /<ShellStatusBar[\s\S]*activeSession=\{terminal\.activeSession\}[\s\S]*logText=\{activeShellLogText\}/)
  assert.match(shellWorkbenchSource, /import \{ toast \} from '@movscript\/ui\/toast'/)
  assert.match(shellWorkbenchSource, /import \{ copyTextToClipboard \} from '@\/shared\/ui\/browserActions'/)
  assert.match(shellWorkbenchSource, /const handleCopyIntentCommand = onCopyIntentCommand \?\? \(\(intent: ShellIntent\) => \{[\s\S]*copyShellWorkbenchText\(intent\.commandText, '命令已复制'/)
  assert.match(shellWorkbenchSource, /const handleCopyJobCommand = onCopyJobCommand \?\? \(\(job: ShellJob\) => \{[\s\S]*copyShellWorkbenchText\(job\.command, '命令已复制'/)
  assert.match(shellWorkbenchSource, /const handleCopyJobLogs = onCopyJobLogs \?\? \(\(job: ShellJob\) => \{[\s\S]*runtimeSnapshot\(job\.sessionId\)\?\.outputBuffer[\s\S]*copyShellWorkbenchText\(logs, '日志已复制'/)
  assert.match(shellWorkbenchSource, /copyShellWorkbenchText\(session\.cwd, '工作目录已复制'/)
  assert.match(shellWorkbenchSource, /function copyShellWorkbenchText\(text: string \| undefined, successMessage: string, emptyMessage: string\): void/)
  assert.match(shellWorkbenchSource, /toast\.info\(emptyMessage\)/)
  assert.match(shellWorkbenchSource, /toast\.error\('无法复制', '剪贴板 API 不可用。'\)/)
  assert.match(shellWorkbenchSource, /copyTextToClipboard\(nextText\)[\s\S]*toast\.success\(successMessage\)/)
  assert.match(shellWorkbenchSource, /function shellJobFromSession\(session: ShellSession \| undefined\): ShellJob \| undefined/)
  assert.match(shellWorkbenchSource, /if \(!session \|\| session\.owner !== 'system'\) return undefined/)
  assert.match(shellWorkbenchSource, /schema: 'movscript\.shell_job\.v1'/)
  assert.match(shellWorkbenchSource, /id: session\.jobId \?\? `session-job:\$\{session\.id\}`/)
  assert.match(shellWorkbenchSource, /ownerFeature: session\.ownerFeature/)
  assert.match(shellWorkbenchSource, /port: shellJobPortFromPreviewUrl\(session\.previewUrl\)/)
  assert.match(shellWorkbenchSource, /function shellJobPortFromPreviewUrl\(previewUrl: string\): number \| undefined/)
  assert.match(shellWorkbenchSource, /session\.ownerFeature === 'remotion_studio'/)
  assert.match(shellWorkbenchSource, /terminal\.stopShell\(job\.sessionId\)/)
  assert.match(shellWorkbenchSource, /<ShellIntentCard[\s\S]*intent=\{activeIntent\}/)
  assert.match(shellCollapsedDockSource, /当前运行环境不支持 MovScript Shell/)
  assert.match(shellCollapsedDockSource, />MovScript Shell<\/span>/)
  assert.doesNotMatch(shellCollapsedDockSource, />Terminal<\/span>/)
  assert.doesNotMatch(shellCollapsedDockSource, new RegExp(`打开 ${'Terminal'}|收起 ${'Terminal'}`))
  assert.match(shellCommandBarSource, /export function ShellCommandBar/)
  assert.match(shellCommandBarSource, /shellSessionScopeLabel/)
  assert.match(shellCommandBarSource, /const scopeLabel = shellSessionScopeLabel\(activeSession\)/)
  assert.match(shellCommandBarSource, /activeSession\?\.title \?\? '暂无 Shell 会话'/)
  assert.match(shellCommandBarSource, /aria-label="工作目录"/)
  assert.match(shellCommandBarSource, /const activeSessionCanStop = activeSession\?\.status === 'running' \|\| activeSession\?\.status === 'starting'/)
  assert.match(shellCommandBarSource, /onClick=\{onAddShell\}[\s\S]*aria-label="新增 Shell"/)
  assert.match(shellCommandBarSource, /onClick=\{onSplitShell\}[\s\S]*aria-label="拆分 Shell"/)
  assert.match(shellCommandBarSource, /onClick=\{\(\) => activeSession && onStopShell\(activeSession\.id\)\}[\s\S]*aria-label="停止 Shell"/)
  assert.match(shellCommandBarSource, /onClick=\{\(\) => onStartShell\(activeSession\.id\)\}[\s\S]*aria-label="启动 Shell"/)
  assert.doesNotMatch(shellCommandBarSource, /新增 shell|拆分 shell|停止 shell|启动 shell/)
  assert.match(shellSessionRailSource, /export function ShellSessionRail/)
  assert.match(shellSessionRailSource, /label="系统"/)
  assert.match(shellSessionRailSource, /label="用户"/)
  assert.match(shellSessionRailSource, /aria-label="新增 Shell"/)
  assert.match(shellSessionRailSource, /className="shell-workbench-panel__shell-select"[\s\S]*onClick=\{\(\) => onSelectShell\(session\.id\)\}/)
  assert.match(shellSessionRailSource, /type="button"[\s\S]*className="shell-workbench-panel__shell-action"[\s\S]*aria-label=\{`关闭 \$\{session\.title\}`\}/)
  assert.doesNotMatch(shellSessionRailSource, /role="button"/)
  assert.doesNotMatch(shellSessionRailSource, /tabIndex=\{?0\}?/)
  assert.doesNotMatch(shellSessionRailSource, /新增 shell/)
  assert.match(shellStatusBarSource, /export function ShellStatusBar/)
  assert.match(shellStatusBarSource, /复制工作目录/)
  assert.doesNotMatch(shellStatusBarSource, /复制 cwd/)
  assert.match(shellStatusBarSource, /复制日志/)
  assert.match(shellJobBannerSource, /export function ShellJobBanner/)
  assert.match(shellJobBannerSource, /onCopyCommand\?: \(job: ShellJob\) => void/)
  assert.match(shellJobBannerSource, /onCopyLogs\?: \(job: ShellJob\) => void/)
  assert.match(shellJobBannerSource, /logsAvailable\?: boolean/)
  assert.match(shellJobBannerSource, /shellJobMetaItems/)
  assert.match(shellJobBannerSource, /shellJobPreviewUrl/)
  assert.match(shellJobBannerSource, /const previewUrl = shellJobPreviewUrl\(job\)/)
  assert.match(shellJobBannerSource, /const progressPercent = shellJobProgressPercent\(job\.progress\)/)
  assert.match(shellJobBannerSource, /const metaItems = shellJobMetaItems\(job\)/)
  assert.match(shellJobBannerSource, /className="shell-workbench-panel__job-source">\{job\.source\}/)
  assert.match(shellJobBannerSource, /aria-label="Shell Job 信息"/)
  assert.match(shellJobBannerSource, /aria-label="Remotion 预览地址"/)
  assert.match(shellJobBannerSource, /className="shell-workbench-panel__job-preview"/)
  assert.match(shellJobBannerSource, /<code>\{previewUrl\}<\/code>/)
  assert.match(shellJobBannerSource, /metaItems\.map\(\(item\) =>/)
  assert.match(shellJobBannerSource, /<b>\{item\.label\}<\/b>/)
  assert.match(shellJobBannerSource, /aria-label=\{`任务进度 \$\{Math\.round\(progressPercent\)\}%`\}/)
  assert.match(shellJobBannerSource, /复制命令/)
  assert.match(shellJobBannerSource, /复制日志/)
  assert.match(shellIntentCardSource, /export function ShellIntentCard/)
  assert.match(shellIntentCardSource, /const riskLabel = intent\.destructive \? '需要确认' : '工作区命令'/)
  assert.match(shellIntentCardSource, /const IntentIcon = intent\.destructive \? AlertTriangle : TerminalIcon/)
  assert.match(shellIntentCardSource, /data-risk=\{intent\.destructive \? 'destructive' : 'workspace'\}/)
  assert.match(shellIntentCardSource, /aria-label="Shell 命令信息"/)
  assert.match(shellIntentCardSource, /<dt>工作目录<\/dt>/)
  assert.doesNotMatch(shellIntentCardSource, /<dt>cwd<\/dt>/)
  assert.match(shellIntentCardSource, /<dd><code>\{intent\.commandText\}<\/code><\/dd>/)
  assert.match(shellIntentCardSource, /className="shell-workbench-panel__intent-risk"/)
  assert.match(shellViewModelSource, /export function shellJobProgressPercent\(progress: number \| undefined\): number \| undefined/)
  assert.match(shellViewModelSource, /const normalized = progress <= 1 \? progress \* 100 : progress/)
  assert.match(shellViewModelSource, /export function shellJobPreviewUrl\(job: ShellJob\): string \| undefined/)
  assert.match(shellViewModelSource, /export type ShellJobMetaItem = \{[\s\S]*label: string[\s\S]*value: string/)
  assert.match(shellViewModelSource, /export function shellJobMetaItems\(job: ShellJob\): ShellJobMetaItem\[\]/)
  assert.doesNotMatch(shellViewModelSource, /\{ label: '预览', value: job\.previewUrl \}/)
  assert.match(shellViewModelSource, /\{ label: '工作目录', value: job\.cwd \}/)
  assert.match(shellViewModelSource, /\{ label: '命令', value: job\.command \}/)
  assert.match(shellViewModelSource, /export function shellSessionSubtitle\(session: ShellSession, disabled: boolean\): string/)
  assert.match(shellViewModelSource, /export function shellSessionScopeLabel\(session: ShellSession \| undefined\): string/)
  assert.match(shellViewModelSource, /if \(!session\) return '空闲'/)
  assert.match(shellViewModelSource, /const ownerLabel = session\.owner === 'system' \? '系统' : '用户'/)
  assert.match(shellViewModelSource, /session\.scope === 'home'[\s\S]*\? 'Home'[\s\S]*: session\.scope === 'workspace'[\s\S]*\? '工作区'[\s\S]*: '当前窗口'/)
  assert.match(shellViewModelSource, /return `\$\{ownerLabel\} \/ \$\{scopeLabel\}`/)
  assert.match(shellViewModelSource, /export function compactShellId\(value: string\): string/)
  assert.match(shellThemeSource, /export const SHELL_TERMINAL_CANVAS_THEME = \{[\s\S]*background: '#111418'[\s\S]*foreground: '#d7dde7'/)
  assert.match(shellThemeSource, /export function shellTerminalThemeFromStyle\(style: CSSStyleDeclaration\): ITheme/)
  assert.match(shellTerminalViewportSource, /features\/shell\/shellTheme/)
  assert.match(shellTerminalViewportSource, /fontFamily: SHELL_TERMINAL_FONT_FAMILY/)
  assert.match(shellTerminalViewportSource, /fontSize: SHELL_TERMINAL_FONT_SIZE/)
  assert.match(shellTerminalViewportSource, /lineHeight: SHELL_TERMINAL_LINE_HEIGHT/)
  assert.match(shellTerminalViewportSource, /return shellTerminalThemeFromStyle\(window\.getComputedStyle\(host\)\)/)
  assert.doesNotMatch(shellTerminalViewportSource, /function cssColorValue/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__statusbar \{/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__empty \{/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__empty \.ms-button \{/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__statusbar-action \{/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__job-progress \{/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__job-progress span \{/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__job-banner\[data-tone="success"\] \.shell-workbench-panel__job-progress span \{/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__job-source \{/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__job-meta \{[\s\S]*flex-wrap: wrap;[\s\S]*gap: 6px 10px;/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__job-preview \{[\s\S]*max-width: min\(100%, 560px\);[\s\S]*overflow: hidden;/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__job-preview code \{[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__job-meta b \{/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__intent-title-row \{/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__intent-risk \{/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__intent-card\[data-risk="destructive"\] \.shell-workbench-panel__intent-risk \{/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__intent-heading > div > span:not\(\.shell-workbench-panel__intent-risk\) \{/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__intent-fields code \{[\s\S]*white-space: pre-wrap;[\s\S]*word-break: break-word;/)
  assert.match(shellWorkbenchStylesSource, /\.shell-workbench-panel__shells \{[\s\S]*width: 248px;[\s\S]*flex: 0 0 248px;/)
  assert.match(shellWorkbenchStylesSource, /@media \(max-width: 1120px\) \{[\s\S]*\.shell-workbench-panel__shells \{[\s\S]*width: 184px;[\s\S]*flex-basis: 184px;/)
  assert.match(shellWorkbenchStylesSource, /@media \(max-width: 820px\) \{[\s\S]*\.shell-workbench-panel \{[\s\S]*min-height: min\(420px, calc\(100vh - 120px\)\);[\s\S]*max-height: 62vh;[\s\S]*flex-basis: min\(520px, 62vh\);/)
  assert.match(shellWorkbenchStylesSource, /@media \(max-width: 820px\) \{[\s\S]*\.shell-workbench-panel__body \{[\s\S]*flex-direction: column;[\s\S]*\.shell-workbench-panel__terminal-stack \{[\s\S]*min-height: 220px;[\s\S]*\.shell-workbench-panel__terminal-canvas \{[\s\S]*min-height: 104px;[\s\S]*\.shell-workbench-panel__shells \{[\s\S]*width: 100%;[\s\S]*border-left: 0;/)
  assert.match(shellWorkbenchStylesSource, /@media \(max-width: 820px\) \{[\s\S]*\.shell-workbench-panel__shell-list \{[\s\S]*max-height: 78px;[\s\S]*flex-direction: row;/)
  assert.match(shellWorkbenchStylesSource, /@media \(max-width: 820px\) \{[\s\S]*\.shell-workbench-panel__job-actions \{[\s\S]*flex-wrap: wrap;[\s\S]*justify-content: flex-start;/)
  assert.match(shellWorkbenchStylesSource, /@media \(max-width: 820px\) \{[\s\S]*\.shell-workbench-panel__job-preview code \{[\s\S]*white-space: normal;[\s\S]*overflow-wrap: anywhere;/)
  assert.match(shellWorkbenchModelSource, /SHELL_WORKBENCH_SESSION_PREFIX/)
  assert.doesNotMatch(shellWorkbenchModelSource, /FIRST_SHELL_ID/)
  assert.match(shellWorkbenchModelSource, /export function createInitialShellWorkbenchStore\(\): ShellWorkbenchStoreState \{[\s\S]*sessions: \[\],[\s\S]*activeShellId: '',[\s\S]*nextShellIndex: 0/)
  assert.doesNotMatch(shellWorkbenchModelSource, /sessions: \[createShellSession\(1\)\]/)
  assert.match(shellWorkbenchModelSource, /export type ShellStatus = 'idle' \| 'starting' \| 'running' \| 'blocked' \| 'failed' \| 'exited' \| 'needs_external_shell'/)
  assert.match(shellWorkbenchModelSource, /export type ShellSessionSchema = 'movscript\.shell_session\.v1'/)
  assert.match(shellWorkbenchModelSource, /export type ShellJobSchema = 'movscript\.shell_job\.v1'/)
  assert.match(shellWorkbenchModelSource, /export type ShellIntentSchema = 'movscript\.shell_intent\.v1'/)
  assert.match(shellWorkbenchModelSource, /export type ShellWorkbenchMode = 'desktop_shell_host' \| 'external_shell_intent'/)
  assert.match(shellWorkbenchModelSource, /export type ShellSession = \{[\s\S]*schema: ShellSessionSchema/)
  assert.match(shellWorkbenchModelSource, /export type ShellJob =/)
  assert.match(shellWorkbenchModelSource, /export type ShellJob = \{[\s\S]*schema: ShellJobSchema/)
  assert.match(shellWorkbenchModelSource, /jobId\?: string/)
  assert.match(shellWorkbenchModelSource, /ownerFeature\?: string/)
  assert.match(shellWorkbenchModelSource, /workspaceKey\?: string/)
  assert.match(shellWorkbenchModelSource, /export type ShellJobReveal = 'always' \| 'on_error' \| 'silent'/)
  assert.match(shellWorkbenchModelSource, /export function shellJobIdForSessionId\(sessionId: string\): string/)
  assert.match(shellWorkbenchModelSource, /desktop-shell-host-job:\$\{sessionId\}/)
  assert.match(shellWorkbenchModelSource, /owner === 'system' && \(command \|\| initialCommand\) \? shellJobIdForSessionId\(id\) : undefined/)
  assert.match(shellWorkbenchModelSource, /schema: 'movscript\.shell_session\.v1'/)
  assert.match(shellWorkbenchModelSource, /export type ShellIntent =/)
  assert.match(shellWorkbenchModelSource, /export type ShellIntent = \{[\s\S]*schema: ShellIntentSchema[\s\S]*intentId: string[\s\S]*command: string\[\][\s\S]*commandText: string[\s\S]*ownerFeature: string[\s\S]*destructive: boolean/)
  assert.match(shellWorkbenchModelSource, /export type ShellWorkbenchViewModel = \{[\s\S]*mode: ShellWorkbenchMode[\s\S]*items: ShellWorkbenchItem\[\][\s\S]*activeJob\?: ShellJob[\s\S]*activeIntent\?: ShellIntent/)
  assert.doesNotMatch(shellWorkbenchModelSource, /TerminalStatus/)
  assert.match(shellWorkbenchControllerSource, /features\/shell\/application\/desktopShellHostElectron/)
  assert.match(shellWorkbenchControllerSource, /export function runShellWorkbenchCommand/)
  assert.match(shellWorkbenchControllerSource, /const session = createShellWorkbenchSession\(\{[\s\S]*initialCommand: input\.initialCommand \?\? input\.command[\s\S]*\}\)[\s\S]*void startShellWorkbenchHostCommand\(session\)[\s\S]*return session/)
  assert.match(shellWorkbenchControllerSource, /const session = reuseShellWorkbenchSession\(reusable,[\s\S]*void startShellWorkbenchHostCommand\(session\)[\s\S]*return session/)
  assert.match(shellWorkbenchControllerSource, /findReusableShellWorkbenchSession/)
  assert.match(shellWorkbenchControllerSource, /reuseShellWorkbenchSession/)
  assert.match(shellWorkbenchControllerSource, /workspaceContext\.scope === 'project' \? '项目工作目录' : '工作区工作目录'/)
  assert.doesNotMatch(shellWorkbenchControllerSource, /'project cwd'|'workspace cwd'/)
  assert.match(shellWorkbenchControllerSource, /function shellWorkbenchInputShouldReveal\(input: ShellWorkbenchSessionInput\): boolean/)
  assert.match(shellWorkbenchControllerSource, /if \(input\.reveal !== undefined\) return input\.reveal/)
  assert.match(shellWorkbenchControllerSource, /return input\.jobReveal === 'always'/)
  assert.match(shellWorkbenchControllerSource, /const activeShellId = shellWorkbenchActiveShellIdAfterSystemSession\(current, next, reveal\)/)
  assert.match(shellWorkbenchControllerSource, /function shellWorkbenchActiveShellIdAfterSystemSession\([\s\S]*if \(!current\.activeShellId\) return session\.id[\s\S]*if \(session\.owner !== 'system'\) return current\.activeShellId[\s\S]*shellSessionIsPristineIdleWindowShell\(activeSession\) \? session\.id : current\.activeShellId/)
  assert.match(shellWorkbenchControllerSource, /function shellSessionIsPristineIdleWindowShell\(session: ShellSession \| undefined\): boolean/)
  assert.match(shellWorkbenchControllerSource, /session\.owner === 'user'[\s\S]*session\.scope === 'window'[\s\S]*session\.status === 'idle'[\s\S]*!session\.command[\s\S]*!session\.initialCommand/)
  assert.match(shellWorkbenchControllerSource, /const promotedSystemSession = sessions\.find\(\(session\) => \([\s\S]*session\.owner === 'system' && \(session\.status === 'running' \|\| session\.status === 'starting'\)/)
  assert.doesNotMatch(shellWorkbenchControllerSource, /activeShellId: nextSession\.id/)
  assert.match(shellWorkbenchControllerSource, /const sessions = current\.sessions\.filter\(\(session\) => session\.scope !== 'window'\)/)
  assert.match(shellWorkbenchControllerSource, /fallback\?\.id \?\? ''/)
  assert.match(shellWorkbenchControllerSource, /let shellWorkbenchPendingRevealSessionId: string \| undefined/)
  assert.match(shellWorkbenchControllerSource, /export function selectShellWorkbenchSession\(sessionId\?: string\): void/)
  assert.match(shellWorkbenchControllerSource, /shellWorkbenchPendingRevealSessionId = sessionId/)
  assert.match(shellWorkbenchControllerSource, /const pendingRevealSessionId = shellWorkbenchPendingRevealSessionId/)
  assert.match(shellWorkbenchControllerSource, /pendingRevealSession[\s\S]*\? pendingRevealSession\.id/)
  assert.match(shellWorkbenchControllerSource, /function revealShellWorkbenchSessionOnError\(sessionId: string\): void/)
  assert.match(shellWorkbenchControllerSource, /if \(session\?\.jobReveal === 'on_error'\) revealShellWorkbenchSession\(sessionId\)/)
  assert.match(shellWorkbenchControllerSource, /function updateShellWorkbenchSessionStatus\(id: string, status: ShellStatus/)
  assert.match(shellWorkbenchControllerSource, /if \(status === 'failed'\) revealShellWorkbenchSessionOnError\(id\)/)
  assert.match(shellWorkbenchControllerSource, /const shellWorkbenchHostStartPromises = new Map<string, Promise<void>>\(\)/)
  assert.match(shellWorkbenchControllerSource, /async function startShellWorkbenchHostCommand\(session: ShellSession\): Promise<void>/)
  assert.match(shellWorkbenchControllerSource, /const pendingStart = shellWorkbenchHostStartPromises\.get\(session\.id\)/)
  assert.match(shellWorkbenchControllerSource, /if \(pendingStart\) return pendingStart/)
  assert.doesNotMatch(shellWorkbenchControllerSource, /await pendingStart/)
  assert.match(shellWorkbenchControllerSource, /const pendingStart = shellWorkbenchHostStartPromises\.get\(id\)[\s\S]*void pendingStart[\s\S]*runtimeFor\(id\)\.terminal\?\.focus\(\)[\s\S]*return/)
  assert.match(shellWorkbenchControllerSource, /shellWorkbenchHostStartPromises\.set\(session\.id, startPromise\)/)
  assert.match(shellWorkbenchControllerSource, /shellWorkbenchHostStartPromises\.delete\(session\.id\)/)
  assert.match(shellWorkbenchControllerSource, /async function startShellWorkbenchHostCommandOnce\(/)
  const retiredShellStartupText = ['正在启动宿主', ' Shell'].join('')
  assert.match(shellWorkbenchControllerSource, /正在启动 Shell/)
  assert.doesNotMatch(shellWorkbenchControllerSource, new RegExp(escapeRegExp(retiredShellStartupText)))
  assert.match(shellWorkbenchControllerSource, /await runDesktopShellHostCommand\(\{[\s\S]*sessionId: session\.id[\s\S]*workspaceKey[\s\S]*reveal: session\.jobReveal[\s\S]*command: initialCommand/)
  assert.match(shellWorkbenchControllerSource, /Shell 已退出，退出码/)
  assert.match(shellWorkbenchControllerSource, /input\.owner !== 'system' \|\| input\.scope === 'window'/)
  assert.match(shellWorkbenchControllerSource, /const workspaceKey = input\.workspaceKey \?\? shellWorkbenchWorkspaceKey\(\{ \.\.\.input, scope \}\)/)
  assert.match(shellWorkbenchControllerSource, /const hasStableWorkspaceKey = input\.scope === 'home' \|\| Boolean\(input\.workspaceKey \|\| input\.projectUid \|\| input\.projectId \|\| input\.projectDir \|\| input\.cwd\)/)
  assert.match(shellWorkbenchControllerSource, /shellSessionCommandMatches\(session, input\.command\)/)
  assert.match(shellWorkbenchControllerSource, /function shellSessionCommandMatches\(session: ShellSession, command: string\): boolean/)
  assert.match(shellWorkbenchControllerSource, /function shellWorkbenchWorkspaceKey\(input: Pick<ShellWorkbenchSessionInput/)
  assert.match(shellWorkbenchControllerSource, /function windowShellInputFromWorkspaceContext\(workspaceContext: MovScriptWorkspaceContext\)/)
  assert.match(shellWorkbenchControllerSource, /const next = createShellSessionFromInput\(nextShellIndex, windowShellInputFromWorkspaceContext\(workspaceContext\)\)/)
  assert.match(shellWorkbenchControllerSource, /function splitShellInputFromSession\([\s\S]*session: ShellSession \| undefined,[\s\S]*workspaceContext: MovScriptWorkspaceContext/)
  assert.match(shellWorkbenchControllerSource, /const splitShell = useCallback\(\(\) => \{[\s\S]*const sourceSession = current\.sessions\.find\(\(session\) => session\.id === current\.activeShellId\)[\s\S]*splitShellInputFromSession\(sourceSession, workspaceContext\)/)
  assert.match(shellWorkbenchControllerSource, /splitShell,[\s\S]*startShell,/)
  assert.match(shellWorkbenchControllerSource, /schema: 'movscript\.shell_workspace_key\.v1'/)
  assert.match(shellWorkbenchControllerSource, /if \(input\.scope === 'home'\) return session\.scope === 'home'/)
  assert.match(shellWorkbenchControllerSource, /const inputWorkspaceKey = input\.workspaceKey \?\? shellWorkbenchWorkspaceKey\(input\)/)
  assert.match(shellWorkbenchControllerSource, /const sessionWorkspaceKey = session\.workspaceKey \?\? shellWorkbenchWorkspaceKey\(session\)/)
  assert.match(shellWorkbenchControllerSource, /if \(inputWorkspaceKey && sessionWorkspaceKey\) return inputWorkspaceKey === sessionWorkspaceKey/)
  assert.match(shellWorkbenchControllerSource, /function shellWorkspacePathMatches\(candidate: unknown, workspaceRoot: unknown\): boolean/)
  assert.match(shellWorkbenchControllerSource, /candidatePath === rootPath[\s\S]*candidatePath\.startsWith\(`\$\{rootPath\}\/`\)/)
  assert.match(shellWorkbenchControllerSource, /shellWorkspacePathMatches\(session\.projectDir, input\.projectDir\)[\s\S]*shellWorkspacePathMatches\(session\.cwd, input\.projectDir\)/)
  assert.match(shellWorkbenchControllerSource, /shellWorkspacePathMatches\(session\.projectDir, projectDir\)[\s\S]*shellWorkspacePathMatches\(session\.cwd, projectDir\)/)
  assert.match(shellWorkbenchControllerSource, /shellWorkspacePathMatches\(job\.projectDir, projectDir\)[\s\S]*shellWorkspacePathMatches\(job\.cwd, projectDir\)/)
  assert.match(shellWorkbenchControllerSource, /shellSessionWorkspaceMatches\(session, input\)/)
  assert.match(shellWorkbenchControllerSource, /const sessionWorkspaceContext = shellHostWorkspaceContext\(session, workspaceContext\)/)
  assert.match(shellWorkbenchControllerSource, /if \(explicitWorkspaceContext\) return shellWorkspaceContextWithHostOwner\(explicitWorkspaceContext, workspaceContext\)/)
  assert.match(shellWorkbenchControllerSource, /function shellWorkspaceContextWithHostOwner\([\s\S]*shellWorkspaceContextHostOwner\(workspaceContext\)/)
  assert.match(shellWorkbenchControllerSource, /function shellWorkspaceContextHostOwner\([\s\S]*const orgId = normalizedWorkspaceString\(extra\.orgId\)[\s\S]*const userId = normalizedWorkspaceString\(extra\.userId\)/)
  assert.match(shellWorkbenchControllerSource, /\.\.\.\(sessionScope === 'home' \|\| !sessionWorkspaceContext \? \{\} : \{ workspaceContext: sessionWorkspaceContext \}\)/)
  assert.match(shellWorkbenchControllerSource, /\.\.\.\(projectContext\.projectDir \? \{ projectDir: projectContext\.projectDir \} : \{\}\)/)
  assert.match(shellWorkbenchControllerSource, /export async function hydrateShellWorkbenchSessionsFromHost/)
  assert.match(shellWorkbenchControllerSource, /Promise\.all\(shellHostListInputsForWorkspace\(\)\.map\(\(input\) => listDesktopShellHostSessions\(input\)\)\)/)
  assert.match(shellWorkbenchControllerSource, /Promise\.all\(shellHostListInputsForWorkspace\(\)\.map\(\(input\) => listDesktopShellHostJobs\(input\)\)\)/)
  assert.match(shellWorkbenchControllerSource, /function shellHostListInputsForWorkspace\(\): DesktopShellHostListInput\[\]/)
  assert.match(shellWorkbenchControllerSource, /scope: 'workspace'[\s\S]*scope: 'home'/)
  assert.match(shellWorkbenchControllerSource, /uniqueShellHostSessions\(results\.flatMap/)
  assert.match(shellWorkbenchControllerSource, /uniqueShellHostJobs\(results\.flatMap/)
  assert.match(shellWorkbenchControllerSource, /if \(session\.scope === 'home'\) return true/)
  assert.match(shellWorkbenchControllerSource, /if \(job\.scope === 'home'\) return true/)
  assert.match(shellWorkbenchControllerSource, /const hostJobsBySessionId = new Map\(hostJobs\.map\(\(job\) => \[job\.sessionId, job\]\)\)/)
  assert.match(shellWorkbenchControllerSource, /shellHostSessionMatchesWorkspace\(session, workspaceContext\)/)
  assert.match(shellWorkbenchControllerSource, /shellHostJobMatchesWorkspace\(job, workspaceContext\)/)
  assert.match(shellWorkbenchControllerSource, /hydrateShellWorkbenchRuntimeFromHost\(session, logs, job\)/)
  assert.match(shellWorkbenchControllerSource, /runtime\.terminalSessionId = session\.status === 'running' \? session\.sessionId : null/)
  assert.match(shellWorkbenchControllerSource, /previewUrl: session\.previewUrl \?\? job\?\.previewUrl/)
  assert.match(shellWorkbenchControllerSource, /workspaceKey: session\.workspaceKey/)
  assert.match(shellWorkbenchControllerSource, /ownerFeature: session\?\.ownerFeature/)
  assert.match(shellWorkbenchControllerSource, /reveal: session\?\.jobReveal/)
  assert.match(shellWorkbenchControllerSource, /previewUrl: session\?\.previewUrl/)
  assert.match(shellWorkbenchControllerSource, /job\?\.status === 'failed'/)
  assert.match(shellWorkbenchControllerSource, /const windowSessionIds = new Set\(sessions\.filter\(\(session\) => session\.scope === 'window'\)/)
  assert.match(shellWorkbenchControllerSource, /export function revealShellWorkbenchSession/)
  assert.match(shellWorkbenchControllerSource, /export const SHELL_WORKBENCH_REVEAL_EVENT = 'movscript:shell-workbench-reveal'/)
  assert.match(shellWorkbenchControllerSource, /window\.dispatchEvent\(new CustomEvent\(SHELL_WORKBENCH_REVEAL_EVENT, \{ detail: \{ sessionId \} \}\)\)/)
  assert.match(shellWorkbenchControllerSource, /const workspaceKey = session\?\.workspaceKey \?\? shellWorkbenchWorkspaceKey\(session \?\? \{\}\)/)
  assert.match(shellWorkbenchControllerSource, /runDesktopShellHostCommand\(\{[\s\S]*command: initialCommand/)
  assert.match(shellWorkbenchControllerSource, /createDesktopShellHostSession\(shellHostInput\)/)
  assert.match(desktopShellGatewaySource, /function normalizeShellGatewayReveal\(reveal: boolean \| 'always' \| 'on_error' \| 'silent' \| undefined\): 'always' \| 'on_error' \| 'silent'/)
  assert.match(desktopShellGatewaySource, /if \(reveal === false\) return 'silent'/)
  assert.match(desktopShellGatewaySource, /if \(reveal === 'on_error' \|\| reveal === 'silent'\) return reveal/)
  assert.match(desktopShellGatewaySource, /const reveal = normalizeShellGatewayReveal\(runInput\.reveal\)/)
  assert.match(desktopShellGatewaySource, /jobReveal: reveal/)
  assert.match(desktopShellGatewaySource, /reveal: reveal === 'always'/)
  assert.match(desktopShellGatewaySource, /function shellProjectContextForScope/)
  assert.match(desktopShellGatewaySource, /if \(scope === 'home'\) return \{\}/)
  assert.match(desktopShellGatewaySource, /cwd: createInput\.scope === 'home' \? createInput\.cwd : createInput\.cwd \?\? input\.projectDir/)
  assert.match(desktopShellGatewaySource, /cwd: scope === 'home' \? runInput\.cwd : runInput\.cwd \?\? input\.projectDir/)
  assert.match(desktopShellGatewaySource, /if \(input\.projectId && session\.projectId !== input\.projectId\) return false/)
  assert.doesNotMatch(desktopShellGatewaySource, /session\.projectId \?\? fallback\.projectId/)
  assert.match(desktopShellGatewaySource, /ProjectSurfaceShellJob,\n/)
  assert.match(desktopShellGatewaySource, /async listJobs\(listInput = \{\}\)/)
  assert.match(desktopShellGatewaySource, /async getJob\(jobInput\)/)
  assert.match(desktopShellGatewaySource, /async jobLogs\(jobInput\)/)
  assert.match(desktopShellGatewaySource, /function projectSurfaceShellJobFromShellWorkbench\(session: ShellSession\): ProjectSurfaceShellJob \| undefined/)
  assert.match(desktopShellGatewaySource, /schema: 'movscript\.shell_job\.v1'/)
  assert.match(desktopShellGatewaySource, /command: shellCommandTextFallbackArray\(commandText\)/)
  assert.match(desktopShellGatewaySource, /command_text: commandText/)
  assert.match(desktopShellGatewaySource, /function projectSurfaceShellJobStatusFromShellSession\(session: ShellSession\): ProjectSurfaceShellJob\['status'\]/)
  assert.match(desktopShellGatewaySource, /schema: session\.schema/)
  assert.match(projectSurfaceRuntimeSource, /export type ProjectSurfaceShellSessionSchema = 'movscript\.shell_session\.v1'/)
  assert.match(projectSurfaceRuntimeSource, /export type ProjectSurfaceShellJobSchema = 'movscript\.shell_job\.v1'/)
  assert.match(projectSurfaceRuntimeSource, /export type ProjectSurfaceShellJobStatus = 'queued' \| 'running' \| 'succeeded' \| 'failed' \| 'stopped'/)
  assert.match(projectSurfaceRuntimeSource, /export interface ProjectSurfaceShellSession \{[\s\S]*schema: ProjectSurfaceShellSessionSchema/)
  assert.match(projectSurfaceRuntimeSource, /export interface ProjectSurfaceShellJob \{[\s\S]*schema: ProjectSurfaceShellJobSchema[\s\S]*jobId: string[\s\S]*sessionId: string[\s\S]*command: string\[\][\s\S]*commandText: string[\s\S]*reveal: 'always' \| 'on_error' \| 'silent'/)
  assert.match(projectSurfaceRuntimeSource, /listJobs\(input\?: ProjectSurfaceShellJobListInput\): Promise<\{ jobs: ProjectSurfaceShellJob\[\] \}>/)
  assert.match(projectSurfaceRuntimeSource, /getJob\(input: ProjectSurfaceShellJobInput\): Promise<ProjectSurfaceShellJob \| undefined>/)
  assert.match(projectSurfaceRuntimeSource, /jobLogs\(input: ProjectSurfaceShellJobInput\): Promise<ProjectSurfaceShellJobLogsResult>/)
  assert.match(projectSurfaceRuntimeIndexSource, /ProjectSurfaceShellJobSchema/)
  assert.match(projectSurfaceRuntimeIndexSource, /ProjectSurfaceShellJobLogsResult/)
  assert.match(projectSurfaceRuntimeIndexSource, /ProjectSurfaceShellSessionSchema/)
  assert.match(desktopShellHostElectronSource, /export async function runDesktopShellHostCommand/)
  assert.match(desktopShellHostElectronSource, /export async function listDesktopShellHostSessions/)
  assert.match(desktopShellHostElectronSource, /export async function getDesktopShellHostSession/)
  assert.match(desktopShellHostElectronSource, /export async function getDesktopShellHostLogs/)
  assert.match(desktopShellHostElectronSource, /export async function listDesktopShellHostJobs/)
  assert.match(desktopShellHostElectronSource, /export async function getDesktopShellHostJob/)
  assert.match(desktopShellHostElectronSource, /export async function getDesktopShellHostJobLogs/)
  assert.match(desktopShellHostElectronSource, /electronApiDesktopShellHost/)
  assert.doesNotMatch(desktopShellHostElectronSource, legacyShellHostAliasPattern)
  assert.match(desktopShellHostContractSource, /export type ElectronDesktopShellHostCreateInput = \{[\s\S]*workspaceContext\?: ElectronMovScriptWorkspaceContext[\s\S]*owner\?: ElectronDesktopShellHostOwner[\s\S]*scope\?: ElectronDesktopShellHostScope/)
  assert.match(desktopShellHostContractSource, /export type ElectronDesktopShellHostSessionSchema = 'movscript\.shell_session\.v1'/)
  assert.match(desktopShellHostContractSource, /export type ElectronDesktopShellHostJobSchema = 'movscript\.shell_job\.v1'/)
  assert.match(desktopShellHostContractSource, /export type ElectronDesktopShellHostSession = \{[\s\S]*schema: ElectronDesktopShellHostSessionSchema/)
  assert.match(desktopShellHostContractSource, /export type ElectronDesktopShellHostJob = \{[\s\S]*schema: ElectronDesktopShellHostJobSchema/)
  assert.match(desktopShellHostContractSource, /export type ElectronDesktopShellHostEvent =[\s\S]*kind: 'output'[\s\S]*kind: 'exit'[\s\S]*kind: 'error'/)
  assert.doesNotMatch(desktopShellHostContractSource, legacyShellHostContractPattern)
  assert.match(electronApiSource, /createDesktopShellHostSession\?: \(input: ElectronDesktopShellHostCreateInput\) => Promise<ElectronDesktopShellHostCreateResult>/)
  assert.match(electronApiSource, /runDesktopShellHostCommand\?: \(input: ElectronDesktopShellHostRunInput\) => Promise<ElectronDesktopShellHostCreateResult>/)
  assert.match(electronApiSource, /onDesktopShellHostEvent\?: \(handler: \(event: ElectronDesktopShellHostEvent\) => void\) => \(\) => void/)
  assert.doesNotMatch(electronApiSource, legacyShellHostAliasPattern)
  assert.doesNotMatch(electronApiSource, legacyShellHostContractPattern)
  assert.match(desktopShellHostIpcSource, /terminal:runCommand/)
  assert.match(desktopShellHostIpcSource, /terminal:listSessions/)
  assert.match(desktopShellHostIpcSource, /terminal:getSession/)
  assert.match(desktopShellHostIpcSource, /terminal:getLogs/)
  assert.match(desktopShellHostIpcSource, /terminal:listJobs/)
  assert.match(desktopShellHostIpcSource, /terminal:getJob/)
  assert.match(desktopShellHostIpcSource, /terminal:getJobLogs/)
  assert.match(desktopShellHostIpcSource, /if \(input\.scope === 'home'\) return input/)
  assert.match(desktopShellHostIpcSource, /const result = desktopShellHostManager\.listSessions\(desktopShellHostListInputWithWindowContext\(event, input \?\? \{\}\)\)[\s\S]*sessions: result\.sessions\.filter\(\(session\) => desktopShellHostSessionIsVisibleToEvent\(event, session\.sessionId\)\)/)
  assert.match(desktopShellHostIpcSource, /const result = desktopShellHostManager\.listJobs\(desktopShellHostJobListInputWithWindowContext\(event, input \?\? \{\}\)\)[\s\S]*jobs: result\.jobs\.filter\(\(job\) => desktopShellHostSessionIsVisibleToEvent\(event, job\.sessionId\)\)/)
  assert.match(desktopShellHostIpcSource, /const scopedInput = desktopShellHostInputWithWindowContext\(event, input \?\? \{\}\)[\s\S]*assertRequestedDesktopShellHostSessionIsVisible\(event, scopedInput\)[\s\S]*desktopShellHostManager\.create\(scopedInput\)/)
  assert.match(desktopShellHostIpcSource, /const scopedInput = desktopShellHostInputWithWindowContext\(event, input\)[\s\S]*assertRequestedDesktopShellHostSessionIsVisible\(event, scopedInput\)[\s\S]*desktopShellHostManager\.runCommand\(scopedInput\)/)
  assert.match(desktopShellHostIpcSource, /if \(scope === 'window'\) \{[\s\S]*workspaceKey: input\.workspaceKey \?\? desktopShellHostWorkspaceKey\(projectPatch\)[\s\S]*\.\.\.projectPatch/)
  assert.match(desktopShellHostIpcSource, /if \(!desktopShellHostSessionIsVisibleToEvent\(event, input\.sessionId\)\) return undefined[\s\S]*desktopShellHostManager\.getSession\(input\)/)
  assert.match(desktopShellHostIpcSource, /if \(!desktopShellHostSessionIsVisibleToEvent\(event, input\.sessionId\)\) \{[\s\S]*text: '',[\s\S]*desktopShellHostManager\.getLogs\(input\)/)
  assert.match(desktopShellHostIpcSource, /return desktopShellHostJobVisibleToEvent\(event, input\)/)
  assert.match(desktopShellHostIpcSource, /const job = desktopShellHostJobVisibleToEvent\(event, input\)[\s\S]*if \(!job\) \{[\s\S]*text: '',[\s\S]*desktopShellHostManager\.getJobLogs\(input\)/)
  assert.match(desktopShellHostIpcSource, /if \(!desktopShellHostSessionIsVisibleToEvent\(event, input\.sessionId\)\) return undefined[\s\S]*desktopShellHostManager\.write\(input\)/)
  assert.match(desktopShellHostIpcSource, /if \(!desktopShellHostSessionIsVisibleToEvent\(event, input\.sessionId\)\) return undefined[\s\S]*desktopShellHostManager\.resize\(input\)/)
  assert.match(desktopShellHostIpcSource, /if \(!desktopShellHostSessionIsVisibleToEvent\(event, input\.sessionId\)\) return undefined[\s\S]*desktopShellHostManager\.kill\(input\)/)
  assert.match(desktopShellHostIpcSource, /\.\.\.pickDefined\(\{ windowId: patch\.windowId \}\)/)
  assert.match(desktopShellHostIpcSource, /function desktopShellHostListInputWithWindowContext\([\s\S]*if \(input\.scope !== 'window'\) return input[\s\S]*pickDefined\(\{ windowId: patch\.windowId \}\)/)
  assert.match(desktopShellHostIpcSource, /function desktopShellHostJobListInputWithWindowContext\([\s\S]*if \(input\.scope !== 'window'\) return input[\s\S]*pickDefined\(\{ windowId: patch\.windowId \}\)/)
  assert.doesNotMatch(desktopShellHostIpcSource, /input\.scope === 'workspace' \? pickDefined/)
  assert.match(desktopShellHostIpcSource, /function assertRequestedDesktopShellHostSessionIsVisible\([\s\S]*desktopShellHostManager\.getSession\(\{ sessionId \}\)[\s\S]*throw new Error\('shell session is not visible to this window'\)/)
  assert.match(desktopShellHostIpcSource, /function desktopShellHostSessionIsVisibleToEvent\(event: IpcMainInvokeEvent, sessionId: string\): boolean[\s\S]*windowCanReceiveDesktopShellHostEvent\(win, normalizedSessionId\)/)
  assert.match(desktopShellHostIpcSource, /function desktopShellHostJobVisibleToEvent\([\s\S]*desktopShellHostSessionIsVisibleToEvent\(event, job\.sessionId\) \? job : undefined/)
  assert.match(desktopShellHostIpcSource, /desktopShellHostInputWithWindowContext\(event, input/)
  assert.match(desktopShellHostIpcSource, /desktopShellHostJobListInputWithWindowContext\(event, input \?\? \{\}\)/)
  assert.match(desktopShellHostIpcSource, /contextForWindow\(win\)/)
  assert.match(desktopShellHostIpcSource, /windowCanReceiveDesktopShellHostEvent\(win, event\.sessionId\)/)
  assert.match(desktopShellHostIpcSource, /session\.scope === 'window'[\s\S]*session\.windowId === String\(win\.id\)/)
  assert.match(desktopShellHostIpcSource, /windowMatchesDesktopShellHostWorkspace\(win, session\)/)
  assert.match(desktopShellHostPreloadSource, /export function createDesktopShellHostAPI/)
  assert.match(desktopShellHostPreloadSource, /createDesktopShellHostSession: \(input\) => ipcRenderer\.invoke\('terminal:create', input\)/)
  assert.match(desktopShellHostPreloadSource, /runDesktopShellHostCommand: \(input\) => ipcRenderer\.invoke\('terminal:runCommand', input\)/)
  assert.match(desktopShellHostPreloadSource, /onDesktopShellHostEvent: terminalEvents\.subscribe/)
  assert.doesNotMatch(desktopShellHostPreloadSource, legacyShellHostAliasPattern)
  assert.match(desktopShellHostServiceSource, /async runCommand\(input: ElectronDesktopShellHostRunInput\)/)
  assert.match(desktopShellHostServiceSource, /findReusableDesktopShellHostCommandSession\(input\)/)
  assert.match(desktopShellHostServiceSource, /sessionsForReuse\(\): Iterable/)
  assert.match(desktopShellHostServiceSource, /desktopShellHostCommandMatches\(session, input\.command\)/)
  assert.match(desktopShellHostServiceSource, /function desktopShellHostCommandMatches\(session: DesktopShellHostSession, command: string\): boolean/)
  assert.match(desktopShellHostServiceSource, /desktopShellHostWorkspaceMatches\(session, input\)/)
  assert.match(desktopShellHostServiceSource, /if \(\(input\.scope \?\? 'workspace'\) === 'home'\) return session\.scope === 'home'/)
  assert.match(desktopShellHostServiceSource, /const workspaceKey = input\.workspaceKey\?\.trim\(\)/)
  assert.match(desktopShellHostServiceSource, /if \(workspaceKey && session\.workspaceKey\) return session\.workspaceKey === workspaceKey/)
  assert.match(desktopShellHostServiceSource, /session\.status === 'running'/)
  assert.match(desktopShellHostServiceSource, /Boolean\(session\.pty\)/)
  assert.match(desktopShellHostServiceSource, /listSessions\(input: ElectronDesktopShellHostListInput = \{\}\)/)
  assert.match(desktopShellHostServiceSource, /getLogs\(input: ElectronDesktopShellHostSessionInput\)/)
  assert.match(desktopShellHostServiceSource, /listJobs\(input: ElectronDesktopShellHostJobListInput = \{\}\)/)
  assert.match(desktopShellHostServiceSource, /getJob\(input: ElectronDesktopShellHostJobInput\)/)
  assert.match(desktopShellHostServiceSource, /getJobLogs\(input: ElectronDesktopShellHostJobInput\)/)
  assert.match(desktopShellHostServiceSource, /function desktopShellHostJobSnapshot\(session: DesktopShellHostSession\): ElectronDesktopShellHostJob \| undefined/)
  assert.match(desktopShellHostServiceSource, /function desktopShellHostSessionSnapshot\(session: DesktopShellHostSession\): ElectronDesktopShellHostSessionSnapshot \{[\s\S]*schema: 'movscript\.shell_session\.v1'/)
  assert.match(desktopShellHostServiceSource, /function desktopShellHostJobSnapshot\(session: DesktopShellHostSession\): ElectronDesktopShellHostJob \| undefined \{[\s\S]*schema: 'movscript\.shell_job\.v1'/)
  assert.match(desktopShellHostServiceSource, /function desktopShellHostJobStatus\(session: DesktopShellHostSession\): ElectronDesktopShellHostJobStatus/)
  assert.match(desktopShellHostServiceSource, /session\.ownerFeature \|\| 'shell'/)
  assert.match(desktopShellHostServiceSource, /previewUrl: input\.previewUrl\?\.trim\(\) \?\? ''/)
  assert.match(desktopShellHostServiceSource, /if \(input\.previewUrl\?\.trim\(\) && !reusable\.previewUrl\) reusable\.previewUrl = input\.previewUrl\.trim\(\)/)
  assert.match(desktopShellHostServiceSource, /session\.previewUrl \? \{ previewUrl: session\.previewUrl \} : \{\}/)
  assert.match(desktopShellHostServiceSource, /function desktopShellHostPathMatches\(candidate: unknown, workspaceRoot: unknown\): boolean/)
  assert.match(desktopShellHostServiceSource, /candidatePath === rootPath[\s\S]*candidatePath\.startsWith\(`\$\{rootPath\}\/`\)/)
  assert.match(desktopShellHostServiceSource, /!desktopShellHostPathMatches\(session\.projectDir, input\.projectDir\)[\s\S]*!desktopShellHostPathMatches\(session\.cwd, input\.projectDir\)/)
  assert.match(desktopShellHostServiceSource, /desktopShellHostPathMatches\(session\.cwd, cwd\)[\s\S]*desktopShellHostPathMatches\(session\.projectDir, cwd\)/)
  assert.match(desktopShellHostServiceSource, /function resolveDesktopShellHostWorkspace\(input: ElectronDesktopShellHostCreateInput\): MovScriptWorkspaceContextPaths/)
  assert.match(desktopShellHostServiceSource, /if \(!explicitCwd && !explicitProjectDir\) \{[\s\S]*resolveDesktopWorkspaceContextPaths\(\{ workspaceContext: input\.workspaceContext \}\)/)
  assert.match(desktopShellHostServiceSource, /return resolveExplicitDesktopShellHostWorkspace\(input, explicitCwd \|\| explicitProjectDir \|\| process\.cwd\(\)\)/)
  assert.match(desktopShellHostServiceSource, /function resolveExplicitDesktopShellHostWorkspace\([\s\S]*resolveDesktopDefaultMovScriptWorkspaceDir\(\)[\s\S]*providerSessionCwd: cwd/)
  assert.match(desktopShellHostServiceSource, /function desktopShellHostOwnerContext\([\s\S]*desktopShellHostIdValue\(context\?\.orgId\)[\s\S]*desktopShellHostIdValue\(context\?\.userId\)/)
  assert.match(desktopShellHostServiceSource, /session\.status = 'exited'[\s\S]*session\.exitCode = event\.exitCode[\s\S]*this\.emit\(\{[\s\S]*kind: 'exit'/)
  assert.doesNotMatch(desktopShellHostServiceSource, /this\.emit\(\{[\s\S]*kind: 'exit'[\s\S]*\}\)[\s\S]*this\.sessions\.delete\(sessionId\)/)
  assert.match(desktopShellHostServiceSource, /getLogs\(input: ElectronDesktopShellHostSessionInput\)[\s\S]*this\.sessions\.get\(sessionId\)\?\.outputBuffer/)
  assert.match(desktopShellHostServiceSource, /private removeSession\(session: DesktopShellHostSession\)/)
  assert.match(desktopShellHostServiceSource, /if \(existing\?\.status === 'running' && existing\.pty\)/)
  assert.match(desktopShellHostServiceSource, /stopWindowScopedSessions\(windowId: string\)/)
  assert.match(desktopShellHostServiceSource, /session\.scope !== 'window' \|\| session\.windowId !== normalizedWindowId/)
  assert.match(desktopShellHostServiceSource, /export const desktopShellHostManager = new DesktopShellHostManager\(\)/)
  assert.doesNotMatch(desktopShellHostServiceSource, legacyShellHostManagerPattern)
  assert.match(desktopShellHostEnvSource, /export function desktopShellHostEnv/)
  assert.match(desktopShellHostEnvSource, /normalizeDesktopShellHostPath\(env\[terminalPathKey\], platform\)/)
  assert.match(desktopShellHostEnvSource, /function normalizeDesktopShellHostPath\(currentPath: string \| undefined, platform: NodeJS\.Platform\): string/)
  assert.match(desktopShellHostEnvSource, /if \(platform === 'darwin'\) return '\/opt\/homebrew\/bin:\/usr\/local\/bin:\/usr\/bin:\/bin:\/usr\/sbin:\/sbin'/)
  assert.doesNotMatch(desktopShellHostEnvSource, legacyShellHostEnvPattern)
  assert.match(appWindowRegistrySource, /import \{ desktopShellHostManager \} from '\.\/desktopShellHost'/)
  assert.match(appWindowRegistrySource, /win\.once\('closed', \(\) => \{[\s\S]*desktopShellHostManager\.stopWindowScopedSessions\(String\(win\.id\)\)/)
  assert.match(desktopMainSource, /app\.on\('before-quit', \(event\) => \{[\s\S]*shutdownManagedServices\(\)/)
  assert.match(managedServicesShutdownSource, /import \{ desktopShellHostManager \} from '\.\.\/services\/desktopShellHost'/)
  assert.match(managedServicesShutdownSource, /desktopShellHostManager\.stopAll\(\)/)
  assert.doesNotMatch(shellWorkbenchControllerSource, new RegExp(`${legacyShellHostAliasLowerName}Electron`))
  assert.match(desktopProjectSurfaceRuntimeSource, /createDesktopShellGateway/)
  assert.match(desktopProjectSurfaceRuntimeSource, /type ProjectSurfaceRemotionStudioSession/)
  assert.match(desktopProjectSurfaceRuntimeSource, /type ProjectSurfaceRemotionStudioSessionLogs/)
  assert.match(desktopProjectSurfaceRuntimeSource, /shell: Boolean\(readElectronApi\(\)\?\.createDesktopShellHostSession\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /postDaemonGateway/)
  assert.match(desktopProjectSurfaceRuntimeModelSource, /Daemon gateway 请求失败，HTTP 状态码/)
  assert.match(desktopProjectSurfaceRuntimeSource, /const shellGateway = createDesktopShellGateway\(\{[\s\S]*projectId: contextProjectKey/)
  assert.match(desktopProjectSurfaceRuntimeSource, /executionOwner: 'external_shell'/)
  assert.match(desktopProjectSurfaceRuntimeSource, /const forceRestart = readBoolean\(input\.restart\) \|\| readBoolean\(input\.forceRestart\) \|\| readBoolean\(input\.force_restart\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /const openDesktopRemotionStudioSession = async \(input: Record<string, unknown> = \{\}\): Promise<ProjectSurfaceRemotionStudioSession>/)
  assert.match(desktopProjectSurfaceRuntimeSource, /const getDesktopRemotionStudioSession = async \(input: Record<string, unknown> = \{\}\): Promise<ProjectSurfaceRemotionStudioSession>/)
  assert.match(desktopProjectSurfaceRuntimeSource, /const logsDesktopRemotionStudioSession = async \(input: Record<string, unknown> = \{\}\): Promise<ProjectSurfaceRemotionStudioSessionLogs>/)
  assert.match(desktopProjectSurfaceRuntimeSource, /const stopDesktopRemotionStudioSession = async \(input: Record<string, unknown> = \{\}\): Promise<ProjectSurfaceRemotionStudioSession>/)
  assert.match(desktopProjectSurfaceRuntimeSource, /desktopRemotionStudioShellWorkspaceKey/)
  assert.match(desktopProjectSurfaceRuntimeSource, /function desktopRemotionStudioShellBindingKeys\(sessionId\?: string, workspaceKey\?: string\): string\[\]/)
  assert.match(desktopProjectSurfaceRuntimeSource, /function firstDesktopRemotionStudioShellMapValue<T>\(map: Map<string, T>, keys: string\[\]\): T \| undefined/)
  assert.match(desktopProjectSurfaceRuntimeSource, /function setDesktopRemotionStudioShellMapValue<T>\(map: Map<string, T>, keys: string\[\], value: T\): void/)
  assert.match(desktopProjectSurfaceRuntimeSource, /function deleteDesktopRemotionStudioShellBinding\(binding: DesktopRemotionStudioShellBinding\): void/)
  assert.match(desktopProjectSurfaceRuntimeSource, /const workspaceShellKey = desktopRemotionStudioShellWorkspaceKey\(\{[\s\S]*projectKey: contextProjectKey,[\s\S]*projectDirectory,[\s\S]*commandText/)
  assert.match(desktopProjectSurfaceRuntimeSource, /const shellBindingKeys = desktopRemotionStudioShellBindingKeys\(sessionId, workspaceShellKey\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /if \(forceRestart && existingShellBinding\) \{[\s\S]*await shellGateway\.stop\(\{ sessionId: existingShellBinding\.shellSessionId \}\)[\s\S]*deleteDesktopRemotionStudioShellBinding\(existingShellBinding\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /const reusableShellBinding = !forceRestart[\s\S]*firstDesktopRemotionStudioShellMapValue\(desktopRemotionStudioShellSessions, shellBindingKeys\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /shellGateway\.run\(\{[\s\S]*title: 'Remotion Studio'[\s\S]*scope: 'workspace'/)
  assert.match(desktopProjectSurfaceRuntimeSource, /shellGateway\.run\(\{[\s\S]*title: 'Remotion Studio'[\s\S]*reveal: 'silent'/)
  assert.match(desktopProjectSurfaceRuntimeSource, /ownerFeature: 'remotion_studio'/)
  assert.match(desktopProjectSurfaceRuntimeSource, /from '\.\/desktopProjectSurfaceRuntimeModel'/)
  assert.match(desktopProjectSurfaceRuntimeSource, /export \{[\s\S]*desktopProjectSurfaceHref,[\s\S]*desktopProjectSurfacePath,[\s\S]*desktopRemotionStudioSessionWithShell,[\s\S]*\}/)
  assert.match(desktopProjectSurfaceRuntimeSource, /export type \{ DesktopRemotionStudioShellBinding \}/)
  assert.match(desktopProjectSurfaceRuntimeModelSource, /export type DesktopRemotionStudioShellBinding = \{[\s\S]*shellSessionId: string[\s\S]*shellJobId\?: string/)
  assert.match(desktopProjectSurfaceRuntimeSource, /const desktopRemotionStudioShellStartPromises = new Map<string, Promise<DesktopRemotionStudioShellBinding>>\(\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /const pendingShellBinding = !forceRestart[\s\S]*firstDesktopRemotionStudioShellMapValue\(desktopRemotionStudioShellStartPromises, shellBindingKeys\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /if \(pendingShellBinding\) \{[\s\S]*const shellBinding = await pendingShellBinding[\s\S]*await shellGateway\.get\(\{ sessionId: shellBinding\.shellSessionId \}\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /setDesktopRemotionStudioShellMapValue\(desktopRemotionStudioShellStartPromises, shellBindingKeys, shellBindingPromise\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /finally\(\(\) => deleteDesktopRemotionStudioShellMapKeys\(desktopRemotionStudioShellStartPromises, shellBindingKeys\)\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /desktopRemotionStudioShellBinding\(shellSession\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /setDesktopRemotionStudioShellMapValue\(desktopRemotionStudioShellSessions, shellBindingKeys, shellBinding\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /await shellGateway\.get\(\{ sessionId: reusableShellBinding\.shellSessionId \}\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /await shellGateway\.get\(\{ sessionId: shellBinding\.shellSessionId \}\)/)
  assert.doesNotMatch(desktopProjectSurfaceRuntimeSource, /REMOTION_STUDIO_PORT_RETRY_LIMIT/)
  assert.doesNotMatch(desktopProjectSurfaceRuntimeSource, /desktopRemotionStudioPortRetryCounts/)
  assert.doesNotMatch(desktopProjectSurfaceRuntimeSource, /retryCount < REMOTION_STUDIO_PORT_RETRY_LIMIT/)
  assert.doesNotMatch(desktopProjectSurfaceRuntimeSource, /remotionStudioRestartInputFromSession/)
  assert.match(desktopProjectSurfaceRuntimeSource, /if \(sessionId\) desktopRemotionStudioShellStartPromises\.delete\(sessionId\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /desktopRemotionStudioShellFinishedBeforeReady\(sessionResult, reusableShellSession\)[\s\S]*deleteDesktopRemotionStudioShellBinding\(reusableShellBinding\)/)
  assert.match(desktopProjectSurfaceRuntimeSource, /desktopRemotionStudioShellFinishedBeforeReady\(session, shellSession\)[\s\S]*deleteDesktopRemotionStudioShellBinding\(shellBinding\)[\s\S]*return projectSurfaceRemotionStudioSessionFromRecord\(session\)/)
  assert.match(desktopProjectSurfaceRuntimeModelSource, /export function desktopRemotionStudioShellFinishedBeforeReady\([\s\S]*shellStatus === 'exited' \|\| shellStatus === 'failed'/)
  assert.match(desktopProjectSurfaceRuntimeModelSource, /shellFinishedBeforeReady/)
  assert.match(desktopProjectSurfaceRuntimeModelSource, /status === 'needs_external_shell' \? \{ status: 'starting' \} : \{\}/)
  assert.match(desktopProjectSurfaceRuntimeModelSource, /Remotion Studio 的 Shell 任务在 Studio 就绪前失败。/)
  assert.match(desktopProjectSurfaceRuntimeModelSource, /shellStatus, shell_status: shellStatus/)
  assert.match(desktopProjectSurfaceRuntimeModelSource, /shellJobId: shellBinding\.shellJobId, shell_job_id: shellBinding\.shellJobId/)
  assert.match(desktopProjectSurfaceRuntimeSource, /shell: shellGateway/)
  assert.match(remotionStudioSurfaceSource, /shellGateway\.run\(\{[\s\S]*ownerFeature: 'remotion_studio'/)
  assert.match(localDaemonSource, /const forceRestart = booleanValue\(input\.restart\) \|\| booleanValue\(input\.forceRestart\) \|\| booleanValue\(input\.force_restart\)/)
  assert.match(localDaemonSource, /const restartTarget = forceRestart && requestedSessionId \? remotionStudioSessions\.get\(requestedSessionId\) : undefined/)
  assert.match(localDaemonSource, /const sessionId = existing\?\.sessionId \?\? \(forceRestart \? requestedSessionId : undefined\) \?\? \[/)
  assert.match(localDaemonSource, /session\.status !== 'checking'[\s\S]*session\.status !== 'starting'[\s\S]*session\.status !== 'needs_external_shell'/)
  assert.match(localDaemonSource, /正在重启 Remotion Studio 工作区。/)
  assert.match(localDaemonSource, /const refreshedSession = await refreshBlockedRemotionStudioSession\(session\)/)
  assert.match(localDaemonSource, /function refreshBlockedRemotionStudioSession\([\s\S]*REMOTION_DEPENDENCIES_MISSING[\s\S]*openRemotionStudioSession\(\{/)
  assert.match(localDaemonSource, /function remotionStudioSessionHasBlocker\(session: RemotionStudioSessionEntry, code: string\): boolean/)
  assert.match(projectAgentModePageSource, /function ProjectAgentModeFullscreen\(\{ userId \}: \{ userId: string \}\)/)
  assert.match(projectAgentModePageSource, /useRouteLayoutPaneController\(\{[\s\S]*routeLayout: PROJECT_AGENT_ROUTE_LAYOUT[\s\S]*paneId: APP_SHELL_AGENT_SIDEBAR_PANE_ID[\s\S]*clampSize: clampAgentModeSidebarWidth/)
  assert.match(projectAgentModePageSource, /useRouteLayoutPaneController\(\{[\s\S]*routeLayout: PROJECT_AGENT_ROUTE_LAYOUT[\s\S]*paneId: APP_SHELL_AGENT_CONTENT_PANE_ID[\s\S]*clampSize: clampAgentModeContentPanelWidth/)
  assert.match(projectAgentModePageSource, /<ProjectAgentModeSidebar[\s\S]*width=\{agentSidebarPane\.size\}[\s\S]*onWidthChange=\{agentSidebarPane\.setSize\}/)
  assert.match(projectAgentModePageSource, /<ProjectAgentContentPanel[\s\S]*manageOwnWidth[\s\S]*collapsed=\{agentContentPane\.collapsed\}[\s\S]*onCollapsedChange=\{\(collapsed\) => \{[\s\S]*agentContentPane\.collapse\(\)[\s\S]*agentContentPane\.show\(\)[\s\S]*width=\{agentContentPane\.size\}[\s\S]*onWidthChange=\{agentContentPane\.setSize\}/)
  assert.doesNotMatch(projectAgentModePageSource, /AGENT_MODE_SIDEBAR_COLLAPSED_WIDTH/)
  assert.doesNotMatch(projectAgentModePageSource, /sidebarToggleLabel/)
  assert.match(projectAgentModePageSource, /const sidebarWidth = clampAgentModeSidebarWidth\(width \?\? AGENT_MODE_SIDEBAR_DEFAULT_WIDTH\)/)
  assert.match(projectAgentContentPanelSource, /const panelWidth = clampAgentModeContentPanelWidth\(width \?\? AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH\)/)
  assert.doesNotMatch(projectAgentModePageSource, /AGENT_MODE_SIDEBAR_WIDTH_STORAGE_KEY/)
  assert.doesNotMatch(projectAgentModePageSource, /AGENT_MODE_CONTENT_PANEL_WIDTH_STORAGE_KEY/)
  assert.doesNotMatch(projectAgentModePageSource, /window\.localStorage\.getItem/)
  assert.doesNotMatch(projectAgentModePageSource, /window\.localStorage\.setItem\(AGENT_MODE/)
  assert.doesNotMatch(appShellSource, /const \[detailSidebarState/)
  assert.doesNotMatch(appShellSource, /const \[shellWorkbenchOpen/)
  assert.match(appShellSource, /onToggleShellWorkbench: shellWorkbenchOpen \? shellWorkbenchPane\.hide : shellWorkbenchPane\.show/)
  assert.doesNotMatch(appShellSource, /const \[agentModeContentPanelWidth/)
  assert.doesNotMatch(appShellSource, /agentModeSidebarCollapsed/)
  assert.doesNotMatch(appShellSource, /agentModeContentPanelCollapsed/)
  assert.doesNotMatch(appShellSource, /handleAgentModeContentPanelWidthChange/)
  assert.doesNotMatch(appShellSource, /APP_TERMINAL_OPEN_STORAGE_KEY/)
  assert.doesNotMatch(appShellSource, /toggleAgentModeSidebarCollapsed/)
  assert.doesNotMatch(appShellSource, /window\.localStorage\.getItem\(SIDEBAR_WIDTH_STORAGE_KEY\)/)
  assert.doesNotMatch(appShellSource, /window\.localStorage\.setItem\(SIDEBAR_WIDTH_STORAGE_KEY/)
})

test('shell workbench source keeps retired terminal concepts out', () => {
  const retiredTerms = [
    ['Agent ', 'Terminal'].join(''),
    ['Agent', 'Terminal'].join(''),
    ['useAgent', 'Terminal'].join(''),
    ['agent', '-terminal'].join(''),
  ]
  const retiredTermPattern = new RegExp(retiredTerms.map(escapeRegExp).join('|'))
  const sourceFiles = projectFilesUnder(resolve('../..'))
  const matches = sourceFiles.flatMap((file) => {
    if (!existsSync(file)) return []
    const source = readFileSync(file, 'utf8')
    if (!retiredTermPattern.test(source)) return []
    return [relative(resolve('../..'), file)]
  })

  assert.deepEqual(matches, [])
})

test('workbench overlap pane controller options are derived from route pane specs', () => {
  assert.ok(!routeLayoutSpecForPathname('/project/scripts/workbench').panes.some((pane) => pane.owner === 'workbench'))

  const toolPane = routeLayoutPaneById(
    routeLayoutSpecForPathname('/tools/image'),
    TOOL_WORKBENCH_RESOURCE_PANE_ID,
  )
  const toolOptions = routeLayoutOverlapPaneControllerOptionsForPane(toolPane, {
    resizeEdge: 'left',
    ariaLabel: '调整资源面板宽度',
  })
  assert.equal(toolOptions.storageKey, TOOL_WORKBENCH_RESOURCE_PANE_WIDTH_STORAGE_KEY)
  assert.equal(toolOptions.defaultSize, TOOL_WORKBENCH_RESOURCE_PANE_DEFAULT_WIDTH)
  assert.equal(toolOptions.minSize, TOOL_WORKBENCH_RESOURCE_PANE_MIN_WIDTH)
  assert.equal(toolOptions.collapseMode, 'after-min')
  assert.equal(toolOptions.expandMode, 'after-max')
})

test('workbench overlap pane group props visibility is normalized by the route layout adapter', () => {
  const groupProps = {
    'data-overlap-pane-collapsed': undefined,
    'data-overlap-pane-expanded': 'true',
    'data-overlap-pane-resized': 'true',
    style: { '--overlap-pane-size': '720px' },
  } as Parameters<typeof routeLayoutOverlapPaneGroupPropsForVisibility>[0]

  assert.equal(routeLayoutOverlapPaneGroupPropsForVisibility(groupProps, true), groupProps)
  assert.deepEqual(routeLayoutOverlapPaneGroupPropsForVisibility(groupProps, false), {
    ...groupProps,
    'data-overlap-pane-collapsed': 'true',
    'data-overlap-pane-expanded': undefined,
  })
})

test('workbench pages consume overlap pane sizing through the route layout adapter', () => {
  const scriptsSource = readFileSync(resolve('../../surface/project/src/features/scripts/components/ScriptsPage.tsx'), 'utf8')
  const toolDialogSource = readToolDialogWorkbenchSource()

  assert.ok(!routeLayoutSpecForPathname('/tools/audio').panes.some((pane) => pane.id === TOOL_WORKBENCH_RESOURCE_PANE_ID))
  assert.ok(!routeLayoutSpecForPathname('/tools/text').panes.some((pane) => pane.id === TOOL_WORKBENCH_RESOURCE_PANE_ID))
  assert.match(toolDialogSource, /useRouteLayoutOverlapPaneController\(\{[\s\S]*paneId: TOOL_WORKBENCH_RESOURCE_PANE_ID/)
  assert.match(toolDialogSource, /function ToolDialogReferenceWorkbench/)
  assert.doesNotMatch(scriptsSource, /useRouteLayoutOverlapPaneController/)
  assert.doesNotMatch(scriptsSource, /routeLayoutOverlapPaneGroupPropsForVisibility/)
  assert.doesNotMatch(toolDialogSource, /usePersistentOverlapPaneController/)
  assert.doesNotMatch(scriptsSource, /usePersistentOverlapPaneController/)
  assert.doesNotMatch(toolDialogSource, /movscript:tools:resource-pane-width/)
  assert.doesNotMatch(scriptsSource, /movscript\.scriptWorkbench\.detailPaneWidth/)
})

function readToolDialogWorkbenchSource(): string {
  return [
    readFileSync(resolve('src/features/tools/components/ToolDialog.tsx'), 'utf8'),
    readFileSync(resolve('src/features/tools/components/ToolDialogReferenceWorkbench.tsx'), 'utf8'),
  ].join('\n')
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}

function projectFilesUnder(root: string): string[] {
  const files: string[] = []
  const projectExtensions = new Set(['.css', '.cjs', '.js', '.json', '.md', '.mjs', '.ts', '.tsx', '.yaml', '.yml'])

  if (existsSync(root)) collectProjectFiles(root, files, projectExtensions)

  return files.sort()
}

function collectProjectFiles(directory: string, files: string[], projectExtensions: Set<string>): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignoredProjectDirectory(entry.name)) continue
    if (ignoredProjectFile(entry.name)) continue

    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      collectProjectFiles(path, files, projectExtensions)
      continue
    }

    const extension = entry.name.slice(entry.name.lastIndexOf('.'))
    if (projectExtensions.has(extension)) files.push(path)
  }
}

function ignoredProjectFile(name: string): boolean {
  return /^tsup\.config\.bundled_[\da-z]+\.mjs$/i.test(name)
}

function ignoredProjectDirectory(name: string): boolean {
  return [
    '.git',
    '.next',
    '.turbo',
    'build',
    'dist',
    'node_modules',
    'out',
    'playwright-report',
    'test-results',
    'vendor',
  ].includes(name)
}

test('agent workspace split pages use the shared split primitive', () => {
  const workspaceFilesSource = readFileSync(resolve('src/features/agent/components/MovScriptWorkspaceFilesPage.tsx'), 'utf8')
  const workspaceReviewSource = readFileSync(resolve('src/features/agent/components/MovScriptWorkspaceReviewPage.tsx'), 'utf8')
  const agentConnectionsSource = readFileSync(resolve('src/features/agent/components/AgentConnectionsPage.tsx'), 'utf8')
  const agentConsoleSource = readFileSync(resolve('src/features/agent/components/AgentConsolePage.tsx'), 'utf8')
  const agentConsoleSurfaceSource = agentConsoleSource
  const agentPageUiSource = readFileSync(resolve('src/features/agent/components/AgentPageUi.tsx'), 'utf8')
  const agentPageUiStyles = readFileSync(resolve('src/features/agent/components/AgentPageUi.css'), 'utf8')
  const agentPageWorkspaceUiSource = readFileSync(resolve('src/features/agent/components/AgentPageWorkspaceUi.tsx'), 'utf8')
  const agentPageWorkspaceUiStyles = readFileSync(resolve('src/features/agent/components/AgentPageWorkspaceUi.css'), 'utf8')
  const agentPageThreePaneUiSource = readFileSync(resolve('src/features/agent/components/AgentPageThreePaneUi.tsx'), 'utf8')
  const agentPageThreePaneUiStyles = readFileSync(resolve('src/features/agent/components/AgentPageThreePaneUi.css'), 'utf8')
  const agentConsoleStyles = readFileSync(resolve('src/features/agent/components/AgentConsoleUi.css'), 'utf8')

  for (const source of [workspaceFilesSource, workspaceReviewSource]) {
    assert.match(source, /AgentWorkspacesPageBody/)
    assert.doesNotMatch(source, /AgentPageShellBody/)
    assert.doesNotMatch(source, /grid min-h-0 flex-1 gap-4/)
    assert.doesNotMatch(source, /grid-cols-\[minmax/)
  }

  assert.match(workspaceFilesSource, /AgentWorkspacesPageSidebar/)
  assert.match(workspaceFilesSource, /AgentWorkspacesPageMain/)
  assert.match(workspaceFilesSource, /AgentWorkspacesPageList/)
  assert.match(workspaceFilesSource, /AgentWorkspacesPageSidebarControls/)
  assert.match(workspaceFilesSource, /AgentWorkspaceSidebarPathRow/)
  assert.match(workspaceFilesSource, /AgentWorkspaceListStack/)
  assert.match(workspaceFilesSource, /AgentWorkspaceListItemContent/)
  assert.match(workspaceFilesSource, /AgentWorkspaceEditorLayout/)
  assert.match(workspaceFilesSource, /AgentWorkspaceEditorTextarea/)
  assert.match(workspaceFilesSource, /AgentWorkspaceEditorTitleBlock/)
  assert.match(workspaceFilesSource, /AgentWorkspaceEditorSubtitle/)
  assert.match(workspaceFilesSource, /AgentWorkspaceListItemButton/)
  assert.match(workspaceFilesSource, /AgentWorkspaceStateRow/)
  assert.match(workspaceFilesSource, /AgentWorkspaceStateSpinner/)
  assert.doesNotMatch(workspaceFilesSource, /className="space-y-/)
  assert.doesNotMatch(workspaceFilesSource, /className="min-w-0/)
  assert.doesNotMatch(workspaceFilesSource, /className="truncate/)
  assert.doesNotMatch(workspaceFilesSource, /animate-spin/)
  assert.doesNotMatch(workspaceFilesSource, /className=\{`/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewSummaryPane/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewRawPane/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewTextarea/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewPaneTitle/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewJsonBlock/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewSection/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewEffectsList/)
  assert.match(workspaceReviewSource, /AgentWorkspaceReviewEmptyBlock/)
  assert.match(workspaceReviewSource, /AgentWorkspaceStateRow/)
  assert.match(workspaceReviewSource, /AgentWorkspaceStateSpinner/)
  assert.match(workspaceReviewSource, /AgentWorkspacesPageFullMain/)
  assert.doesNotMatch(workspaceReviewSource, /className="space-y-/)
  assert.doesNotMatch(workspaceReviewSource, /className="mb-2/)
  assert.doesNotMatch(workspaceReviewSource, /className="text-sm/)
  assert.doesNotMatch(workspaceReviewSource, /animate-spin/)
  assert.doesNotMatch(workspaceReviewSource, /className=\{`/)

  assert.match(agentPageThreePaneUiSource, /export function AgentThreePanePageBody/)
  assert.match(agentPageThreePaneUiSource, /export function AgentThreePanePagePane/)
  assert.match(agentPageThreePaneUiSource, /export function AgentThreePanePagePaneScroller/)
  assert.match(agentPageThreePaneUiSource, /export function AgentThreePanePageItemButton/)
  assert.match(agentPageThreePaneUiSource, /export function AgentThreePanePageListStack/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceEditorLayout/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceEditorTitleBlock/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceReviewSummaryPane/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceReviewPaneTitle/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceReviewJsonBlock/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceStateRow/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceStateSpinner/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceListStack/)
  assert.match(agentPageWorkspaceUiSource, /export function AgentWorkspaceReviewEffectsList/)
  assert.doesNotMatch(agentPageUiSource, /export function AgentThreePanePageBody/)
  assert.doesNotMatch(agentPageUiSource, /export function AgentWorkspaceEditorLayout/)
  assert.match(agentPageUiSource, /export function AgentPageShell/)
  assert.match(agentPageUiSource, /from '@movscript\/ui\/layout'/)
  assert.match(agentPageThreePaneUiStyles, /\.agent-three-pane-page-body \{[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 300px\), 1fr\)\);[\s\S]*overflow: auto;/)
  assert.match(agentPageThreePaneUiStyles, /\.agent-three-pane-page-body \{[\s\S]*grid-auto-rows: minmax\(360px, 1fr\);/)
  assert.doesNotMatch(agentPageThreePaneUiStyles, /grid-template-columns: minmax\(240px, 280px\) minmax\(260px, 0\.9fr\) minmax\(320px, 1\.1fr\);/)
  assert.match(agentPageThreePaneUiStyles, /\.agent-three-pane-page-item \{[\s\S]*display: block;[\s\S]*width: 100%;/)
  assert.match(agentPageThreePaneUiStyles, /\.agent-three-pane-page-list-stack \{[\s\S]*display: grid;[\s\S]*gap: var\(--ms-space-2\);/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-editor-layout \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-editor-title-block \{[\s\S]*min-width: 0;/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-review-summary-pane \{[\s\S]*overflow: auto;[\s\S]*padding: var\(--ms-space-4\);/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-review-pane-title,[\s\S]*\.agent-workspace-review-json-block__title \{[\s\S]*font-weight: 500;/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-state-row \{[\s\S]*min-height: 8rem;[\s\S]*justify-content: center;/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-state-spinner \{[\s\S]*animation: ms-spin 1s linear infinite;/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-list-stack \{[\s\S]*display: grid;[\s\S]*gap: var\(--ms-space-1\);/)
  assert.match(agentPageWorkspaceUiStyles, /\.agent-workspace-review-effects-list \{[\s\S]*display: grid;[\s\S]*gap: var\(--ms-space-2\);/)
  assert.doesNotMatch(agentPageUiStyles, /\.agent-three-pane-page-body \{/)
  assert.doesNotMatch(agentPageUiStyles, /\.agent-workspace-editor-layout \{/)
  assert.match(agentConnectionsSource, /AgentThreePanePageBody/)
  assert.match(agentConnectionsSource, /AgentThreePanePagePane/)
  assert.match(agentConnectionsSource, /AgentThreePanePagePaneScroller/)
  assert.match(agentConnectionsSource, /AgentThreePanePagePaneRaw/)
  assert.match(agentConnectionsSource, /AgentThreePanePageItemButton/)
  assert.match(agentConnectionsSource, /AgentThreePanePageListStack/)
  assert.match(agentConnectionsSource, /AgentThreePanePageEmptyText/)
  assert.doesNotMatch(agentConnectionsSource, /AgentPageShellBody/)
  assert.doesNotMatch(agentConnectionsSource, /className=\{active/)
  assert.doesNotMatch(agentConnectionsSource, /className=\{event\.direction/)
  assert.doesNotMatch(agentConnectionsSource, /className="space-y-/)
  assert.doesNotMatch(agentConnectionsSource, /grid h-full min-h-\[620px\]/)
  assert.doesNotMatch(agentConnectionsSource, /grid-cols-\[280px/)

  assert.match(agentConsoleSource, /<AgentConsolePageBody>/)
  assert.doesNotMatch(agentConsoleSource, /className="agent-console-page-body"/)
  assert.match(agentConsoleSource, /<AgentConsoleMainGrid layout="control-logs">/)
  assert.match(agentConsoleSource, /<AgentConsoleMainColumn pane="config">/)
  assert.match(agentConsoleSource, /<AgentConsoleSidebar pane="logs">/)
  assert.match(agentConsoleSurfaceSource, /AgentCapabilityHealthPanel/)
  assert.match(agentConsoleSurfaceSource, /AgentSessionIntegrationPanel/)
  assert.doesNotMatch(agentConsoleSurfaceSource, /AgentConsoleLogSummary/)
  assert.doesNotMatch(agentConsoleSurfaceSource, /AgentConsoleLogStream/)
  assert.doesNotMatch(agentConsoleSurfaceSource, /AgentConsoleLogLineText/)
  assert.doesNotMatch(agentConsoleSurfaceSource, /className="agent-console-log-/)
  assert.match(agentConsoleStyles, /\.agent-console-page-body \{[\s\S]*display: flex;[\s\S]*flex-direction: column;/)
  assert.doesNotMatch(agentConsoleStyles, /\.agent-console-main-grid\[data-layout="control-logs"\] > \.agent-console-main-column,[\s\S]*overflow-y: auto;/)
})

function waitForAsyncStorage(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
