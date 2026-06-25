import type { ClipboardEvent } from 'react'

export function agentComposerClipboardFiles(event: ClipboardEvent): File[] {
  const directFiles = Array.from(event.clipboardData.files)
  if (directFiles.length > 0) return directFiles.map(normalizeClipboardFile)

  return Array.from(event.clipboardData.items)
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file)
    .map(normalizeClipboardFile)
}

function normalizeClipboardFile(file: File, index: number): File {
  if (file.name.trim()) return file
  return new File([file], `clipboard-${Date.now().toString(36)}-${index + 1}${extensionForMime(file.type)}`, {
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified,
  })
}

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/webp') return '.webp'
  if (mimeType === 'image/gif') return '.gif'
  if (mimeType === 'video/mp4') return '.mp4'
  if (mimeType === 'audio/mpeg') return '.mp3'
  if (mimeType === 'audio/wav') return '.wav'
  if (mimeType.startsWith('text/')) return '.txt'
  return ''
}
