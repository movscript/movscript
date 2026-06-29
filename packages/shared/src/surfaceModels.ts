import type { PublicModel } from './surfaceTypes.js'
import { surfaceDataApi } from './surfaceHttpClient.js'

export type SurfaceModelCapability =
  | 'text'
  | 'image'
  | 'image_edit'
  | 'video'
  | 'video_i2v'
  | 'video_v2v'
  | 'audio'
  | 'audio_tts'
  | 'audio_transcribe'
  | 'audio_translate'
  | 'audio_music'
  | 'audio_sfx'
  | 'audio_chat'
  | 'voice_clone'
  | 'voice_design'
  | 'subtitle_align'
  | 'subtitle_translate'
  | string

export function surfaceModelQueryCapability(capability: SurfaceModelCapability): string {
  return capability === 'audio' ? 'audio_tts' : capability
}

export type SurfaceModelReferenceAssetIntent = {
  role: string
  media_type?: 'image' | 'video' | 'audio' | string
}

export type SurfaceModelListOptions = {
  operation?: string
  targetOutput?: 'image' | 'video' | 'audio' | 'text' | string
  resolveIntent?: boolean
  referenceAssets?: SurfaceModelReferenceAssetIntent[]
}

export function surfaceModelReferenceAssetsKey(referenceAssets: readonly SurfaceModelReferenceAssetIntent[] | undefined | null): string {
  if (!referenceAssets || referenceAssets.length === 0) return ''
  return JSON.stringify(referenceAssets.map((asset) => ({
    role: asset.role.trim(),
    ...(asset.media_type?.trim() ? { media_type: asset.media_type.trim() } : {}),
  })))
}

export async function listSurfaceModelsByCapability(capability: SurfaceModelCapability, options: SurfaceModelListOptions = {}): Promise<PublicModel[]> {
  const queryCapability = surfaceModelQueryCapability(capability)
  const params = new URLSearchParams()
  params.set('capability', queryCapability)
  if (options.operation?.trim()) params.set('operation', options.operation.trim())
  if (options.targetOutput?.trim()) params.set('target_output', options.targetOutput.trim())
  if (options.resolveIntent) params.set('resolve_intent', 'true')
  if (options.referenceAssets && options.referenceAssets.length > 0) {
    params.set('reference_assets', surfaceModelReferenceAssetsKey(options.referenceAssets))
  }
  const response = await surfaceDataApi.get<PublicModel[]>(`/models?${params.toString()}`)
  return Array.isArray(response.data) ? response.data : []
}
