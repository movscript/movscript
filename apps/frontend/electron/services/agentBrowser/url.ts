export function normalizeAgentBrowserURL(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('URL is required')

  const candidate = inferURLCandidate(trimmed)
  const url = new URL(candidate)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Agent browser only supports http and https URLs')
  }
  return url.toString()
}

function inferURLCandidate(input: string): string {
  if (/^https?:\/\//i.test(input)) return input
  if (/^localhost(?::\d+)?(?:[/?#].*)?$/i.test(input)) return `http://${input}`
  if (/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#].*)?$/.test(input)) return `http://${input}`
  if (/\s/.test(input) || !input.includes('.')) {
    return `https://www.google.com/search?q=${encodeURIComponent(input)}`
  }
  return `https://${input}`
}
