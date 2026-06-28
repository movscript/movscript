import { surfaceCanvasApi as canvasApi } from '@movscript/shared/surface-http'

export const canvasServicePaths = {
  canvases: '/v1/canvas/canvases',
  canvas: (id: number | string) => `/v1/canvas/canvases/${encodeURIComponent(String(id))}`,
  runtimeModels: '/v1/canvas/runtime/models',
  runtimeText: '/v1/canvas/runtime/text',
  runtimeMedia: '/v1/canvas/runtime/media',
  runtimeTextResource: '/v1/canvas/runtime/text-resource',
  runtimeJob: (id: number | string) => `/v1/canvas/runtime/jobs/${encodeURIComponent(String(id))}`,
} as const

export { canvasApi }
