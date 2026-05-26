/// <reference types="vite/client" />

import type { ElectronAPI } from '@/shared/contracts/electronApi'

declare global {
  interface Window {
    api?: ElectronAPI
  }
}

export {}
