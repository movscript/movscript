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

export async function listSurfaceModelsByCapability(capability: SurfaceModelCapability): Promise<PublicModel[]> {
  const queryCapability = surfaceModelQueryCapability(capability)
  const response = await surfaceDataApi.get<PublicModel[]>(`/models?capability=${encodeURIComponent(queryCapability)}`)
  return Array.isArray(response.data) ? response.data : []
}
