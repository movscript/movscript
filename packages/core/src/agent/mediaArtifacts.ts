import type { JSONValue } from './protocolJson.js'

export const MEDIA_ARTIFACTS_V1_SCHEMA = 'movscript.media.artifacts.v1'
export const MEDIA_PROVIDER_CONTRACT_V1_SCHEMA = 'movscript.media.provider_contract.v1'

export type MediaTimingSource = 'speech_timing' | 'forced_alignment' | 'speech_to_text' | 'manual'
export type MediaPipelineCapability = 'audio_generation'
export type AudioGenerationOperation =
  | 'text_to_speech'
  | 'speech_to_text'
  | 'speech_translate'
  | 'speech_to_speech'
  | 'voice_clone'
  | 'voice_design'
  | 'dubbing'
  | 'music_generation'
  | 'sound_effect_generation'
  | 'voice_isolation'
  | 'forced_alignment'
export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'json'
export type AudioFormat = 'mp3' | 'wav' | 'aac' | 'opus' | 'flac'
export type RenderOutputFormat = 'mp4' | 'mov' | 'webm'
export type RenderAspectRatio = '9:16' | '16:9' | '1:1' | '4:5'
export type MediaProviderFeature =
  | 'streaming'
  | 'ssml'
  | 'word_timestamps'
  | 'phoneme_timestamps'
  | 'viseme_timestamps'
  | 'voice_clone'
  | 'voice_design'
  | 'multi_speaker'
  | 'emotion_control'
  | 'speed_control'
  | 'pitch_control'
  | 'forced_alignment'

export interface MediaProviderParamDef {
  key: string
  label?: string
  type: 'string' | 'number' | 'boolean' | 'select'
  default?: JSONValue
  options?: Array<string | number | boolean>
  min?: number
  max?: number
  step?: number
}

export interface MediaModelContract {
  modelId: string
  displayName: string
  features: MediaProviderFeature[]
  supportedLanguages?: string[]
  supportedFormats?: string[]
  supportedParams: MediaProviderParamDef[]
}

export interface MediaCapabilityContract {
  capability: MediaPipelineCapability
  operation?: AudioGenerationOperation
  models: MediaModelContract[]
}

export interface MediaProviderContractV1 {
  schema: typeof MEDIA_PROVIDER_CONTRACT_V1_SCHEMA
  schemaVersion: 1
  provider: string
  displayName?: string
  capabilities: MediaCapabilityContract[]
}

export interface TimedTextUnit {
  id: string
  startMs: number
  endMs: number
  text: string
  confidence?: number
  speaker?: string
}

export interface TimingMetadata {
  source: MediaTimingSource
  provider?: string
  language?: string
  durationMs: number
  segments: TimedTextUnit[]
  words?: TimedTextUnit[]
  characters?: TimedTextUnit[]
}

export interface VoiceoverResourceRef {
  resourceId: number
  text: string
  voice: string
  language: string
  durationMs: number
  provider: string
  model?: string
  audioFormat?: AudioFormat
  timingSource?: MediaTimingSource
}

export interface SubtitleResourceRef {
  resourceId: number
  format: SubtitleFormat
  source: MediaTimingSource
  language: string
  relatedAudioResourceId: number
  confidence?: number
  styleId?: string
}

export interface RenderClipRef {
  resourceId: number
  startMs: number
  endMs: number
  trimStartMs?: number
  trimEndMs?: number
}

export interface SubtitleStyleRef {
  styleId?: string
  font?: string
  position?: 'bottom' | 'middle' | 'top'
  safeMarginPx?: number
  burnIn?: boolean
}

export interface RenderRecipe {
  aspectRatio: RenderAspectRatio
  resolution: string
  clips: RenderClipRef[]
  voiceoverResourceId: number
  subtitleResourceId?: number
  bgmResourceId?: number
  subtitleStyle?: SubtitleStyleRef
  outputFormat: RenderOutputFormat
}

export interface MediaArtifactsV1 {
  schema: typeof MEDIA_ARTIFACTS_V1_SCHEMA
  schemaVersion: 1
  projectId?: number
  voiceover: VoiceoverResourceRef
  timing: TimingMetadata
  subtitles?: SubtitleResourceRef[]
  renderRecipe?: RenderRecipe
}
