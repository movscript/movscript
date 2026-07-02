import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, RefreshCw, Square, TerminalSquare } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'
import { recordValue } from '../../data.js'
import { useProjectSurfaceRuntime } from '../../runtime/index.js'
import {
  AgentSurfaceKeyValues,
  AgentSurfacePanel,
  AgentSurfaceShell,
} from '../AgentSurfaceShell.js'
import './ProjectRemotionStudioSurface.css'

export interface ProjectRemotionStudioSurfaceProps {
  params?: URLSearchParams
}

type RemotionStudioStatus = 'checking' | 'installing' | 'starting' | 'ready' | 'failed' | 'stopped' | 'blocked'

interface RemotionStudioLogEntry {
  cursor?: string
  at?: string
  stream: string
  text: string
}

export function ProjectRemotionStudioSurface({ params }: ProjectRemotionStudioSurfaceProps) {
  const runtime = useProjectSurfaceRuntime()
  const gateway = runtime.gateways.remotionStudio
  const queryClient = useQueryClient()
  const lookup = useMemo(() => {
    const sessionId = params?.get('sessionId') ?? params?.get('session_id') ?? undefined
    const workspaceId = params?.get('workspaceId') ?? params?.get('workspace_id') ?? undefined
    const projectDirectory = params?.get('projectDirectory') ?? params?.get('project_directory') ?? runtime.project.projectDir
    return {
      ...(sessionId ? { sessionId, session_id: sessionId } : {}),
      ...(workspaceId ? { workspaceId, workspace_id: workspaceId } : {}),
      ...(projectDirectory ? { projectDirectory, project_directory: projectDirectory } : {}),
    }
  }, [params, runtime.project.projectDir])
  const canLookup = Object.keys(lookup).length > 0
  const sessionQuery = useQuery({
    queryKey: ['project-surface', 'remotion-studio-session', lookup],
    queryFn: async () => {
      if (!gateway) throw new Error('Remotion Studio gateway is not available.')
      const response = await gateway.get(lookup)
      return recordValue(response) ?? {}
    },
    enabled: Boolean(gateway && canLookup),
    refetchInterval: (query) => {
      const status = remotionStudioStatus(query.state.data)
      return status === 'checking' || status === 'installing' || status === 'starting' ? 1000 : false
    },
  })
  const stopSession = useMutation({
    mutationFn: async () => {
      if (!gateway) throw new Error('Remotion Studio gateway is not available.')
      return recordValue(await gateway.stop(lookup)) ?? {}
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-surface', 'remotion-studio-session'] })
    },
  })
  const session = recordValue(stopSession.data) ?? recordValue(sessionQuery.data)
  const sessionId = stringValue(session?.sessionId ?? session?.session_id ?? lookup.sessionId)
  const status = remotionStudioStatus(session) ?? (sessionQuery.isFetching ? 'starting' : undefined)
  const previewUrl = stringValue(session?.previewUrl ?? session?.preview_url)
  const commandText = stringValue(session?.commandText ?? session?.command_text)
    ?? arrayText(session?.command)
  const projectDirectory = stringValue(session?.projectDirectory ?? session?.project_directory ?? lookup.projectDirectory)
  const blockers = blockerRecords(session?.blockers)
  const logs = logEntries(session?.logs)
  const statusLabel = remotionStudioStatusLabel(status)
  const ready = Boolean(gateway && canLookup)

  return (
    <AgentSurfaceShell
      title="Remotion Studio"
      ready={ready}
      preparingLabel={gateway ? 'Remotion Studio session is missing.' : 'Remotion Studio gateway is not available.'}
      chips={[
        `status: ${statusLabel}`,
        ...(sessionId ? [`session: ${sessionId}`] : []),
      ]}
    >
      <div className="remotion-studio-surface">
        <section className="remotion-studio-surface__preview">
          <div className="remotion-studio-surface__toolbar">
            <div className="remotion-studio-surface__status" data-status={status ?? 'unknown'}>
              <span className="remotion-studio-surface__status-dot" aria-hidden="true" />
              <span>{statusLabel}</span>
            </div>
            <div className="remotion-studio-surface__actions">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={sessionQuery.isFetching}
                onClick={() => { void sessionQuery.refetch() }}
              >
                <RefreshCw size={14} />
                刷新
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={!previewUrl}
                onClick={() => { if (previewUrl) void runtime.navigator.openExternal?.(previewUrl) }}
              >
                <ExternalLink size={14} />
                外部打开
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={!session || status === 'stopped' || stopSession.isPending}
                onClick={() => { void stopSession.mutateAsync() }}
              >
                <Square size={14} />
                停止
              </Button>
            </div>
          </div>
          <div className="remotion-studio-surface__frame">
            {previewUrl && status !== 'blocked' && status !== 'failed' && status !== 'stopped' ? (
              <iframe
                className="remotion-studio-surface__iframe"
                src={previewUrl}
                title="Remotion Studio"
                allow="clipboard-read; clipboard-write; fullscreen"
              />
            ) : (
              <div className="remotion-studio-surface__preparing">
                <div className="remotion-studio-surface__pulse" aria-hidden="true" />
                <strong>{remotionStudioWaitingTitle(status)}</strong>
                <span>{remotionStudioWaitingDetail(status, blockers)}</span>
              </div>
            )}
          </div>
        </section>

        <aside className="remotion-studio-surface__side">
          <AgentSurfacePanel title="Session">
            <AgentSurfaceKeyValues items={[
              ['Status', statusLabel],
              ['Project Dir', projectDirectory ?? 'not configured'],
              ['Preview URL', previewUrl ?? 'pending'],
              ['Command', commandText ?? 'pending'],
            ]} />
            {blockers.length > 0 ? (
              <div className="remotion-studio-surface__blockers">
                {blockers.map((blocker, index) => (
                  <div key={`${blocker.code ?? 'blocker'}-${index}`} className="remotion-studio-surface__blocker">
                    <strong>{blocker.code ?? 'BLOCKED'}</strong>
                    <span>{blocker.message ?? 'Remotion Studio session is blocked.'}</span>
                    {blocker.installCommand ? <code>{blocker.installCommand.join(' ')}</code> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </AgentSurfacePanel>

          <AgentSurfacePanel title="Shell">
            <div className="remotion-studio-surface__shell-title">
              <TerminalSquare size={14} />
              <span>{logs.length ? `${logs.length} lines` : 'waiting for output'}</span>
            </div>
            <pre className="remotion-studio-surface__logs">
              {logs.length ? logs.map(logLine).join('\n') : 'Remotion Studio has not emitted logs yet.'}
            </pre>
          </AgentSurfacePanel>
        </aside>
      </div>
    </AgentSurfaceShell>
  )
}

function remotionStudioStatus(session: unknown): RemotionStudioStatus | undefined {
  const status = stringValue(recordValue(session)?.status)
  return status === 'checking'
    || status === 'installing'
    || status === 'starting'
    || status === 'ready'
    || status === 'failed'
    || status === 'stopped'
    || status === 'blocked'
    ? status
    : undefined
}

function remotionStudioStatusLabel(status: RemotionStudioStatus | undefined): string {
  if (status === 'checking') return 'checking'
  if (status === 'installing') return 'installing'
  if (status === 'starting') return 'starting'
  if (status === 'ready') return 'ready'
  if (status === 'failed') return 'failed'
  if (status === 'stopped') return 'stopped'
  if (status === 'blocked') return 'blocked'
  return 'pending'
}

function remotionStudioWaitingTitle(status: RemotionStudioStatus | undefined): string {
  if (status === 'blocked') return 'Remotion Studio is blocked'
  if (status === 'failed') return 'Remotion Studio failed to start'
  if (status === 'stopped') return 'Remotion Studio stopped'
  return 'Starting Remotion Studio'
}

function remotionStudioWaitingDetail(status: RemotionStudioStatus | undefined, blockers: RemotionStudioBlocker[]): string {
  const blocker = blockers[0]
  if (blocker?.message) return blocker.message
  if (status === 'blocked') return 'A workspace requirement is missing.'
  if (status === 'failed') return 'Check the shell output for the startup error.'
  if (status === 'stopped') return 'The session process is no longer running.'
  return 'Waiting for the Studio preview URL to become ready.'
}

interface RemotionStudioBlocker {
  code?: string
  message?: string
  installCommand?: string[]
}

function blockerRecords(value: unknown): RemotionStudioBlocker[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const record = recordValue(item)
    const installCommand = stringArrayValue(record?.installCommand ?? record?.install_command)
    return {
      ...(stringValue(record?.code) ? { code: stringValue(record?.code) } : {}),
      ...(stringValue(record?.message) ? { message: stringValue(record?.message) } : {}),
      ...(installCommand ? { installCommand } : {}),
    }
  })
}

function logEntries(value: unknown): RemotionStudioLogEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const record = recordValue(item)
    const text = stringValue(record?.text)
    if (!text) return []
    return [{
      ...(stringValue(record?.cursor) ? { cursor: stringValue(record?.cursor) } : {}),
      ...(stringValue(record?.at) ? { at: stringValue(record?.at) } : {}),
      stream: stringValue(record?.stream) ?? 'system',
      text,
    }]
  })
}

function logLine(entry: RemotionStudioLogEntry): string {
  const at = entry.at ? new Date(entry.at).toLocaleTimeString() : '--:--:--'
  return `[${at}] ${entry.stream}: ${entry.text}`
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return items.length > 0 ? items : undefined
}

function arrayText(value: unknown): string | undefined {
  return stringArrayValue(value)?.join(' ')
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
