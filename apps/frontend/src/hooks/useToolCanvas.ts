import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { publicModelId } from '@/lib/modelDisplay'
import type { NodeType, PublicModel, RawResource } from '@/types'
import { useTranslation } from 'react-i18next'

export type ToolStatus = 'idle' | 'pending' | 'running' | 'done' | 'failed'

export interface ToolCanvasState {
  prompt: string
  modelId: string
  inputResources: RawResource[]
  status: ToolStatus
  outputResource: RawResource | undefined
  error: string | undefined
}

const TOOL_NODE_ID = 'tool-node-1'

function getStoredCanvasId(nodeType: NodeType): number | null {
  try {
    const raw = localStorage.getItem(`tool_canvas_${nodeType}`)
    return raw ? parseInt(raw, 10) : null
  } catch { return null }
}

function setStoredCanvasId(nodeType: NodeType, id: number) {
  try { localStorage.setItem(`tool_canvas_${nodeType}`, String(id)) } catch {}
}

function clearStoredCanvasId(nodeType: NodeType) {
  try { localStorage.removeItem(`tool_canvas_${nodeType}`) } catch {}
}

export function useToolCanvas(nodeType: NodeType, capability: 'image' | 'video', options?: { promptRequired?: boolean }) {
  const { t } = useTranslation()
  const canvasIdRef = useRef<number | null>(getStoredCanvasId(nodeType))
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [state, setState] = useState<ToolCanvasState>({
    prompt: '',
    modelId: '',
    inputResources: [],
    status: 'idle',
    outputResource: undefined,
    error: undefined,
  })

  const { data: modelsData } = useQuery<PublicModel[]>({
    queryKey: ['models', capability],
    queryFn: () => api.get(`/models?capability=${capability}`).then((r) => r.data),
  })
  const models = modelsData ?? []

  const { data: resourcesData } = useQuery<RawResource[]>({
    queryKey: ['resources'],
    queryFn: () => api.get('/resources').then((r) => r.data),
  })
  const resources = resourcesData ?? []

  useEffect(() => {
    if (models.length > 0 && !state.modelId) {
      setState((s) => ({ ...s, modelId: publicModelId(models[0]) }))
    }
  }, [models, state.modelId])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  async function ensureCanvas(): Promise<number> {
    if (canvasIdRef.current) {
      try {
        await api.get(`/canvases/${canvasIdRef.current}`)
        return canvasIdRef.current
      } catch {
        clearStoredCanvasId(nodeType)
        canvasIdRef.current = null
      }
    }
    const data = await api.post('/canvases', {
      name: t('tools.canvasName', { type: nodeType }),
      nodes: [],
      edges: [],
    }).then((r) => r.data as { ID: number })
    canvasIdRef.current = data.ID
    setStoredCanvasId(nodeType, data.ID)
    return data.ID
  }

  async function run() {
    if (options?.promptRequired !== false && !state.prompt.trim()) return
    if (pollRef.current) clearInterval(pollRef.current)

    setState((s) => ({ ...s, status: 'pending', error: undefined, outputResource: undefined }))

    try {
      const cid = await ensureCanvas()
      const fallbackModel = models[0]
      const modelId = state.modelId || (fallbackModel ? publicModelId(fallbackModel) : '')

      await api.put(`/canvases/${cid}`, {
        name: t('tools.canvasName', { type: nodeType }),
        nodes: [{
          node_id: TOOL_NODE_ID,
          type: nodeType,
          label: nodeType,
          pos_x: 100,
          pos_y: 100,
          data: JSON.stringify({
            source: 'ai',
            modelId,
            prompt: state.prompt,
            ...(state.inputResources[0] ? { resourceId: state.inputResources[0].ID } : {}),
            ...(state.inputResources.length > 1 ? { resourceIds: state.inputResources.map((r) => r.ID) } : {}),
          }),
        }],
        edges: [],
      })

      await api.post(`/canvases/${cid}/nodes/${TOOL_NODE_ID}/run`)
      setState((s) => ({ ...s, status: 'running' }))

      pollRef.current = setInterval(async () => {
        try {
          const task = await api.get(`/canvases/${cid}/nodes/${TOOL_NODE_ID}/task`).then((r) => r.data as { status: string; resource_id?: number; error?: string })
          if (task.status === 'done' || task.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current)
            let outputResource: RawResource | undefined
            if (task.resource_id) {
              const list = await api.get('/resources').then((r) => r.data as RawResource[])
              outputResource = list.find((r) => r.ID === task.resource_id)
            }
            setState((s) => ({
              ...s,
              status: task.status as ToolStatus,
              outputResource,
              error: task.error,
            }))
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current)
          setState((s) => ({ ...s, status: 'failed', error: t('tools.errors.pollFailed') }))
        }
      }, 2000)
    } catch (err: any) {
      setState((s) => ({ ...s, status: 'failed', error: err?.message ?? t('tools.errors.runFailed') }))
    }
  }

  function update(patch: Partial<ToolCanvasState>) {
    setState((s) => ({ ...s, ...patch }))
  }

  return {
    state,
    update,
    run,
    models,
    resources,
  }
}
