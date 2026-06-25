import { create } from 'zustand'

interface EditingHeaderState {
  active: boolean
  title: string
  canSave: boolean
  canRender: boolean
  busy: boolean
  onSave?: () => void
  onCreatePreview?: () => void
  onRenderMp4?: () => void
  setHeader: (patch: Partial<Omit<EditingHeaderState, 'setHeader' | 'reset'>>) => void
  reset: () => void
}

const INITIAL_STATE: Omit<EditingHeaderState, 'setHeader' | 'reset'> = {
  active: false,
  title: '',
  canSave: false,
  canRender: false,
  busy: false,
  onSave: undefined,
  onCreatePreview: undefined,
  onRenderMp4: undefined,
}

export const useEditingHeaderStore = create<EditingHeaderState>((set) => ({
  ...INITIAL_STATE,
  setHeader: (patch) => set((state) => ({ ...state, ...patch })),
  reset: () => set({ ...INITIAL_STATE }),
}))
