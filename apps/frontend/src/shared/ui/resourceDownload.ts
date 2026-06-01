import { createObjectUrl, revokeObjectUrl } from '@/shared/ui/objectUrl'
import { loadResourceBlob } from '@/shared/ui/resourceBlob'
import type { RawResource } from '@/types'

export async function downloadResource(resource: RawResource) {
  const blob = await loadResourceBlob(resource)
  const url = createObjectUrl(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = resource.name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  revokeObjectUrl(url)
}
