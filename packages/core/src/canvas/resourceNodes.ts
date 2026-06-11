export type CanvasResourceNodeType = 'image' | 'video' | 'text'

export interface CanvasResourceLike {
  ID?: number | string
  name?: string | null
  type?: string | null
  mime_type?: string | null
}

export interface CanvasFileLike {
  name: string
  type?: string | null
}

const IMAGE_FILE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif'])
const VIDEO_FILE_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'webm'])
const TEXT_FILE_EXTENSIONS = new Set(['txt', 'md', 'json', 'csv', 'ts', 'tsx', 'js', 'jsx', 'css', 'html', 'xml', 'yaml', 'yml', 'log'])

export function resourceToCanvasNodeType(resource: Pick<CanvasResourceLike, 'type'>): CanvasResourceNodeType | undefined {
  return resource.type === 'image' || resource.type === 'video' || resource.type === 'text'
    ? resource.type
    : undefined
}

export function canvasResourceMatchesSearch(resource: CanvasResourceLike, query: string): boolean {
  const term = query.trim().toLowerCase()
  if (!term) return true
  return [resource.ID, resource.name, resource.type, resource.mime_type]
    .some((value) => String(value ?? '').toLowerCase().includes(term))
}

export function fileToCanvasResourceNodeType(file: CanvasFileLike): CanvasResourceNodeType | undefined {
  const mime = String(file.type ?? '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('text/')) return 'text'
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (IMAGE_FILE_EXTENSIONS.has(ext)) return 'image'
  if (VIDEO_FILE_EXTENSIONS.has(ext)) return 'video'
  if (TEXT_FILE_EXTENSIONS.has(ext)) return 'text'
  return undefined
}
