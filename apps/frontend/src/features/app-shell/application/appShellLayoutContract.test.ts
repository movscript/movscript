import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readAppShellContractSource(): string {
  return [
    readFileSync(resolve('src/App.tsx'), 'utf8'),
    readFileSync(resolve('src/features/app-shell/application/AppRouterConfig.tsx'), 'utf8'),
    readFileSync(resolve('src/features/app-shell/application/AppShellLayout.tsx'), 'utf8'),
    readFileSync(resolve('src/features/app-shell/application/AppShellLayoutControls.tsx'), 'utf8'),
    readFileSync(resolve('src/features/app-shell/application/AppShellLayoutSlots.ts'), 'utf8'),
    readFileSync(resolve('src/features/app-shell/application/AppCanvasListShellRoute.tsx'), 'utf8'),
    readFileSync(resolve('src/features/app-shell/application/AppToolShellRoute.tsx'), 'utf8'),
  ].join('\n')
}

test('stacked app shell reserves overlap without shrinking pane content', () => {
  const workspaceSource = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/index.tsx'), 'utf8')
  const workspaceStyles = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/styles.css'), 'utf8')

  assert.match(workspaceSource, /data-has-next-slot=\{hasRightSlot \? "true" : undefined\}/)
  assert.match(workspaceSource, /data-next-slot-collapsed=\{hasRightSlot && rightPaneCollapsed \? "true" : undefined\}/)
  assert.match(workspaceSource, /data-has-next-slot="true"/)
  assert.match(
    workspaceStyles,
    /\.app-shell\[data-layout="stacked"\] \.app-shell__slot\[data-has-next-slot="true"\] \{[\s\S]*box-sizing: content-box;[\s\S]*padding-right: var\(--app-shell-stack-overlap\);/,
  )
  assert.match(workspaceStyles, /\.app-shell\[data-layout="stacked"\] \.app-shell__slot\[data-next-slot-collapsed="true"\] \{[\s\S]*padding-right: 0;/)
  assert.doesNotMatch(workspaceStyles, /\.app-shell[^\n{]*__slot:has\(/)
})

test('app sidebar resizing is owned by the shared layout controller', () => {
  const sidebarSource = readFileSync(resolve('src/features/app-shell/components/Sidebar.tsx'), 'utf8')

  assert.match(sidebarSource, /useResizablePanel\(\{[\s\S]*resizeEdge: 'right'[\s\S]*collapseMode: 'after-min'/)
  assert.match(sidebarSource, /\{\.{3}sidebarResize\.resizeHandleProps\}[\s\S]*side="right"/)
  assert.doesNotMatch(sidebarSource, /resizeStart/)
  assert.doesNotMatch(sidebarSource, /setResizing/)
  assert.doesNotMatch(sidebarSource, /document\.body\.style\.cursor/)
  assert.doesNotMatch(sidebarSource, /window\.addEventListener\('pointermove'/)
})

test('shared resizable panel controller supports horizontal and vertical pane edges', () => {
  const workspaceSource = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/resize.ts'), 'utf8')
  const workspaceStyles = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/styles.css'), 'utf8')
  const agentPanelStyles = readFileSync(resolve('../../packages/ui/src/components/business/agent/panel/frame/styles.css'), 'utf8')
  const agentHistoryStyles = readFileSync(resolve('src/features/agent/components/AgentConversationHistoryUi.css'), 'utf8')

  assert.match(workspaceSource, /export type ResizablePanelEdge = "left" \| "right" \| "top" \| "bottom"/)
  assert.match(workspaceSource, /RESIZABLE_PANEL_RESIZING_BODY_CLASS = "ui-resizable-panel-resizing"/)
  assert.match(workspaceSource, /resizablePanelBodyClassNames\(resizeEdge\)/)
  assert.match(workspaceSource, /resizablePanelCursor\(edge: ResizablePanelEdge\)[\s\S]*row-resize[\s\S]*col-resize/)
  assert.match(workspaceSource, /resizablePanelAriaOrientation\(edge: ResizablePanelEdge\): "horizontal" \| "vertical"/)
  assert.match(workspaceSource, /resizablePanelKeyboardKeys\(edge: ResizablePanelEdge\)[\s\S]*ArrowUp[\s\S]*ArrowDown[\s\S]*ArrowLeft[\s\S]*ArrowRight/)
  assert.match(workspaceStyles, /body\.ui-resizable-panel-resizing,[\s\S]*body\.ui-resizable-panel-resizing \* \{[\s\S]*user-select: none;/)
  assert.match(workspaceStyles, /body\.ui-resizable-panel-resizing--x,[\s\S]*cursor: col-resize;/)
  assert.match(workspaceStyles, /body\.ui-resizable-panel-resizing--y,[\s\S]*cursor: row-resize;/)
  assert.match(agentPanelStyles, /body\.ui-resizable-panel-resizing--x \.ai-agent-panel \{[\s\S]*transition: none;/)
  assert.doesNotMatch(agentPanelStyles, /ai-agent-panel-resizing/)
  assert.doesNotMatch(agentHistoryStyles, /cursor: row-resize !important/)
})

test('agent chat tabs and history keep fixed rows with scroll overflow', () => {
  const agentHistoryStyles = readFileSync(resolve('src/features/agent/components/AgentConversationHistoryUi.css'), 'utf8')
  const agentTabItemStyles = readFileSync(resolve('src/features/agent/components/conversation-tabs-ui/item/styles.css'), 'utf8')

  assert.match(agentHistoryStyles, /\.ai-agent-panel-empty-history \{[\s\S]*flex: 0 0 min\(260px, 42%\);/)
  assert.match(agentHistoryStyles, /\.ai-agent-panel-empty-history-list \{[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*overflow-y: auto;/)
  assert.match(agentHistoryStyles, /\.ai-agent-panel-empty-history-item \{[\s\S]*flex: 0 0 auto;[\s\S]*min-height: 44px;/)
  assert.match(agentTabItemStyles, /\.ai-agent-panel-conversation-tab \{[\s\S]*width: clamp\(var\(--ai-agent-conversation-tab-min-width\), 32%, 168px\);[\s\S]*flex: 0 0 clamp\(var\(--ai-agent-conversation-tab-min-width\), 32%, 168px\);/)
  assert.doesNotMatch(agentTabItemStyles, /\.ai-agent-panel-conversation-tab \{[\s\S]*flex: 1 1 0;/)
})

test('app window header exposes semantic icon regions and left control fill layout', () => {
  const appSource = readAppShellContractSource()
  const headerSource = readFileSync(resolve('src/features/app-shell/components/Header.tsx'), 'utf8')
  const windowHeaderSource = readFileSync(resolve('../../packages/ui/src/components/layout/app-shell/window/index.tsx'), 'utf8')
  const windowHeaderStyles = readFileSync(resolve('../../packages/ui/src/components/layout/app-shell/window/styles.css'), 'utf8')
  const agentModeStyles = readFileSync(resolve('src/features/agent/components/AgentModeUi.css'), 'utf8')

  assert.match(headerSource, /leftControlsLayout\?: 'default' \| 'fill'/)
  assert.match(headerSource, /navigationControls\?: ReactNode/)
  assert.match(headerSource, /layoutControls\?: ReactNode/)
  assert.match(headerSource, /primaryActions\?: ReactNode/)
  assert.match(headerSource, /contextActions\?: ReactNode/)
  assert.match(headerSource, /globalActions\?: ReactNode/)
  assert.doesNotMatch(headerSource, /appControls\?: ReactNode/)
  assert.doesNotMatch(headerSource, /leftControls\?: ReactNode/)
  assert.doesNotMatch(headerSource, /contextActions \?\? appControls/)
  assert.match(headerSource, /roleName: 'navigation' \| 'layout' \| 'primary' \| 'context' \| 'global'/)
  assert.match(windowHeaderSource, /leftControlsLayout\?: "default" \| "fill"/)
  assert.match(windowHeaderSource, /data-layout=\{leftControlsLayout === "fill" \? "fill" : undefined\}/)
  assert.match(windowHeaderStyles, /\.app-window-header__left-controls\[data-layout="fill"\] \{[\s\S]*min-width: 0;[\s\S]*flex: 1 1 auto;/)
  assert.match(windowHeaderStyles, /\.app-window-header-action-group \{[\s\S]*display: inline-flex;[\s\S]*gap: var\(--ms-space-1\);/)
  assert.match(windowHeaderStyles, /\.app-window-header-action-group\[data-role="context"\]::before/)
  assert.match(appSource, /const homeHeaderControl = <AppShellHomeControl \/>/)
  assert.match(appSource, /export function AppShellHomeControl\(\)[\s\S]*className="app-window-sidebar-toggle app-window-home-button"[\s\S]*openHomeWindow/)
  assert.match(appSource, /const settingsExitControl = \(/)
  assert.match(appSource, /const agentSettingsActive = pathname === ROUTES\.agentSettings/)
  assert.match(appSource, /const settingsActive = !!accountSettingsActiveTab \|\| agentSettingsActive/)
  assert.match(appSource, /<AppShellSettingsExitControl[\s\S]*active=\{settingsActive\}/)
  assert.match(appSource, /title="退出设置"/)
  assert.match(appSource, /navigationControls=\{<>\{homeHeaderControl\}\{settingsExitControl\}<\/>\}/)
  assert.match(appSource, /const settingsSidebarLayoutControls = \([\s\S]*<AppShellLeftPaneToggle hidden=\{settingsSidebarHidden\}/)
  assert.match(appSource, /layoutControls=\{accountSettingsActiveTab \? settingsSidebarLayoutControls : toolSidebarLayoutControls\}/)
  assert.match(appSource, /const toolCenterLayoutControls = toolChrome && toolSidebarHidden[\s\S]*\? accountSettingsActiveTab \? settingsSidebarLayoutControls : toolSidebarLayoutControls/)
  assert.match(appSource, /const settingsCenterHeader = \([\s\S]*navigationControls=\{settingsSidebarHidden \? <>\{homeHeaderControl\}\{settingsExitControl\}<\/> : undefined\}/)
  assert.match(appSource, /const projectHistoryNavigationControls = <AppShellHistoryNavigationControls navClassName="project-window-controls__nav" \/>/)
  assert.match(appSource, /export function AppShellHistoryNavigationControls[\s\S]*window\.history\.back[\s\S]*window\.history\.forward/)
  assert.match(appSource, /const homeCenterHeader = \(\s*<Header\s*showWindowControls\s*showAppControls\s*showFallbackBrand=\{false\}\s*showAppUpdateAction\s*\/>\s*\)/)
  assert.match(appSource, /navigationControls=\{<>\{homeHeaderControl\}\{projectHistoryNavigationControls\}<\/>\}[\s\S]*primaryActions=\{<ProjectGitHeaderActions compact \/>\}[\s\S]*contextActions=\{terminalHeaderControl\}/)
  assert.match(appSource, /const agentNavigationControls = <>\{homeHeaderControl\}\{settingsExitControl\}<\/>/)
  assert.match(appSource, /navigationControls=\{!agentSidebarVisible \? agentNavigationControls : undefined\}/)
  assert.match(appSource, /\{agentSettingsActive \? null : <AppShellHistoryNavigationControls navClassName="agent-sidebar-window-controls__nav" \/>\}/)
  assert.match(appSource, /className="tool-sidebar-window-controls/)
  assert.doesNotMatch(headerSource, /showProjectControls/)
  assert.doesNotMatch(appSource, /showProjectControls=/)
  assert.match(appSource, /<AppShellHistoryNavigationControls navClassName="tool-sidebar-window-controls__nav" \/>/)
  assert.doesNotMatch(agentModeStyles, /\.app-window-header:has\(\.agent-sidebar-window-controls\)/)
})

test('canvas editor header separates navigation, state, primary actions, and context tools', () => {
  const canvasHeaderSource = readFileSync(resolve('src/features/app-shell/application/AppCanvasEditorShellRoute.tsx'), 'utf8')

  assert.match(canvasHeaderSource, /navigationControls=\{<CanvasHeaderNavigation \/>\}/)
  assert.match(canvasHeaderSource, /layoutControls=\{<CanvasHeaderLayoutControls \/>\}/)
  assert.match(canvasHeaderSource, /primaryActions=\{<CanvasHeaderPrimaryActions \/>\}/)
  assert.match(canvasHeaderSource, /contextActions=\{<CanvasHeaderContextActions \/>\}/)
  assert.match(canvasHeaderSource, /function CanvasHeaderNavigation\(\)[\s\S]*<Home size=\{12\} \/>[\s\S]*canvasBackPath\(search\)/)
  assert.match(canvasHeaderSource, /function CanvasHeaderPrimaryActions\(\)[\s\S]*<Play size=\{12\} \/>[\s\S]*<Save size=\{12\} \/>/)
  assert.match(canvasHeaderSource, /function CanvasHeaderContextActions\(\)[\s\S]*PanelRightOpen[\s\S]*ROUTES\.resources[\s\S]*ROUTES\.jobs/)
  assert.match(canvasHeaderSource, /className="app-window-route-status/)
  assert.doesNotMatch(canvasHeaderSource, /leftControls=\{<CanvasHeaderLeft \/>/)
  assert.doesNotMatch(canvasHeaderSource, /appControls=\{<CanvasHeaderActions \/>/)
})

test('canvas list and tools are standalone page programs outside the main shell layout', () => {
  const routerSource = readFileSync(resolve('src/features/app-shell/application/AppRouterConfig.tsx'), 'utf8')
  const canvasListShellSource = readFileSync(resolve('src/features/app-shell/application/AppCanvasListShellRoute.tsx'), 'utf8')
  const toolShellSource = readFileSync(resolve('src/features/app-shell/application/AppToolShellRoute.tsx'), 'utf8')
  const routeRegistrySource = readFileSync(resolve('src/routes/routeLayoutRegistry.ts'), 'utf8')

  assert.match(routerSource, /<Route path=\{ROUTES\.canvases\} element=\{<CanvasListShellRoute \/>\} \/>/)
  assert.match(routerSource, /<Route path="\/tools\/\*" element=\{<ToolShellRoute \/>\} \/>/)
  assert.match(routerSource, /<Route path=\{ROUTES\.canvasEditor\} element=\{<CanvasEditorShellRoute \/>\} \/>/)
  assert.doesNotMatch(routerSource, /<ShellLayout>[\s\S]*<Route path=\{ROUTES\.canvases\}/)
  assert.doesNotMatch(routerSource, /<ShellLayout>[\s\S]*<Route path=\{ROUTES\.tools\.refImageGen\}/)
  assert.doesNotMatch(routerSource, /<ShellLayout>[\s\S]*<Route path=\{ROUTES\.tools\.plugin\}/)

  assert.match(canvasListShellSource, /export function CanvasListShellRoute\(\)/)
  assert.match(canvasListShellSource, /<WorkspaceShell[\s\S]*surface="canvas"/)
  assert.match(canvasListShellSource, /<RouteContentShell width="xwide">[\s\S]*<CanvasListPage \/>/)
  assert.match(canvasListShellSource, /navigationControls=\{<CanvasListHeaderNavigation \/>\}/)
  assert.match(canvasListShellSource, /layoutControls=\{<CanvasListHeaderStatus \/>\}/)

  assert.match(toolShellSource, /export function ToolShellRoute\(\)/)
  assert.match(toolShellSource, /<WorkspaceShell[\s\S]*surface="tool"/)
  assert.match(toolShellSource, /<Route path="ref-image-gen" element=\{<RefImageGenPage \/>\} \/>/)
  assert.match(toolShellSource, /<Route path="plugin\/:pluginId" element=\{<PluginToolPage \/>\} \/>/)
  assert.match(toolShellSource, /<Sidebar[\s\S]*onHide=\{hideToolSidebar\}/)
  assert.match(toolShellSource, /terminalPanel=\{terminalPanel\}/)

  assert.match(routeRegistrySource, /routeId: 'canvases'[\s\S]*surface: 'canvas'[\s\S]*shellLayout: 'flush'[\s\S]*panes: \[\]/)
  assert.match(routeRegistrySource, /Canvas list is a standalone canvas management program/)
})

test('route shell viewport scroll is derived from the route layout registry', () => {
  const appSource = readAppShellContractSource()

  assert.match(appSource, /getAppRouteLayoutSpec\(pathname\)/)
  assert.match(appSource, /appRouteViewportScrollForMode\(routeLayout\.scrollMode\)/)
  assert.doesNotMatch(appSource, /<AppRouteViewport scroll="auto"/)
  assert.doesNotMatch(appSource, /<AppRouteViewport scroll="owned"/)
})

test('app top controls are driven by the shared runtime contract', () => {
  const contractSource = readFileSync(resolve('src/runtime/contract.ts'), 'utf8')
  const communityRuntimeSource = readFileSync(resolve('src/runtime/community.tsx'), 'utf8')
  const appTopControlsSource = readFileSync(resolve('src/features/app-shell/components/AppTopControls.tsx'), 'utf8')
  const appTopControlsStyles = readFileSync(resolve('../../packages/ui/src/components/business/app/navigation/styles.css'), 'utf8')

  assert.match(contractSource, /export interface FrontendAppTopControls/)
  assert.match(contractSource, /globalMenuItems\?: FrontendAppTopControlsMenuItem\[\]/)
  assert.match(contractSource, /export interface FrontendAppTopControlsMenuItem/)
  assert.doesNotMatch(contractSource, /languageControl/)
  assert.doesNotMatch(contractSource, /projectMenuVariant/)
  assert.doesNotMatch(contractSource, /modeButtonVariant/)
  assert.match(communityRuntimeSource, /export const runtimeAppTopControls: FrontendAppTopControls = \{\}/)
  assert.match(appTopControlsSource, /const \[globalMenuOpen, setGlobalMenuOpen\] = useState\(false\)/)
  assert.match(appTopControlsSource, /const globalMenuItems = runtimeAppTopControls\.globalMenuItems \?\? \[\]/)
  assert.doesNotMatch(appTopControlsSource, /switchMode/)
  assert.doesNotMatch(appTopControlsSource, /workModeLabel/)
  assert.doesNotMatch(appTopControlsSource, /ModeIcon/)
  assert.match(appTopControlsSource, /globalMenuItems\.map\(\(item\) => \(/)
  assert.match(appTopControlsSource, /<AppTopMenuLeadingIcon icon=\{item\.icon\} \/>/)
  assert.match(appTopControlsSource, /openGlobalMenuItem\(item\.to\)/)
  assert.match(appTopControlsSource, /<MoreHorizontal size=\{iconSize\} \/>/)
  assert.match(appTopControlsSource, /className="app-top-global-menu"/)
  assert.match(appTopControlsSource, /<AppTopMenuLeadingIcon icon=\{Settings\} \/>/)
  assert.match(appTopControlsSource, /<Languages size=\{12\} \/>/)
  assert.match(appTopControlsSource, /<Palette size=\{12\} \/>/)
  assert.doesNotMatch(appTopControlsSource, /AppTopLanguageSelect/)
  assert.doesNotMatch(appTopControlsSource, /const languageControl/)
  assert.doesNotMatch(appTopControlsSource, /showProjectSelector/)
  assert.doesNotMatch(appTopControlsSource, /projectMenuOpen/)
  assert.doesNotMatch(appTopControlsSource, /AppTopProjectMenuContent/)
  assert.doesNotMatch(appTopControlsSource, /app-top-control-button--mode-switch/)
  assert.doesNotMatch(readFileSync(resolve('../../packages/ui/src/components/business/app/navigation/index.tsx'), 'utf8'), /AppTopProjectMenuContent/)
  assert.match(appTopControlsStyles, /\.app-top-control-button\[data-state="open"\]/)
  assert.match(appTopControlsStyles, /\.app-top-global-menu \{[\s\S]*width: 15rem;/)
})

test('app header icon architecture document maps page controls to semantic regions', () => {
  const headerArchitectureDoc = readFileSync(resolve('../../docs/app-header-icon-architecture.zh-CN.md'), 'utf8')

  assert.match(headerArchitectureDoc, /# 程序头 Icon 架构/)
  assert.match(headerArchitectureDoc, /\| `navigationControls` \|[\s\S]*`Home`[\s\S]*`ArrowLeft`/)
  assert.match(headerArchitectureDoc, /\| `layoutControls` \|[\s\S]*`PanelLeftOpen`[\s\S]*`PanelLeftClose`/)
  assert.match(headerArchitectureDoc, /\| `primaryActions` \|[\s\S]*`Play`[\s\S]*`Save`/)
  assert.match(headerArchitectureDoc, /\| `contextActions` \|[\s\S]*终端[\s\S]*资源[\s\S]*任务/)
  assert.match(headerArchitectureDoc, /\| `globalActions` \|[\s\S]*`MoreHorizontal` 全局菜单[\s\S]*`RefreshCw` 菜单项/)
  assert.match(headerArchitectureDoc, /\| Global Home \| 无 \| 无 \| 无 \| 无 \| `AppTopControls`，含 App 更新入口和更新红点 \|/)
  assert.match(headerArchitectureDoc, /App 更新属于全局 Home 的右上角菜单/)
  assert.match(headerArchitectureDoc, /\| Project 模式 \| `Home`、项目内后退、项目内前进 \| 无 \| `ProjectGitHeaderActions` \| 终端 \| 默认 `AppTopControls` \|/)
  assert.match(headerArchitectureDoc, /\| Account Settings \| `Home`、退出设置 \| 设置侧栏折叠\/展开，不放后退\/前进 \| 无 \| 终端按当前 shell 需要放置 \| 默认 `AppTopControls` 或隐藏项目选择 \|/)
  assert.match(headerArchitectureDoc, /\| Canvas 编辑器 \| `Home`、返回 Canvas 来源列表 \| 节点库开关、Canvas 只读状态 \| 运行、保存 \| 右侧工作流面板、资源、任务 \| 默认 `AppTopControls` \|/)
  assert.match(headerArchitectureDoc, /每个可沉浸或可独立打开的程序头都必须有 `Home`/)
  assert.match(headerArchitectureDoc, /项目模式内部存在[\s\S]*项目模式的程序头需要提供后退和前进/)
  assert.match(headerArchitectureDoc, /Canvas[\s\S]*`canvasBackPath\(search\)`/)
  assert.match(headerArchitectureDoc, /右上角不放项目切换 icon/)
  assert.match(headerArchitectureDoc, /模式切换不是高频动作，收纳在 `MoreHorizontal` 全局菜单中/)
  assert.match(headerArchitectureDoc, /Git 的 commit、pull、push 只属于项目模式/)
  assert.match(headerArchitectureDoc, /全局 Home 是模式入口，不继承项目模式的 `primaryActions`/)
  assert.match(headerArchitectureDoc, /设置页的“退出设置”是唯一的返回上层语义/)
  assert.match(headerArchitectureDoc, /Enterprise 不再 overlay `AppTopControls`/)
  assert.match(headerArchitectureDoc, /runtimeAppTopControls: FrontendAppTopControls[\s\S]*globalMenuItems/)
})

test('account settings page layout is owned by named shell styles', () => {
  const appSource = readAppShellContractSource()
  const settingsSource = readFileSync(resolve('src/features/app-shell/components/AccountSettingsDialog.tsx'), 'utf8')
  const settingsStyles = readFileSync(resolve('src/features/app-shell/components/AccountSettingsDialog.css'), 'utf8')

  assert.doesNotMatch(appSource, /function AccountSettingsShellRoute/)
  assert.match(appSource, /<ShellLayout>[\s\S]*<Route path=\{ROUTES\.appSettings\} element=\{<AccountSettingsRoute tab="settings" \/>\}/)
  assert.match(appSource, /return requireOrg && !accountSettingsActiveTab \? <OrgGuard>\{shell\}<\/OrgGuard> : shell/)
  assert.match(appSource, /accountSettingsActiveTab \? \([\s\S]*<AccountSettingsPageSidebar/)
  assert.match(appSource, /<AccountSettingsPageContent activeTab=\{activeTab\} \/>/)
  assert.match(settingsSource, /import '\.\/AccountSettingsDialog\.css'/)
  assert.match(settingsSource, /export function AccountSettingsPageSidebar/)
  assert.match(settingsSource, /onExitSettings\?: \(\) => void/)
  assert.match(settingsSource, /label="退出设置"/)
  assert.match(settingsSource, /useResizablePanel\(\{[\s\S]*resizeEdge: 'right'[\s\S]*collapseMode: 'after-min'/)
  assert.match(settingsSource, /export function AccountSettingsPageContent/)
  assert.match(settingsSource, /data-content-kind=\{contentKind\}/)
  assert.match(appSource, /runtimeTab\?\.startsWith\('console'\)[\s\S]*runtimeTab as AccountSettingsPageTab/)
  assert.match(settingsSource, /tab\.startsWith\('console:'\)/)
  assert.match(settingsSource, /className="account-settings-page"/)
  assert.match(settingsSource, /className="account-settings-page__sidebar"/)
  assert.match(settingsSource, /account-settings-page__main/)
  assert.match(settingsSource, /activeTab === 'console'/)
  assert.match(settingsSource, /activeTab === 'console:model-providers'/)
  assert.doesNotMatch(settingsSource, /AppSidebarHeader/)
  assert.doesNotMatch(settingsSource, /AppSidebarSection/)
  assert.doesNotMatch(
    settingsSource,
    /grid-cols-\[|h-\[|w-\[|max-h-\[|min-h-\[|\[--ms-surface-backdrop-filter|overflow-y-auto|overflow-hidden/,
  )

  assert.match(settingsStyles, /\.account-settings-page \{[\s\S]*width: 100vw;[\s\S]*height: 100vh;[\s\S]*overflow: hidden;/)
  assert.match(settingsStyles, /\.account-settings-page__frame \{[\s\S]*display: grid;[\s\S]*grid-template-columns: 220px minmax\(0, 1fr\);[\s\S]*border-radius:/)
  assert.match(settingsStyles, /\.account-settings-page__sidebar \{[\s\S]*flex-direction: column;/)
  assert.match(settingsStyles, /\.account-settings-page__nav \{[\s\S]*padding: var\(--ms-space-3\) var\(--ms-space-2\);/)
  assert.match(settingsSource, /fullWidth[\s\S]*align="start"[\s\S]*className="account-settings-page__nav-button"/)
  assert.match(settingsStyles, /\.account-settings-page__footer \{[\s\S]*margin-top: auto;[\s\S]*border-top: 1px solid var\(--ms-color-border\);/)
  assert.match(settingsStyles, /\.account-settings-page__main \{[\s\S]*min-height: 0;[\s\S]*overflow-y: auto;[\s\S]*var\(--app-shell-stack-overlap, 0px\)/)
  assert.match(settingsStyles, /\.account-settings-page__main\[data-content-kind="console"\] \{[\s\S]*padding:/)
})
