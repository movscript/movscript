import { api } from '@/lib/api'
import type { AssetSlot, Project } from '@/types'

export interface McpTools {
  listProjects: () => Promise<Project[]>
  getProject: (id: number) => Promise<Project>
  createProject: (data: { name: string; description?: string }) => Promise<Project>

  listScripts: (projectId: number) => Promise<unknown[]>
  getScript: (id: number) => Promise<unknown>
  updateScript: (id: number, data: Record<string, unknown>) => Promise<unknown>

  listAssetSlots: (projectId: number) => Promise<AssetSlot[]>
  createAssetSlot: (projectId: number, data: Record<string, unknown>) => Promise<AssetSlot>
  search: (projectId: number, query: string) => Promise<unknown>
}

export function createMcpTools(): McpTools {
  const get = <T>(path: string) => api.get<T>(path).then((r) => r.data)
  const post = <T>(path: string, body?: unknown) => api.post<T>(path, body).then((r) => r.data)
  const put = <T>(path: string, body?: unknown) => api.put<T>(path, body).then((r) => r.data)

  return {
    listProjects: () => get('/projects'),
    getProject: (id) => get(`/projects/${id}`),
    createProject: (data) => post('/projects', data),

    listScripts: (projectId) => get(`/projects/${projectId}/scripts`),
    getScript: (id) => get(`/scripts/${id}`),
    updateScript: (id, data) => put(`/scripts/${id}`, data),

    listAssetSlots: (projectId) => get(`/projects/${projectId}/entities/asset-slots`),
    createAssetSlot: (projectId, data) => post(`/projects/${projectId}/entities/asset-slots`, data),
    search: (projectId, query) => get(`/projects/${projectId}/entities/asset-slots?q=${encodeURIComponent(query)}`),
  }
}
