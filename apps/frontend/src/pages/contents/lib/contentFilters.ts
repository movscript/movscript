import type { URLSearchParamsInit } from 'react-router-dom'

export const CONTENT_FILTER_KEYS = [
  'q',
  'status',
  'kind',
  'segment_id',
  'scene_moment_id',
  'reference_id',
  'asset_slot_id',
  'content_unit_id',
  'selected',
] as const

export type ContentFilterKey = typeof CONTENT_FILTER_KEYS[number]

export function readStringParam(params: URLSearchParams, key: ContentFilterKey, fallback = '') {
  return params.get(key)?.trim() || fallback
}

export function readNumberParam(params: URLSearchParams, key: ContentFilterKey) {
  const value = Number(params.get(key))
  return Number.isFinite(value) && value > 0 ? value : null
}

export function updateContentFilterParams(
  params: URLSearchParams,
  updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>,
): URLSearchParamsInit {
  const next = new URLSearchParams(params)

  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '' || value === 'all') {
      next.delete(key)
      return
    }
    next.set(key, String(value))
  })

  return next
}

export function makeContentFilterSearch(updates: Partial<Record<ContentFilterKey, string | number | null | undefined>>) {
  const params = updateContentFilterParams(new URLSearchParams(), updates) as URLSearchParams
  const value = params.toString()
  return value ? `?${value}` : ''
}
