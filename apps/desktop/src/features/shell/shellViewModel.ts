import {
  shellStatusLabel,
  type ShellJob,
  type ShellSession,
} from '@/features/shell/ShellWorkbenchModel'

export type ShellJobMetaItem = {
  label: string
  value: string
}

export function shellSessionSubtitle(session: ShellSession, disabled: boolean): string {
  if (session.command) return session.command
  if (session.cwd) return session.cwd
  return shellStatusLabel(session.status, disabled)
}

export function shellSessionScopeLabel(session: ShellSession | undefined): string {
  if (!session) return '空闲'
  const ownerLabel = session.owner === 'system' ? '系统' : '用户'
  const scopeLabel = session.scope === 'home'
    ? 'Home'
    : session.scope === 'workspace'
      ? '工作区'
      : '当前窗口'
  return `${ownerLabel} / ${scopeLabel}`
}

export function shellJobProgressPercent(progress: number | undefined): number | undefined {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return undefined
  const normalized = progress <= 1 ? progress * 100 : progress
  return Math.min(100, Math.max(0, normalized))
}

export function shellJobPreviewUrl(job: ShellJob): string | undefined {
  const previewUrl = job.previewUrl?.trim()
  return previewUrl || undefined
}

export function shellJobMetaItems(job: ShellJob): ShellJobMetaItem[] {
  return [
    ...(job.cwd ? [{ label: '工作目录', value: job.cwd }] : []),
    ...(job.command ? [{ label: '命令', value: job.command }] : []),
  ]
}

export function compactShellId(value: string): string {
  if (value.length <= 18) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}
