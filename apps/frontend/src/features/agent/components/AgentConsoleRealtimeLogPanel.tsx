import {
  useEffect,
  useMemo,
  useRef,
  useState } from 'react'
import { Terminal } from 'lucide-react'

import {
  AgentConsoleInlineError,
  AgentConsolePanel,
  AgentConsolePanelActions,
  AgentConsoleStatusBadge,
} from '@/features/agent/components/AgentConsoleUi'
import {
  AgentConsoleLogEmpty,
  AgentConsoleLogLine,
  AgentConsoleLogLineStream,
  AgentConsoleLogLineText,
  AgentConsoleLogLineTime,
  AgentConsoleLogStream,
  AgentConsoleLogSummary,
  AgentConsoleLogSummaryItem,
  AgentConsoleLogSummaryLabel,
  AgentConsoleLogSummaryValue,
} from '@/features/agent/components/AgentConsoleRealtimeLogUi'
import { appServerAccountSourceLabel } from '@/features/agent/application/appServerConfigDisplay'
import { subscribeAppServerLogs } from '@/features/agent/application/appServerLogElectron'
import type { ElectronAppServerConfigStatus, ElectronAppServerLogEvent, ElectronAppServerStatus, ElectronMovScriptWorkspaceContext } from '@/shared/contracts/electronApi'

const APP_SERVER_LOG_LINE_LIMIT = 500
const ANSI_ESCAPE_SEQUENCE_PATTERN = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g
const ANSI_SGR_FRAGMENT_PATTERN = /\[(?:\d{1,3}(?:;\d{1,3})*)m/g

type AppServerLogLine = ElectronAppServerLogEvent & {
  id: string
  text: string
  providerLabel?: string
}

export type AppServerLogProfile = {
  profileId: string
  providerLabel: string
}

export function useAppServerRealtimeLogs(profiles: AppServerLogProfile[]): AppServerLogLine[] {
  const [logs, setLogs] = useState<AppServerLogLine[]>([])
  const sequenceRef = useRef(0)
  const profileKey = useMemo(
    () => profiles.map((profile) => `${profile.profileId}:${profile.providerLabel}`).sort().join('|'),
    [profiles],
  )

  useEffect(() => {
    setLogs([])
    sequenceRef.current = 0
    const profileLabelsById = new Map(profiles.map((profile) => [profile.profileId, profile.providerLabel]))
    if (profileLabelsById.size === 0) return undefined
    const unsubscribe = subscribeAppServerLogs((event) => {
      const providerLabel = profileLabelsById.get(event.profileId)
      if (!providerLabel) return
      const rawLines = sanitizeAppServerLogText(event.chunk).replace(/\r\n/g, '\n').split('\n')
      const lines = rawLines.filter((line, index) => line.length > 0 || index === 0)
      if (lines.length === 0) return
      setLogs((current) => {
        const next = [
          ...current,
          ...lines.map((line) => ({
            ...event,
            id: `${event.at}:${event.stream}:${sequenceRef.current++}`,
            text: line,
            providerLabel,
          })),
        ]
        return next.length > APP_SERVER_LOG_LINE_LIMIT ? next.slice(next.length - APP_SERVER_LOG_LINE_LIMIT) : next
      })
    })
    return unsubscribe
  }, [profileKey])

  return logs
}

export function sanitizeAppServerLogText(text: string): string {
  return text
    .replace(ANSI_ESCAPE_SEQUENCE_PATTERN, '')
    .replace(ANSI_SGR_FRAGMENT_PATTERN, '')
}

export function AppServerRealtimeLogPanel({
  logs,
  status,
  profiles,
  primaryProfileId,
  primaryProviderLabel,
}: {
  logs: AppServerLogLine[]
  status?: ElectronAppServerStatus
  profiles: AppServerLogProfile[]
  primaryProfileId: string
  primaryProviderLabel: string
}) {
  const streamRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const element = streamRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [logs])

  const config = status?.config
  return (
    <AgentConsolePanel
      title="app-server 实时日志"
      icon={<Terminal size={14} />}
      action={
        <AgentConsolePanelActions>
          <AgentConsoleStatusBadge intent={status?.running ? 'success' : 'neutral'} emphasis="soft">
            {status?.running ? '运行中' : '未启动'}
          </AgentConsoleStatusBadge>
          <AgentConsoleStatusBadge intent={logs.length > 0 ? 'success' : 'neutral'} emphasis="soft">
            {logs.length} 行
          </AgentConsoleStatusBadge>
        </AgentConsolePanelActions>
      }
    >
      <AgentConsoleLogSummary>
        <LogSummaryItem label="Primary" value={primaryProviderLabel} />
        <LogSummaryItem label="Primary Profile" value={primaryProfileId} />
        <LogSummaryItem label="Listening" value={formatAppServerLogProfiles(profiles)} />
        <LogSummaryItem label="PID" value={status?.pid ? String(status.pid) : '-'} />
        <LogSummaryItem label="Endpoint" value={status?.endpoint ?? '-'} />
        <LogSummaryItem label="Home" value={status?.home ?? '-'} />
        <LogSummaryItem label="CWD" value={status?.providerSessionCwd ?? '-'} />
        <LogSummaryItem label="Workspace" value={formatWorkspaceContext(status?.workspaceContext)} />
        <LogSummaryItem label="Runtime Endpoint" value={config?.baseURL ?? '-'} />
        <LogSummaryItem label="Account" value={formatAppServerAccount(config)} />
        <LogSummaryItem label="RUST_LOG" value={status?.rustLog ?? '-'} />
      </AgentConsoleLogSummary>
      {status?.error ? <AgentConsoleInlineError>{status.error}</AgentConsoleInlineError> : null}
      <AgentConsoleLogStream ref={streamRef} data-testid="agent-console-app-server-log-stream">
        {logs.length === 0 ? (
          <AgentConsoleLogEmpty>等待 app-server 输出。</AgentConsoleLogEmpty>
        ) : (
          logs.map((line) => (
            <AgentConsoleLogLine key={line.id} data-stream={line.stream}>
              <AgentConsoleLogLineTime>{formatLogTime(line.at)}</AgentConsoleLogLineTime>
              <AgentConsoleLogLineStream>{line.stream}</AgentConsoleLogLineStream>
              <AgentConsoleLogLineStream title={line.profileId}>{line.providerLabel ?? line.profileId}</AgentConsoleLogLineStream>
              <AgentConsoleLogLineText>{line.text}</AgentConsoleLogLineText>
            </AgentConsoleLogLine>
          ))
        )}
      </AgentConsoleLogStream>
    </AgentConsolePanel>
  )
}

function LogSummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <AgentConsoleLogSummaryItem>
      <AgentConsoleLogSummaryLabel>{label}</AgentConsoleLogSummaryLabel>
      <AgentConsoleLogSummaryValue title={value}>{value}</AgentConsoleLogSummaryValue>
    </AgentConsoleLogSummaryItem>
  )
}

function formatWorkspaceContext(context?: ElectronMovScriptWorkspaceContext): string {
  if (!context) return '-'
  return [
    context.scope ?? 'global',
    context.projectId ? `project=${context.projectId}` : undefined,
    context.productionId ? `production=${context.productionId}` : undefined,
  ].filter(Boolean).join(' / ')
}

function formatAppServerAccount(config?: ElectronAppServerConfigStatus): string {
  return appServerAccountSourceLabel(config)
}

function formatAppServerLogProfiles(profiles: AppServerLogProfile[]): string {
  if (profiles.length === 0) return '-'
  return profiles.map((profile) => `${profile.providerLabel} (${profile.profileId})`).join(', ')
}

function formatLogTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
