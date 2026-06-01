import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import { buildGenerationJobPayload } from '@/features/resources/domain/generationJobPayload'
import { publicModelId } from '@/shared/domain/modelDisplay'
import type { Job, NodeType, PublicModel, RawResource } from '@/types'
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

export function useToolCanvas(nodeType: NodeType, capability: 'image' | 'video', options?: { promptRequired?: boolean }) {
  const { t } = useTranslation()
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

  async function run() {
    if (options?.promptRequired !== false && !state.prompt.trim()) return
    if (pollRef.current) clearInterval(pollRef.current)

    setState((s) => ({ ...s, status: 'pending', error: undefined, outputResource: undefined }))

    try {
      const fallbackModel = models[0]
      const modelId = state.modelId || (fallbackModel ? publicModelId(fallbackModel) : '')
      const jobType = capability === 'video'
        ? (state.inputResources.length > 0 ? 'video_i2v' : 'video')
        : (state.inputResources.length > 0 ? 'image_edit' : 'image')

      const job = await api.post('/jobs', buildGenerationJobPayload({
        modelId,
        jobType,
        title: t('tools.canvasName', { type: nodeType }),
        prompt: state.prompt,
        params: {},
        inputResourceIds: state.inputResources.map((resource) => resource.ID),
        sourceKey: nodeType,
      })).then((r) => r.data as Job)
      setState((s) => ({ ...s, status: 'running' }))

      pollRef.current = setInterval(async () => {
        try {
          const latest = await api.get(`/jobs/${job.ID}`).then((r) => r.data as Job)
          if (latest.status === 'succeeded' || latest.status === 'failed' || latest.status === 'cancelled') {
            if (pollRef.current) clearInterval(pollRef.current)
            setState((s) => ({
              ...s,
              status: latest.status === 'succeeded' ? 'done' : 'failed',
              outputResource: latest.output_resource,
              error: latest.error_msg,
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
