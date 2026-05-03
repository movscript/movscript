import { api } from '@/lib/api'

export type ScriptVersionStatus = 'draft' | 'active' | 'archived'
export type ScriptVersionSourceType = 'raw' | 'adapted' | 'revised' | 'ai'

export type ScriptVersion = {
  ID: number
  project_id: number
  script_id: number
  parent_version_id?: number | null
  version_number: number
  title: string
  source_type: ScriptVersionSourceType | string
  content: string
  raw_source: string
  summary: string
  status: ScriptVersionStatus | string
  created_by_id?: number | null
  CreatedAt: string
  UpdatedAt: string
}

export type CreateScriptVersionPayload = {
  script_id: number
  parent_version_id?: number | null
  version_number?: number
  title?: string
  source_type?: ScriptVersionSourceType | string
  content?: string
  raw_source?: string
  summary?: string
  status?: ScriptVersionStatus | string
}

export async function listScriptVersions(projectId: number, params: { scriptId?: number; status?: string } = {}) {
  const res = await api.get<ScriptVersion[]>(`/projects/${projectId}/entities/script-versions`, {
    params: {
      ...(params.scriptId ? { script_id: params.scriptId } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
  })
  return res.data
}

export async function createScriptVersion(projectId: number, payload: CreateScriptVersionPayload) {
  const res = await api.post<ScriptVersion>(`/projects/${projectId}/entities/script-versions`, payload)
  return res.data
}

export type PatchScriptVersionPayload = Partial<Pick<ScriptVersion, 'title' | 'status' | 'summary' | 'content' | 'raw_source' | 'source_type'>>

export async function patchScriptVersion(projectId: number, versionId: number, payload: PatchScriptVersionPayload) {
  const res = await api.patch<ScriptVersion>(`/projects/${projectId}/entities/script-versions/${versionId}`, payload)
  return res.data
}
