import type {
  ElectronDesktopShellHostCreateInput,
  ElectronDesktopShellHostEvent,
  ElectronDesktopShellHostJob,
  ElectronDesktopShellHostJobInput,
  ElectronDesktopShellHostJobListInput,
  ElectronDesktopShellHostKillInput,
  ElectronDesktopShellHostListInput,
  ElectronDesktopShellHostLogsResult,
  ElectronDesktopShellHostResizeInput,
  ElectronDesktopShellHostRunInput,
  ElectronDesktopShellHostSession,
  ElectronDesktopShellHostSessionInput,
  ElectronDesktopShellHostWriteInput,
} from '@/shared/contracts/electronApiDesktopShellHost'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

export type DesktopShellHostSessionInput = ElectronDesktopShellHostCreateInput
export type DesktopShellHostRunInput = ElectronDesktopShellHostRunInput
export type DesktopShellHostListInput = ElectronDesktopShellHostListInput
export type DesktopShellHostSessionLookup = ElectronDesktopShellHostSessionInput
export type DesktopShellHostSession = ElectronDesktopShellHostSession
export type DesktopShellHostSessionLogs = ElectronDesktopShellHostLogsResult
export type DesktopShellHostJob = ElectronDesktopShellHostJob
export type DesktopShellHostJobInput = ElectronDesktopShellHostJobInput
export type DesktopShellHostJobListInput = ElectronDesktopShellHostJobListInput
export type DesktopShellHostResizeInput = ElectronDesktopShellHostResizeInput
export type DesktopShellHostWriteInput = ElectronDesktopShellHostWriteInput
export type DesktopShellHostKillInput = ElectronDesktopShellHostKillInput
export type DesktopShellHostEvent = ElectronDesktopShellHostEvent

export function desktopShellHostAvailable(): boolean {
  const api = readElectronApi()
  return typeof api?.createDesktopShellHostSession === 'function'
}

export async function createDesktopShellHostSession(input: DesktopShellHostSessionInput) {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.createDesktopShellHostSession?.(input)
}

export async function runDesktopShellHostCommand(input: DesktopShellHostRunInput) {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.runDesktopShellHostCommand?.(input)
}

export async function listDesktopShellHostSessions(input?: DesktopShellHostListInput) {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.listDesktopShellHostSessions?.(input)
}

export async function getDesktopShellHostSession(input: DesktopShellHostSessionLookup) {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.getDesktopShellHostSession?.(input)
}

export async function getDesktopShellHostLogs(input: DesktopShellHostSessionLookup) {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.getDesktopShellHostLogs?.(input)
}

export async function listDesktopShellHostJobs(input?: DesktopShellHostJobListInput) {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.listDesktopShellHostJobs?.(input)
}

export async function getDesktopShellHostJob(input: DesktopShellHostJobInput) {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.getDesktopShellHostJob?.(input)
}

export async function getDesktopShellHostJobLogs(input: DesktopShellHostJobInput) {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.getDesktopShellHostJobLogs?.(input)
}

export async function writeDesktopShellHost(input: DesktopShellHostWriteInput) {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.writeDesktopShellHost?.(input)
}

export async function resizeDesktopShellHostSession(input: DesktopShellHostResizeInput) {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.resizeDesktopShellHostSession?.(input)
}

export async function killDesktopShellHostSession(input: DesktopShellHostKillInput) {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.killDesktopShellHostSession?.(input)
}

export function subscribeDesktopShellHostEvents(handler: (event: DesktopShellHostEvent) => void) {
  if (typeof window === 'undefined') return undefined
  const api = readElectronApi()
  return api?.onDesktopShellHostEvent?.(handler)
}
