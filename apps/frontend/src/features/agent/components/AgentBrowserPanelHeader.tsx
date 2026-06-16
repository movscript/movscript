import type { FormEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ClipboardList,
  Globe2,
  HardDrive,
  Home,
  LayoutTemplate,
  Loader2,
  MoreHorizontal,
  PenLine,
  Plus,
  ScanSearch,
  Search,
  X,
  XCircle,
} from 'lucide-react'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@movscript/ui/primitives'
import {
  AgentBrowserAddressForm,
  AgentBrowserHeader,
  AgentBrowserIconButton,
  AgentBrowserInlineError,
  AgentBrowserInput,
  AgentBrowserLauncherForm,
  AgentBrowserLauncherIcon,
  AgentBrowserLauncherSubmitButton,
  AgentBrowserMenuContent,
  AgentBrowserMenuItemIcon,
  AgentBrowserTabBar,
  AgentBrowserTabButton,
  AgentBrowserTabCloseButton,
  AgentBrowserTabIcon,
  AgentBrowserTabList,
  AgentBrowserTabSurface,
  AgentBrowserToolbar,
  AgentBrowserUrlMeta,
} from '@/features/agent/components/AgentBrowserUi'
import type {
  AgentBrowserContentTab,
  AgentBrowserWebTabState,
} from '@/features/agent/state/agentContentAreaStore'
import { agentBrowserTabTitle } from '@/features/agent/components/AgentBrowserPanelModel'

export interface AgentBrowserToolbarAction {
  label: string
  icon: LucideIcon
  disabled: boolean
  action: () => void
}

