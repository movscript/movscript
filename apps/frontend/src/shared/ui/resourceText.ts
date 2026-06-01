import { api } from '@/shared/infrastructure/api'

export async function loadResourceTextUrl(url: string): Promise<string> {
  const res = await api.get<string>(url, {
    baseURL: '',
    responseType: 'text',
    transformResponse: [(data) => data],
  })
  return typeof res.data === 'string' ? res.data : String(res.data ?? '')
}
