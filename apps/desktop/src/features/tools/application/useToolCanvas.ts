import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import { modelKeys } from '@/shared/application/modelQueryKeys'
import { buildGenerationJobPayload } from '@movscript/resource-surface/data'
import { resourceKeys } from '@movscript/resource-surface/data'
import { publicModelId } from '@/shared/domain/modelDisplay'
import type { Job, NodeType, PublicModel, RawResource } from '@/types'
import { useTranslation } from 'react-i18next'
import {
  generationExecutionJobTypeForIntent,
  type GenerationIntentPayload,
} from '@movscript/core/generation'

export type ToolStatus = 'idle' | 'pending' | 'running' | 'done' | 'failed'

export interface ToolCanvasState {
  prompt: string
  modelId: string
  inputResources: RawResource[]
  status: ToolStatus
  outputResource: RawResource | undefined
  error: string | undefined
}

export function useToolCanvas(nodeType: NodeType, capability: 'image' | 'video', options?: { promptRequired?: boolean; modelOperation?: string }) {
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
    queryKey: modelKeys.intent(capability, options?.modelOperation),
    queryFn: () => api.get('/models', { params: {
      capability: capability === 'image' ? 'image_generation' : 'video_generation',
      ...(options?.modelOperation ? { operation: options.modelOperation } : {}),
    } }).then((r) => r.data),
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
      const generationIntent = generationIntentForTool(capability, options?.modelOperation, state.inputResources)
      const jobType = generationExecutionJobTypeForIntent(generationIntent, capability)

      const job = await api.post('/jobs', buildGenerationJobPayload({
        modelId,
        jobType,
        title: t('tools.canvasName', { type: nodeType }),
        prompt: state.prompt,
        params: {},
        generationIntent,
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

function generationIntentForTool(
  outputKind: 'image' | 'video',
  operation: string | undefined,
  resources: readonly RawResource[],
): GenerationIntentPayload {
  const refs = resources.map((resource) => ({
    role: referenceAssetRoleForToolResource(resource),
    media_type: referenceAssetMediaTypeForToolResource(resource),
    resource_id: resource.ID,
  }))
  if (outputKind === 'image') {
    return {
      capability: 'image_generation',
      operation: operation ?? 'prompt_to_image',
      ...(refs.length > 0 ? { reference_assets: refs } : {}),
    }
  }
  return {
    capability: 'video_generation',
    operation: operation ?? 'prompt_to_video',
    ...(refs.length > 0 ? { reference_assets: refs } : {}),
  }
}

function referenceAssetRoleForToolResource(resource: RawResource): string {
  switch (resource.type) {
    case 'video':
      return 'reference_video'
    case 'audio':
      return 'reference_audio'
    case 'image':
      return 'reference_image'
    default:
      return 'generic'
  }
}

function referenceAssetMediaTypeForToolResource(resource: RawResource): 'image' | 'video' | 'audio' | undefined {
  switch (resource.type) {
    case 'image':
    case 'video':
    case 'audio':
      return resource.type
    default:
      return undefined
  }
}
