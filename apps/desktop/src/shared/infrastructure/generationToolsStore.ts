import { create } from 'zustand'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { createDesktopStateStorage } from '@/shared/infrastructure/desktopStateStorage'
import {
  createGenerationToolServer,
  DEFAULT_GENERATION_TOOLS_SETTINGS,
  normalizeGenerationToolsSettings,
  type GenerationToolsSettings,
  type GenerationToolServer,
  type GenerationToolServerType,
  type GenerationToolServerScope,
  type GenerationToolAuthKind,
} from '@/shared/infrastructure/generationTools'

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

export const GENERATION_TOOLS_SETTINGS_STORAGE_KEY = 'movscript-generation-tools-settings-v1'

const memoryGenerationToolsStorage: StateStorage = (() => {
  const values = new Map<string, string>()
  return {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      values.set(name, value)
    },
    removeItem: (name) => {
      values.delete(name)
    },
  }
})()

function getGenerationToolsStorage(): StateStorage {
  const fallback: StateStorage = typeof window === 'undefined' ? memoryGenerationToolsStorage : {
    getItem: (name) => readBrowserStorageItem('local', name),
    setItem: (name, value) => writeBrowserStorageItem('local', name, value),
    removeItem: (name) => removeBrowserStorageItem('local', name),
  }
  return createDesktopStateStorage(GENERATION_TOOLS_SETTINGS_STORAGE_KEY, fallback)
}

function syncElectronGenerationTools(settings: GenerationToolsSettings): void {
  if (typeof window === 'undefined') return
  void readElectronApi()?.setGenerationToolsSettings?.(settings)
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
      name: GENERATION_TOOLS_SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(getGenerationToolsStorage),
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
