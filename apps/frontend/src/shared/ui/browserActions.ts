import { createObjectUrl, revokeObjectUrl } from '@/shared/ui/objectUrl'

export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

export function scheduleUiReset(callback: () => void, delayMs: number): number {
  return window.setTimeout(callback, delayMs)
}

export function scrollElementIntoViewById(
  elementId: string,
  options: ScrollIntoViewOptions = { behavior: 'smooth', block: 'start' },
): void {
  document.getElementById(elementId)?.scrollIntoView(options)
}

export function downloadTextFile({
  text,
  filename,
  mimeType = 'text/plain;charset=utf-8',
}: {
  text: string
  filename: string
  mimeType?: string
}) {
  const blob = new Blob([text], { type: mimeType })
  const url = createObjectUrl(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  revokeObjectUrl(url)
}
