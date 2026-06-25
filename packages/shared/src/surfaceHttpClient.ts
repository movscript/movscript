export type SurfaceHttpRequestConfig = Record<string, any>

export interface SurfaceHttpResponse<T = any> {
  data: T
  [key: string]: any
}

export interface SurfaceHttpClient {
  get<T = any>(url: string, config?: SurfaceHttpRequestConfig): Promise<SurfaceHttpResponse<T>>
  post<T = any>(url: string, data?: any, config?: SurfaceHttpRequestConfig): Promise<SurfaceHttpResponse<T>>
  put<T = any>(url: string, data?: any, config?: SurfaceHttpRequestConfig): Promise<SurfaceHttpResponse<T>>
  patch<T = any>(url: string, data?: any, config?: SurfaceHttpRequestConfig): Promise<SurfaceHttpResponse<T>>
  delete<T = any>(url: string, config?: SurfaceHttpRequestConfig): Promise<SurfaceHttpResponse<T>>
}

export interface SurfaceHttpClients {
  data?: SurfaceHttpClient
  canvas?: SurfaceHttpClient
}

let dataClient: SurfaceHttpClient | undefined
let canvasClient: SurfaceHttpClient | undefined

export function configureSurfaceHttpClients(clients: SurfaceHttpClients): void {
  if (clients.data) dataClient = clients.data
  if (clients.canvas) canvasClient = clients.canvas
}

export function readSurfaceDataHttpClient(): SurfaceHttpClient {
  if (!dataClient) throw new Error('Surface data HTTP client is not configured.')
  return dataClient
}

export function readSurfaceCanvasHttpClient(): SurfaceHttpClient {
  if (!canvasClient) throw new Error('Surface canvas HTTP client is not configured.')
  return canvasClient
}

export const surfaceDataApi: SurfaceHttpClient = {
  get: (url, config) => readSurfaceDataHttpClient().get(url, config),
  post: (url, data, config) => readSurfaceDataHttpClient().post(url, data, config),
  put: (url, data, config) => readSurfaceDataHttpClient().put(url, data, config),
  patch: (url, data, config) => readSurfaceDataHttpClient().patch(url, data, config),
  delete: (url, config) => readSurfaceDataHttpClient().delete(url, config),
}

export const surfaceCanvasApi: SurfaceHttpClient = {
  get: (url, config) => readSurfaceCanvasHttpClient().get(url, config),
  post: (url, data, config) => readSurfaceCanvasHttpClient().post(url, data, config),
  put: (url, data, config) => readSurfaceCanvasHttpClient().put(url, data, config),
  patch: (url, data, config) => readSurfaceCanvasHttpClient().patch(url, data, config),
  delete: (url, config) => readSurfaceCanvasHttpClient().delete(url, config),
}
