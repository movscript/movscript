import { create } from 'zustand'
import type { ReactNode } from 'react'

interface AgentPanelUiStore {
  open: boolean
  detailHeaderActions: ReactNode | null
  setOpen: (open: boolean) => void
  toggleOpen: () => void
  setDetailHeaderActions: (actions: ReactNode | null) => void
}

export const useAgentPanelUiStore = create<AgentPanelUiStore>((set) => ({
  open: true,
  detailHeaderActions: null,
  setOpen: (open) => set({ open }),
  toggleOpen: () => set((state) => ({ open: !state.open })),
  setDetailHeaderActions: (detailHeaderActions) => set({ detailHeaderActions }),
}))
