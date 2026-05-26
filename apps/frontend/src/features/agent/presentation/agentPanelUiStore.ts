import { create } from 'zustand'

const AGENT_MODE_CONTENT_PANEL_COLLAPSED_STORAGE_KEY = 'movscript-agent-mode-content-panel-collapsed'

function readAgentModeContentPanelCollapsed() {
  if (typeof window === 'undefined') return true
  const saved = window.localStorage.getItem(AGENT_MODE_CONTENT_PANEL_COLLAPSED_STORAGE_KEY)
  return saved === null ? true : saved === 'true'
}

function persistAgentModeContentPanelCollapsed(collapsed: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AGENT_MODE_CONTENT_PANEL_COLLAPSED_STORAGE_KEY, String(collapsed))
}

interface AgentPanelUiStore {
  open: boolean
  agentModeContentPanelCollapsed: boolean
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setAgentModeContentPanelCollapsed: (collapsed: boolean) => void
  toggleAgentModeContentPanelCollapsed: () => void
}

export const useAgentPanelUiStore = create<AgentPanelUiStore>((set) => ({
  open: typeof window !== 'undefined' ? window.innerWidth >= 960 : true,
  agentModeContentPanelCollapsed: readAgentModeContentPanelCollapsed(),
  setOpen: (open) => set({ open }),
  toggleOpen: () => set((state) => ({ open: !state.open })),
  setAgentModeContentPanelCollapsed: (collapsed) => {
    persistAgentModeContentPanelCollapsed(collapsed)
    set({ agentModeContentPanelCollapsed: collapsed })
  },
  toggleAgentModeContentPanelCollapsed: () => set((state) => {
    const collapsed = !state.agentModeContentPanelCollapsed
    persistAgentModeContentPanelCollapsed(collapsed)
    return { agentModeContentPanelCollapsed: collapsed }
  }),
}))
