/// <reference types="vite/client" />

import type { AppSettings } from '@/lib/config'

type BackendStatus = {
  state: 'idle' | 'starting' | 'ready' | 'error' | 'stopped'
  baseURL: string
  pid?: number
  message?: string
}

type MCPServerStatus = {
  ok: boolean
  listening: boolean
  endpoint: string
  port?: number
  error?: string
}

declare global {
  interface Window {
    api?: {
      openFile?: () => Promise<string | null>
      saveFile?: (defaultPath?: string) => Promise<string | null>
      updateMCPContext?: (snapshot: unknown) => Promise<void>
      getMCPStatus?: () => Promise<MCPServerStatus>
      setAppSettings?: (settings: AppSettings) => Promise<void>
      onBackendStatus?: (handler: (status: BackendStatus) => void) => () => void
      getBackendStatus?: () => Promise<BackendStatus>
      openAdminConsole?: (input?: { baseURL?: string; path?: string }) => Promise<{ url: string }>
      clipVideo?: (input: {
        sourceData?: ArrayBuffer | Uint8Array
        sourcePath?: string
        sourceName?: string
        startMs: number
        endMs: number
        outputName?: string
        mode?: 'fast' | 'accurate'
        fadeInMs?: number
        fadeOutMs?: number
      }) => Promise<{
        ok: boolean
        outputPath?: string
        outputName?: string
        mode?: 'fast' | 'accurate'
        fallbackApplied?: boolean
        data?: Uint8Array
        size?: number
        mimeType?: string
        error?: string
        code?: string
        missingFilters?: string[]
      }>
      exportTimelineVideo?: (input: {
        clips: Array<{
          sourceData?: ArrayBuffer | Uint8Array
          sourceName?: string
          startMs: number
          endMs: number
          timelineStartMs?: number
          layerIndex?: number
          volume?: number
          muted?: boolean
          speed?: number
          fadeInMs?: number
          fadeOutMs?: number
          cropLeftPercent?: number
          cropRightPercent?: number
          cropTopPercent?: number
          cropBottomPercent?: number
        }>
        captions?: Array<{
          startMs: number
          endMs: number
          text: string
          layerIndex?: number
          fontSize?: number
          yPercent?: number
          textColor?: string
          boxOpacityPercent?: number
        }>
        audioClips?: Array<{
          sourceData?: ArrayBuffer | Uint8Array
          sourceName?: string
          startMs: number
          endMs: number
          timelineStartMs: number
          volume?: number
          fadeInMs?: number
          fadeOutMs?: number
        }>
        overlays?: Array<{
          sourceData?: ArrayBuffer | Uint8Array
          sourceName?: string
          sourceKind?: 'image' | 'video'
          startMs: number
          endMs: number
          sourceStartMs?: number
          sourceEndMs?: number
          layerIndex?: number
          fadeInMs?: number
          fadeOutMs?: number
          cropLeftPercent?: number
          cropRightPercent?: number
          cropTopPercent?: number
          cropBottomPercent?: number
          xPercent?: number
          yPercent?: number
          scalePercent?: number
          opacityPercent?: number
        }>
        outputName?: string
      }) => Promise<{
        ok: boolean
        outputName?: string
        data?: Uint8Array
        size?: number
        mimeType?: string
        error?: string
        code?: string
        missingFilters?: string[]
      }>
      getVideoClipStatus?: () => Promise<{
        available: boolean
        path?: string
        version?: string
        error?: string
        code?: 'FFMPEG_NOT_FOUND' | 'FFMPEG_UNAVAILABLE'
        expectedBundledPath?: string
        platform?: string
        arch?: string
      }>
      ensureAgentRuntime?: (input?: { baseURL?: string }) => Promise<{
        ok: boolean
        running: boolean
        managed: boolean
        started: boolean
        baseURL: string
        pid?: number
        error?: string
      }>
      onMCPOpenRoute?: (handler: (route: string) => void) => () => void
    }
  }
}

export {}
