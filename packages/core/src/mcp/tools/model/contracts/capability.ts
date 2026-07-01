export function normalizeModelCapabilityAlias(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/-/g, '_')
  switch (normalized) {
    case 'text_generation':
    case 'image_generation':
    case 'video_generation':
    case 'audio_generation':
    case 'embedding':
    case 'rerank':
    case 'moderation':
      return normalized
    default:
      return undefined
  }
}
