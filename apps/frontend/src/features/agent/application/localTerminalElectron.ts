import type {
  ElectronLocalTerminalCreateInput,
  ElectronLocalTerminalEvent,
  ElectronLocalTerminalKillInput,
  ElectronLocalTerminalResizeInput,
  ElectronLocalTerminalWriteInput,
} from '@/shared/contracts/electronApi'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

export function localTerminalAvailable(): boolean {
  return typeof readElectronApi()?.createLocalTerminal === 'function'
}

export async function createLocalTerminal(input: ElectronLocalTerminalCreateInput) {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.createLocalTerminal?.(input)
}

export async function writeLocalTerminal(input: ElectronLocalTerminalWriteInput) {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.writeLocalTerminal?.(input)
}

export async function resizeLocalTerminal(input: ElectronLocalTerminalResizeInput) {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.resizeLocalTerminal?.(input)
}

export async function killLocalTerminal(input: ElectronLocalTerminalKillInput) {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.killLocalTerminal?.(input)
}

export function subscribeLocalTerminalEvents(handler: (event: ElectronLocalTerminalEvent) => void) {
  if (typeof window === 'undefined') return undefined
  return readElectronApi()?.onLocalTerminalEvent?.(handler)
}
