import { create } from 'zustand'
import type { ReactNode } from 'react'

import {
  AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY,
  AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY,
  LEGACY_AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY,
  LEGACY_AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY,
} from './agentModePanelSizing'

const AGENT_MODE_EXPANDED_DEFAULTS_MIGRATION_KEY = 'movscript:agent-mode:expanded-defaults-v1'

function ensureAgentModeExpandedDefaultsMigrated() {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(AGENT_MODE_EXPANDED_DEFAULTS_MIGRATION_KEY) === '1') return
  window.localStorage.removeItem(LEGACY_AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY)
  window.localStorage.removeItem(LEGACY_AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY)
  window.localStorage.removeItem(AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY)
  window.localStorage.removeItem(AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY)
  window.localStorage.setItem(AGENT_MODE_EXPANDED_DEFAULTS_MIGRATION_KEY, '1')
}

function readAgentModeContentPanelCollapsed() {
  if (typeof window === 'undefined') return false
  ensureAgentModeExpandedDefaultsMigrated()
  const saved = window.localStorage.getItem(AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY)
  return saved === 'collapsed'
}

function persistAgentModeContentPanelCollapsed(collapsed: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AGENT_MODE_CONTENT_PANEL_STATE_STORAGE_KEY, collapsed ? 'collapsed' : 'default')
}

function readAgentModeSidebarCollapsed() {
  if (typeof window === 'undefined') return false
  ensureAgentModeExpandedDefaultsMigrated()
  return window.localStorage.getItem(AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY) === 'collapsed'
}

function persistAgentModeSidebarCollapsed(collapsed: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AGENT_MODE_SIDEBAR_STATE_STORAGE_KEY, collapsed ? 'collapsed' : 'default')
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
