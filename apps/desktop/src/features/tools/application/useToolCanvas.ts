import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import { modelKeys } from '@/shared/application/modelQueryKeys'
import { buildGenerationJobPayload } from '@movscript/resource-surface/data'
import { resourceKeys } from '@movscript/resource-surface/data'
import { publicModelId } from '@/shared/domain/modelDisplay'
import type { Job, NodeType, PublicModel, RawResource } from '@/types'
import { useTranslation } from 'react-i18next'
import { resolveGenerationJobTypeFromResourceCount } from '@movscript/core/generation'

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
    queryKey: modelKeys.capability(capability),
    queryFn: () => api.get(`/models?capability=${capability}`).then((r) => r.data),
  })
  const models = modelsData ?? []

  const { data: resourcesData } = useQuery<RawResource[]>({
    queryKey: resourceKeys.all,
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
      const selectedModel = models.find((model) => publicModelId(model) === state.modelId) ?? fallbackModel
      const modelId = state.modelId || (selectedModel ? publicModelId(selectedModel) : '')
      const jobType = resolveGenerationJobTypeFromResourceCount({
        outputType: capability,
        inputResourceCount: state.inputResources.length,
      })

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
