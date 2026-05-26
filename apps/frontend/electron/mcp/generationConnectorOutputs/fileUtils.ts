export function decodeBase64Image(value: string): { bytes: Uint8Array; mimeType: string } {
  const trimmed = value.trim()
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(trimmed)
  const mimeType = match?.[1] ?? 'image/png'
  const raw = match?.[2] ?? trimmed
  return {
    bytes: new Uint8Array(Buffer.from(raw, 'base64')),
    mimeType,
  }
}

export function safeFilenameStem(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || 'webui-output'
}

export function mimeExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    default:
      return 'png'
  }
}

export function mimeTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/png'
}
