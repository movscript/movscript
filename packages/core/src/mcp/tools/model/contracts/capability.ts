export function normalizeModelCapabilityAlias(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/-/g, '_')
  switch (normalized) {
    case 'text':
    case 'text_generation':
    case 'reasoning':
    case 'image':
    case 'image_generation':
    case 'image_edit':
    case 'video':
    case 'video_generation':
    case 'video_i2v':
    case 'video_v2v':
    case 'audio':
    case 'audio_generation':
    case 'audio_tts':
    case 'audio_transcribe':
    case 'audio_translate':
    case 'audio_music':
    case 'audio_sfx':
    case 'audio_chat':
    case 'voice_clone':
    case 'voice_design':
    case 'subtitle_align':
    case 'subtitle_translate':
      return normalized
    case 'tts':
      return 'audio_tts'
    case 'speech_translate':
      return 'audio_translate'
    case 'stt':
      return 'audio_transcribe'
    case 'music':
      return 'audio_music'
    case 'sfx':
      return 'audio_sfx'
    default:
      return undefined
  }
}
