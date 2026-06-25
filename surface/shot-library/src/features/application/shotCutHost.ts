import { readSurfaceHostApi, type SurfaceHostShotCutInput, type SurfaceHostShotCutResult } from '@movscript/shared'

export async function analyzeMediaPipelineShotCuts(input: SurfaceHostShotCutInput): Promise<SurfaceHostShotCutResult | undefined> {
  if (typeof window === 'undefined') return undefined
  const api = readSurfaceHostApi()
  return api?.analyzeMediaPipelineShotCuts?.(input)
}
