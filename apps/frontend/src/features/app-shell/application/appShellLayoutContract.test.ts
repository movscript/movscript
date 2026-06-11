import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
  const workspaceSource = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/index.tsx'), 'utf8')
  const workspaceStyles = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/styles.css'), 'utf8')
  const agentPanelStyles = readFileSync(resolve('../../packages/ui/src/components/business/agent/panel/frame/styles.css'), 'utf8')
  const agentHistoryStyles = readFileSync(resolve('../../packages/ui/src/components/business/agent/chat/history/styles.css'), 'utf8')

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

test('app window header exposes explicit left control fill layout', () => {
  const appSource = readFileSync(resolve('src/App.tsx'), 'utf8')
  const headerSource = readFileSync(resolve('src/features/app-shell/components/Header.tsx'), 'utf8')
  const windowHeaderSource = readFileSync(resolve('../../packages/ui/src/components/layout/app-shell/window/index.tsx'), 'utf8')
  const windowHeaderStyles = readFileSync(resolve('../../packages/ui/src/components/layout/app-shell/window/styles.css'), 'utf8')
  const agentModeStyles = readFileSync(resolve('../../packages/ui/src/components/business/agent/mode/styles.css'), 'utf8')

  assert.match(headerSource, /leftControlsLayout\?: 'default' \| 'fill'/)
  assert.match(windowHeaderSource, /leftControlsLayout\?: "default" \| "fill"/)
  assert.match(windowHeaderSource, /data-layout=\{leftControlsLayout === "fill" \? "fill" : undefined\}/)
  assert.match(windowHeaderStyles, /\.app-window-header__left-controls\[data-layout="fill"\] \{[\s\S]*min-width: 0;[\s\S]*flex: 1 1 auto;/)
  assert.match(appSource, /leftControls=\{agentSidebarHeaderControl\}[\s\S]*leftControlsLayout="fill"/)
  assert.match(appSource, /className="detail-sidebar-window-controls/)
  assert.match(appSource, /leftControls=\{sidebarHeaderControl\}[\s\S]*leftControlsLayout="fill"/)
  assert.match(appSource, /className="app-window-sidebar-toggle detail-sidebar-window-controls__nav"[\s\S]*window\.history\.back/)
  assert.match(appSource, /className="app-window-sidebar-toggle detail-sidebar-window-controls__nav"[\s\S]*window\.history\.forward/)
  assert.match(windowHeaderStyles, /\.detail-sidebar-window-controls \{[\s\S]*width: 100%;[\s\S]*gap: 18px;/)
  assert.doesNotMatch(agentModeStyles, /\.app-window-header:has\(\.agent-sidebar-window-controls\)/)
})

test('route shell viewport scroll is derived from the route layout registry', () => {
  const appSource = readFileSync(resolve('src/App.tsx'), 'utf8')

  assert.match(appSource, /getAppRouteLayoutSpec\(pathname\)/)
  assert.match(appSource, /appRouteViewportScrollForMode\(routeLayout\.scrollMode\)/)
  assert.doesNotMatch(appSource, /<AppRouteViewport scroll="auto"/)
  assert.doesNotMatch(appSource, /<AppRouteViewport scroll="owned"/)
})

test('enterprise app top controls extend the shared component instead of shadowing it', () => {
  const contractSource = readFileSync(resolve('src/runtime/contract.ts'), 'utf8')
  const communityRuntimeSource = readFileSync(resolve('src/runtime/community.tsx'), 'utf8')
  const enterpriseRuntimeSource = readFileSync(resolve('../../../enterprise/overlays/movscript/apps/frontend/src/edition/enterprise.tsx'), 'utf8')
  const enterpriseTopControlsOverlay = resolve('../../../enterprise/overlays/movscript/apps/frontend/src/features/app-shell/components/AppTopControls.tsx')

  assert.match(contractSource, /export interface FrontendAppTopControls/)
  assert.match(communityRuntimeSource, /export const runtimeAppTopControls: FrontendAppTopControls = \{\}/)
  assert.match(enterpriseRuntimeSource, /export const runtimeAppTopControls: FrontendAppTopControls = \{[\s\S]*projectMenuVariant: 'enterprise'/)
  assert.equal(existsSync(enterpriseTopControlsOverlay), false)
})

test('account settings page layout is owned by named shell styles', () => {
  const appSource = readFileSync(resolve('src/App.tsx'), 'utf8')
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
  assert.match(settingsStyles, /\.account-settings-page__nav-button \.ms-button__content,[\s\S]*\.account-settings-page__exit-button \.ms-button__content \{[\s\S]*justify-content: flex-start;/)
  assert.match(settingsStyles, /\.account-settings-page__footer \{[\s\S]*margin-top: auto;[\s\S]*border-top: 1px solid var\(--ms-color-border\);/)
  assert.match(settingsStyles, /\.account-settings-page__main \{[\s\S]*min-height: 0;[\s\S]*overflow-y: auto;[\s\S]*var\(--app-shell-stack-overlap, 0px\)/)
  assert.match(settingsStyles, /\.account-settings-page__main\[data-content-kind="console"\] \{[\s\S]*padding:/)
})