export function AgentBrowserPanelHeader({
  tabs,
  activeTabId,
  activeTab,
  activeWebState,
  webStates,
  projectName,
  hasProject,
  available,
  launcherOpen,
  addressWorkspace,
  toolbarAddressWorkspace,
  error,
  toolbarActions,
  onSetLauncherOpen,
  onSetAddressWorkspace,
  onSetToolbarAddressWorkspace,
  onOpenProjectHomeTab,
  onOpenBlankWebTab,
  onOpenResourceLibraryTab,
  onOpenExternalResourceLibraryTab,
  onOpenCanvasListTab,
  onOpenProjectStandardsTab,
  onOpenSessionOutputTab,
  onSetActiveTabId,
  onCloseTab,
  onOpenWebFromLauncher,
  onSubmitToolbarAddress,
}: {
  tabs: AgentBrowserContentTab[]
  activeTabId: string
  activeTab?: AgentBrowserContentTab
  activeWebState: AgentBrowserWebTabState | null
  webStates: Record<string, AgentBrowserWebTabState>
  projectName?: string
  hasProject: boolean
  available: boolean
  launcherOpen: boolean
  addressWorkspace: string
  toolbarAddressWorkspace: string
  error: string | null
  toolbarActions: AgentBrowserToolbarAction[]
  onSetLauncherOpen: (updater: (open: boolean) => boolean) => void
  onSetAddressWorkspace: (value: string) => void
  onSetToolbarAddressWorkspace: (value: string) => void
  onOpenProjectHomeTab: () => void
  onOpenBlankWebTab: () => void
  onOpenResourceLibraryTab: () => void
  onOpenExternalResourceLibraryTab: () => void
  onOpenCanvasListTab: () => void
  onOpenProjectStandardsTab: () => void
  onOpenSessionOutputTab: () => void
  onSetActiveTabId: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onOpenWebFromLauncher: (event: FormEvent<HTMLFormElement>) => void
  onSubmitToolbarAddress: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <AgentBrowserHeader>
      <AgentBrowserTabBar>
        <AgentBrowserTabList>
          {tabs.map((tab) => {
            const active = tab.id === activeTabId
            const webState = tab.kind === 'web' ? webStates[tab.id] : undefined
            const Icon = agentBrowserTabIcon(tab)
            return (
              <AgentBrowserTabSurface
                key={tab.id}
                active={active}
              >
                <AgentBrowserTabButton
                  title={tab.kind === 'web' ? webState?.url ?? tab.url ?? tab.title : tab.title}
                  onClick={() => onSetActiveTabId(tab.id)}
                >
                  <AgentBrowserTabIcon loading={webState?.loading}>
                    {webState?.loading ? <Loader2 size={12} /> : <Icon size={12} />}
                  </AgentBrowserTabIcon>
                  <span>{agentBrowserTabTitle(tab, webState, projectName)}</span>
                </AgentBrowserTabButton>
                <AgentBrowserTabCloseButton
                  aria-label="关闭标签"
                  title="关闭标签"
                  onClick={() => onCloseTab(tab.id)}
                >
                  <X size={11} />
                </AgentBrowserTabCloseButton>
              </AgentBrowserTabSurface>
            )
          })}
        </AgentBrowserTabList>
        <AgentBrowserIconButton title="新建网页标签" aria-label="新建网页标签" onClick={onOpenBlankWebTab}>
          <Plus size={14} />
        </AgentBrowserIconButton>
        <AgentBrowserIconButton title="打开资源库" aria-label="打开资源库" onClick={onOpenResourceLibraryTab}>
          <HardDrive size={14} />
        </AgentBrowserIconButton>
        <AgentBrowserIconButton title="打开外部资源" aria-label="打开外部资源" onClick={onOpenExternalResourceLibraryTab}>
          <ScanSearch size={14} />
        </AgentBrowserIconButton>
        <AgentBrowserIconButton title="打开会话产出" aria-label="打开会话产出" onClick={onOpenSessionOutputTab}>
          <ClipboardList size={14} />
        </AgentBrowserIconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <AgentBrowserIconButton title="浏览器操作" aria-label="浏览器操作">
              <MoreHorizontal size={14} />
            </AgentBrowserIconButton>
          </DropdownMenuTrigger>
          <AgentBrowserMenuContent>
            <DropdownMenuItem onClick={() => onSetLauncherOpen((open) => !open)}>
              <AgentBrowserMenuItemIcon>
                <Search size={13} />
              </AgentBrowserMenuItemIcon>
              打开网页
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenProjectHomeTab}>
              {hasProject ? (
                <>
                  <AgentBrowserMenuItemIcon>
                    <Home size={13} />
                  </AgentBrowserMenuItemIcon>
                  打开内容导航
                </>
              ) : (
                <>
                  <AgentBrowserMenuItemIcon>
                    <Globe2 size={13} />
                  </AgentBrowserMenuItemIcon>
                  新建空白网页
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenResourceLibraryTab}>
              <AgentBrowserMenuItemIcon>
                <HardDrive size={13} />
              </AgentBrowserMenuItemIcon>
              打开资源库
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenExternalResourceLibraryTab}>
              <AgentBrowserMenuItemIcon>
                <ScanSearch size={13} />
              </AgentBrowserMenuItemIcon>
              打开外部资源
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenCanvasListTab}>
              <AgentBrowserMenuItemIcon>
                <LayoutTemplate size={13} />
              </AgentBrowserMenuItemIcon>
              打开画布列表
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenProjectStandardsTab}>
              <AgentBrowserMenuItemIcon>
                <PenLine size={13} />
              </AgentBrowserMenuItemIcon>
              打开项目规范
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenSessionOutputTab}>
              <AgentBrowserMenuItemIcon>
                <ClipboardList size={13} />
              </AgentBrowserMenuItemIcon>
              打开会话产出
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenBlankWebTab}>
              <AgentBrowserMenuItemIcon>
                <Globe2 size={13} />
              </AgentBrowserMenuItemIcon>
              新建空白网页
            </DropdownMenuItem>
          </AgentBrowserMenuContent>
        </DropdownMenu>
      </AgentBrowserTabBar>
      {activeTab?.kind === 'web' && (activeWebState?.url || activeTab.url) ? (
        <AgentBrowserToolbar>
          {toolbarActions.map((item) => {
            const Icon = item.icon
            return (
              <AgentBrowserIconButton
                key={item.label}
                disabled={item.disabled}
                title={item.label}
                aria-label={item.label}
                onClick={item.action}
              >
                <Icon size={13} />
              </AgentBrowserIconButton>
            )
          })}
          <AgentBrowserUrlMeta asChild>
            <AgentBrowserAddressForm onSubmit={onSubmitToolbarAddress}>
              <AgentBrowserInput
                value={toolbarAddressWorkspace}
                onChange={(event) => onSetToolbarAddressWorkspace(event.target.value)}
                placeholder="网址或搜索"
                aria-label="网页地址"
                disabled={!available}
              />
              <AgentBrowserLauncherSubmitButton disabled={!available || !toolbarAddressWorkspace.trim()}>
                打开
              </AgentBrowserLauncherSubmitButton>
            </AgentBrowserAddressForm>
          </AgentBrowserUrlMeta>
        </AgentBrowserToolbar>
      ) : null}
      {launcherOpen ? (
        <AgentBrowserLauncherForm onSubmit={onOpenWebFromLauncher}>
          <AgentBrowserLauncherIcon>
            <Search size={13} />
          </AgentBrowserLauncherIcon>
          <AgentBrowserInput
            value={addressWorkspace}
            onChange={(event) => onSetAddressWorkspace(event.target.value)}
            placeholder="输入网址或搜索"
            autoFocus
          />
          <AgentBrowserLauncherSubmitButton disabled={!addressWorkspace.trim()}>
            打开
          </AgentBrowserLauncherSubmitButton>
        </AgentBrowserLauncherForm>
      ) : null}
      {error ? (
        <AgentBrowserInlineError icon={<XCircle size={13} />}>
          {error}
        </AgentBrowserInlineError>
      ) : null}
    </AgentBrowserHeader>
  )
}

function agentBrowserTabIcon(tab: AgentBrowserContentTab): LucideIcon {
  if (tab.kind === 'project_home') return Home
  if (tab.kind === 'resources') return HardDrive
  if (tab.kind === 'external_resources') return ScanSearch
  if (tab.kind === 'canvas_list') return LayoutTemplate
  if (tab.kind === 'project_standards') return PenLine
  if (tab.kind === 'session_output') return ClipboardList
  return Globe2
}
