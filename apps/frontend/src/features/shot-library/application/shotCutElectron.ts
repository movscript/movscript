import type { ElectronShotCutInput, ElectronShotCutResult } from '@/shared/contracts/electronApi'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

export async function analyzeMediaPipelineShotCuts(input: ElectronShotCutInput): Promise<ElectronShotCutResult | undefined> {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.analyzeMediaPipelineShotCuts?.(input)
}
