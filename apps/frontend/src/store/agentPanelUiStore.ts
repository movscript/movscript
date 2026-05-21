import { create } from 'zustand'

interface AgentPanelUiStore {
  open: boolean
  setOpen: (open: boolean) => void
  toggleOpen: () => void
}

export const useAgentPanelUiStore = create<AgentPanelUiStore>((set) => ({
  open: typeof window !== 'undefined' ? window.innerWidth >= 960 : true,
  setOpen: (open) => set({ open }),
  toggleOpen: () => set((state) => ({ open: !state.open })),
}))
