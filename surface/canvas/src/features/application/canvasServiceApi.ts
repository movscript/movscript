import { surfaceCanvasApi as canvasApi } from '@movscript/shared/surface-http'

export const canvasServicePaths = {
  canvases: '/canvas/canvases',
  canvas: (id: number | string) => `/canvas/canvases/${encodeURIComponent(String(id))}`,
  runtimeModels: '/canvas/runtime/models',
  runtimeText: '/canvas/runtime/text',
  runtimeMedia: '/canvas/runtime/media',
  runtimeTextResource: '/canvas/runtime/text-resource',
  runtimeJob: (id: number | string) => `/canvas/runtime/jobs/${encodeURIComponent(String(id))}`,
} as const

export { canvasApi }
