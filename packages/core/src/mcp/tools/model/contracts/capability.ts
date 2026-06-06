export function normalizeModelCapabilityAlias(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/-/g, '_')
  switch (normalized) {
    case 'text':
    case 'reasoning':
    case 'image':
    case 'image_edit':
    case 'video':
    case 'video_i2v':
    case 'video_v2v':
    case 'audio':
    case 'audio_tts':
    case 'audio_transcribe':
    case 'subtitle_align':
    case 'render_video':
      return normalized
    case 'text_to_image':
    case 'image_generation':
    case 'prompt_to_image':
    case 't2i':
    case 'txt2img':
      return 'image'
    case 'image_to_image':
    case 'i2i':
    case 'img2img':
      return 'image_edit'
    case 'text_to_video':
    case 'video_generation':
    case 'prompt_to_video':
    case 't2v':
    case 'txt2video':
      return 'video'
    case 'image_to_video':
    case 'i2v':
    case 'img2video':
      return 'video_i2v'
    case 'video_to_video':
    case 'v2v':
      return 'video_v2v'
    case 'text_generation':
    case 'prompt_to_text':
      return 'text'
    case 'tts':
    case 'text_to_speech':
    case 'voiceover':
    case 'voiceover_generation':
      return 'audio_tts'
    case 'speech_to_text':
    case 'stt':
    case 'transcription':
      return 'audio_transcribe'
    case 'forced_alignment':
    case 'subtitle_alignment':
    case 'align_subtitles':
      return 'subtitle_align'
    case 'video_render':
    case 'ffmpeg_render':
    case 'render':
      return 'render_video'
    default:
      return undefined
  }
}
