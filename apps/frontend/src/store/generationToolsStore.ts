import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  createGenerationToolServer,
  DEFAULT_GENERATION_TOOLS_SETTINGS,
  normalizeGenerationToolsSettings,
  type GenerationToolsSettings,
  type GenerationToolServer,
  type GenerationToolServerType,
  type GenerationToolServerScope,
  type GenerationToolAuthKind,
} from '@/lib/generationTools'

export {
  createGenerationToolServer,
  DEFAULT_GENERATION_TOOLS_SETTINGS,
  normalizeGenerationToolsSettings,
}
export type {
  GenerationToolsSettings,
  GenerationToolServer,
  GenerationToolServerType,
  GenerationToolServerScope,
  GenerationToolAuthKind,
}

interface GenerationToolsStore {
  settings: GenerationToolsSettings
  savedAt: string | null
  hydrated: boolean
  setSettings: (settings: GenerationToolsSettings) => void
  reset: () => void
}

function syncElectronGenerationTools(settings: GenerationToolsSettings): void {
  if (typeof window === 'undefined') return
  void window.api?.setGenerationToolsSettings?.(settings)
}

export const useGenerationToolsStore = create<GenerationToolsStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_GENERATION_TOOLS_SETTINGS,
      savedAt: null,
      hydrated: false,
      setSettings: (settings) => {
        const normalized = normalizeGenerationToolsSettings(settings)
        set({
          settings: normalized,
          savedAt: new Date().toISOString(),
        })
        syncElectronGenerationTools(normalized)
      },
      reset: () => {
        set({
          settings: DEFAULT_GENERATION_TOOLS_SETTINGS,
          savedAt: new Date().toISOString(),
        })
        syncElectronGenerationTools(DEFAULT_GENERATION_TOOLS_SETTINGS)
      },
    }),
    {
      name: 'movscript-generation-tools-settings-v1',
      partialize: (state) => ({ settings: state.settings, savedAt: state.savedAt }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<GenerationToolsStore> | undefined
        return {
          ...currentState,
          ...persisted,
          settings: normalizeGenerationToolsSettings(persisted?.settings),
          hydrated: true,
        }
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.settings = normalizeGenerationToolsSettings(state.settings)
        state.hydrated = true
        syncElectronGenerationTools(state.settings)
      },
    },
  ),
)
