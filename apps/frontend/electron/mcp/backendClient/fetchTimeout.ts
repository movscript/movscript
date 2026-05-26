import { clampNumber } from '../paramValues'

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMS: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), clampNumber(timeoutMS, 1000, 600000))
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}
