import { create } from 'zustand'
import type { ReactNode } from 'react'

const AGENT_MODE_CONTENT_PANEL_COLLAPSED_STORAGE_KEY = 'movscript-ai-ui-content-panel-collapsed'
const AGENT_MODE_SIDEBAR_COLLAPSED_STORAGE_KEY = 'movscript-ai-ui-sidebar-collapsed'

function readAgentModeContentPanelCollapsed() {
  if (typeof window === 'undefined') return true
  const saved = window.localStorage.getItem(AGENT_MODE_CONTENT_PANEL_COLLAPSED_STORAGE_KEY)
  return saved === null ? true : saved === 'true'
}

function persistAgentModeContentPanelCollapsed(collapsed: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AGENT_MODE_CONTENT_PANEL_COLLAPSED_STORAGE_KEY, String(collapsed))
}

function readAgentModeSidebarCollapsed() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(AGENT_MODE_SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
}

function persistAgentModeSidebarCollapsed(collapsed: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AGENT_MODE_SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed))
}

interface AgentPanelUiStore {
  open: boolean
  detailAgentPanelWidth: number
  agentModeContentPanelCollapsed: boolean
  agentModeSidebarCollapsed: boolean
  detailHeaderActions: ReactNode | null
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setDetailAgentPanelWidth: (width: number) => void
  setDetailHeaderActions: (actions: ReactNode | null) => void
  setAgentModeContentPanelCollapsed: (collapsed: boolean) => void
  toggleAgentModeContentPanelCollapsed: () => void
  setAgentModeSidebarCollapsed: (collapsed: boolean) => void
  toggleAgentModeSidebarCollapsed: () => void
}

export const useAgentPanelUiStore = create<AgentPanelUiStore>((set) => ({
  open: typeof window !== 'undefined' ? window.innerWidth >= 960 : true,
  detailAgentPanelWidth: typeof window !== 'undefined' && window.innerWidth >= 1440 ? 360 : 320,
  agentModeContentPanelCollapsed: readAgentModeContentPanelCollapsed(),
  agentModeSidebarCollapsed: readAgentModeSidebarCollapsed(),
  detailHeaderActions: null,
  setOpen: (open) => set({ open }),
  toggleOpen: () => set((state) => ({ open: !state.open })),
  setDetailAgentPanelWidth: (detailAgentPanelWidth) => set({ detailAgentPanelWidth }),
  setDetailHeaderActions: (detailHeaderActions) => set({ detailHeaderActions }),
  setAgentModeContentPanelCollapsed: (collapsed) => {
    persistAgentModeContentPanelCollapsed(collapsed)
    set({ agentModeContentPanelCollapsed: collapsed })
  },
  toggleAgentModeContentPanelCollapsed: () => set((state) => {
    const collapsed = !state.agentModeContentPanelCollapsed
    persistAgentModeContentPanelCollapsed(collapsed)
    return { agentModeContentPanelCollapsed: collapsed }
  }),
  setAgentModeSidebarCollapsed: (collapsed) => {
    persistAgentModeSidebarCollapsed(collapsed)
    set({ agentModeSidebarCollapsed: collapsed })
  },
  toggleAgentModeSidebarCollapsed: () => set((state) => {
    const collapsed = !state.agentModeSidebarCollapsed
    persistAgentModeSidebarCollapsed(collapsed)
    return { agentModeSidebarCollapsed: collapsed }
  }),
}))
