import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  detail?: string
}

interface ToastStore {
  toasts: ToastItem[]
  debugMode: boolean
  toggleDebugMode: () => void
  add: (message: string, type: ToastType, detail?: string) => void
  remove: (id: string) => void
}

export const useToastStore = create<ToastStore>()(
  persist(
    (set) => ({
      toasts: [],
      debugMode: false,
      toggleDebugMode: () => set((s) => ({ debugMode: !s.debugMode })),
      add: (message, type, detail) => {
        const id = `${Date.now()}-${Math.random()}`
        set((s) => ({ toasts: [...s.toasts, { id, message, type, detail }] }))
        setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
        }, detail ? 8000 : 4000)
      },
      remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    { name: 'toast-debug', partialize: (s) => ({ debugMode: s.debugMode }) }
  )
)

// Imperative helper — safe to call outside React (e.g. axios interceptors)
export const toast = {
  success: (msg: string, detail?: string) => useToastStore.getState().add(msg, 'success', detail),
  error: (msg: string, detail?: string) => useToastStore.getState().add(msg, 'error', detail),
  info: (msg: string, detail?: string) => useToastStore.getState().add(msg, 'info', detail),
  isDebug: () => useToastStore.getState().debugMode,
}
