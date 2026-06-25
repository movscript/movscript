export interface SurfaceStateStorage {
  getItem(name: string): string | null | Promise<string | null>
  setItem(name: string, value: string): unknown
  removeItem(name: string): unknown
}

export interface SurfaceStateStorageClient {
  createStateStorage(key: string, fallback: SurfaceStateStorage): SurfaceStateStorage
}

let stateStorageClient: SurfaceStateStorageClient | undefined

export function configureSurfaceStateStorageClient(client: SurfaceStateStorageClient): void {
  stateStorageClient = client
}

export function createSurfaceStateStorage(key: string, fallback: SurfaceStateStorage): SurfaceStateStorage {
  return stateStorageClient?.createStateStorage(key, fallback) ?? fallback
}
