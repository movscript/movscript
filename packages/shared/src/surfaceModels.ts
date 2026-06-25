import type { PublicModel } from './surfaceTypes.js'
import { surfaceDataApi } from './surfaceHttpClient.js'

export type SurfaceModelCapability = 'image' | 'video' | 'audio' | 'audio_tts' | 'text' | string

export function surfaceModelQueryCapability(capability: SurfaceModelCapability): string {
  return capability === 'audio' ? 'audio_tts' : capability
}

export async function listSurfaceModelsByCapability(capability: SurfaceModelCapability): Promise<PublicModel[]> {
  const queryCapability = surfaceModelQueryCapability(capability)
  const response = await surfaceDataApi.get<PublicModel[]>(`/models?capability=${encodeURIComponent(queryCapability)}`)
  return Array.isArray(response.data) ? response.data : []
}
