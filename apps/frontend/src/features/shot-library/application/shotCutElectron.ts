import type { ElectronShotCutInput, ElectronShotCutResult } from '@/shared/contracts/electronApi'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

export async function analyzeShotCuts(input: ElectronShotCutInput): Promise<ElectronShotCutResult | undefined> {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.analyzeShotCuts?.(input)
}
