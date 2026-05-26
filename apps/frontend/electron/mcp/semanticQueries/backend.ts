export { backendList } from '../backendList'
export { resolveToolProjectId } from '../toolValues'

export function withQuery(path: string, params: Record<string, unknown>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query.set(key, String(value))
  }
  const serialized = query.toString()
  return serialized ? path + '?' + serialized : path
}
