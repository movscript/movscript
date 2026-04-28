import { api } from '@/lib/api'
import type { Project, Asset, Episode, Scene, Storyboard, Shot } from '@/types'

export interface McpTools {
  listProjects: () => Promise<Project[]>
  getProject: (id: number) => Promise<Project>
  createProject: (data: { name: string; description?: string }) => Promise<Project>

  listScripts: (projectId: number) => Promise<unknown[]>
  getScript: (id: number) => Promise<unknown>
  updateScript: (id: number, data: Record<string, unknown>) => Promise<unknown>

  listEpisodes: (scriptId: number) => Promise<Episode[]>
  updateEpisode: (id: number, data: Record<string, unknown>) => Promise<Episode>

  listScenes: (projectId: number) => Promise<Scene[]>
  updateScene: (id: number, data: Record<string, unknown>) => Promise<Scene>
  createScene: (projectId: number, data: Record<string, unknown>) => Promise<Scene>

  listStoryboards: (sceneId: number) => Promise<Storyboard[]>
  createStoryboard: (sceneId: number, data: Record<string, unknown>) => Promise<Storyboard>
  updateStoryboard: (id: number, data: Record<string, unknown>) => Promise<Storyboard>

  listShots: (storyboardId: number) => Promise<Shot[]>
  createShot: (storyboardId: number, data: Record<string, unknown>) => Promise<Shot>
  updateShot: (id: number, data: Record<string, unknown>) => Promise<Shot>

  listAssets: (projectId: number) => Promise<Asset[]>
  createAsset: (projectId: number, data: Record<string, unknown>) => Promise<Asset>
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

    listEpisodes: (scriptId) => get(`/scripts/${scriptId}/episodes`),
    updateEpisode: (id, data) => put(`/episodes/${id}`, data),

    listScenes: (projectId) => get(`/projects/${projectId}/scenes`),
    updateScene: (id, data) => put(`/scenes/${id}`, data),
    createScene: (projectId, data) => post(`/projects/${projectId}/scenes`, data),

    listStoryboards: (sceneId) => get(`/scenes/${sceneId}/storyboards`),
    createStoryboard: (sceneId, data) => post(`/scenes/${sceneId}/storyboards`, data),
    updateStoryboard: (id, data) => put(`/storyboards/${id}`, data),

    listShots: (storyboardId) => get(`/storyboards/${storyboardId}/shots`),
    createShot: (storyboardId, data) => post(`/storyboards/${storyboardId}/shots`, data),
    updateShot: (id, data) => put(`/shots/${id}`, data),

    listAssets: (projectId) => get(`/projects/${projectId}/assets`),
    createAsset: (projectId, data) => post(`/projects/${projectId}/assets`, data),
    search: (projectId, query) => get(`/projects/${projectId}/assets?q=${encodeURIComponent(query)}`),
  }
}
