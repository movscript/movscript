import { stopLocalRuntimeDaemon } from '@movscript/local-runtime'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'

export type DesktopUpdateDaemonStopper = (
  homeDir: string,
  options?: { force?: boolean },
) => Promise<Record<string, unknown>>

export interface DesktopUpdateDaemonPreparationResult {
  homeDir: string
  ok: boolean
  daemonStatus?: string
  detail?: Record<string, unknown>
  error?: string
}

export async function prepareDaemonForDesktopUpdateInstall(input: {
  homeDir?: string
  stopDaemon?: DesktopUpdateDaemonStopper
  logger?: Pick<Console, 'warn'>
} = {}): Promise<DesktopUpdateDaemonPreparationResult> {
  const homeDir = input.homeDir?.trim() || resolveDesktopDefaultMovScriptWorkspaceDir()
  const stopDaemon = input.stopDaemon ?? stopLocalRuntimeDaemon
  const logger = input.logger ?? console

  try {
    const detail = await stopDaemon(homeDir, { force: true })
    const daemonStatus = stringField(detail.status)
    const ok = daemonStatus !== 'error'
    if (!ok) {
      logger.warn('[app-update] local runtime daemon reported an error while preparing update install', detail)
    }
    return {
      homeDir,
      ok,
      ...(daemonStatus ? { daemonStatus } : {}),
      detail,
    }
  } catch (error) {
    const message = errorMessage(error)
    logger.warn(`[app-update] failed to stop local runtime daemon before installing update: ${message}`, error)
    return {
      homeDir,
      ok: false,
      daemonStatus: 'error',
      error: message,
    }
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
