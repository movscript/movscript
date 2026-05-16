import { api } from '@/lib/api'

export async function downloadAdminCSV(path: string, params: Record<string, unknown>, filename: string) {
  const response = await api.get(path, {
    params: { ...params, limit: 5000 },
    responseType: 'blob',
  })
  const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
