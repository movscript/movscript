import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clipboard, Download, ExternalLink, Info, RefreshCw, RotateCw, Square, SquareTerminal } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'
import { recordValue } from '../../data.js'
import {
  useProjectSurfaceRuntime,
  type ProjectSurfaceShellIntent,
  type ProjectSurfaceShellJob,
  type ProjectSurfaceShellSession,
  type ShellGateway,
} from '../../runtime/index.js'
import { AgentSurfaceShell } from '../AgentSurfaceShell.js'
import { ProjectSurfaceShellIntentCard } from '../ProjectSurfaceShellIntentCard.js'
import './ProjectRemotionStudioSurface.css'

export interface ProjectRemotionStudioSurfaceProps {
  params?: URLSearchParams
  renderPreviewFrame?: (props: ProjectRemotionStudioPreviewFrameProps) => ReactNode
}

export interface ProjectRemotionStudioPreviewFrameProps {
  previewUrl: string
  refreshNonce: number
  className: string
  title: string
  onLoad: () => void
  onError: () => void
}

type RemotionStudioStatus = 'checking' | 'installing' | 'starting' | 'ready' | 'failed' | 'stopped' | 'blocked' | 'needs_external_shell'
type RemotionStudioIframeState = 'idle' | 'loading' | 'loaded' | 'timeout' | 'error'

type RemotionShellIntent = ProjectSurfaceShellIntent

export function ProjectRemotionStudioSurface({ params, renderPreviewFrame }: ProjectRemotionStudioSurfaceProps) {
  const runtime = useProjectSurfaceRuntime()
  const gateway = runtime.gateways.remotionStudio
  const queryClient = useQueryClient()
  const [dependencyInstallStartedAt, setDependencyInstallStartedAt] = useState<number | null>(null)
  const [dependencyInstallShellSessionId, setDependencyInstallShellSessionId] = useState<string | null>(null)
  const lookup = useMemo(() => {
    const sessionId = params?.get('sessionId') ?? params?.get('session_id') ?? undefined
    const workspaceId = params?.get('workspaceId') ?? params?.get('workspace_id') ?? undefined
    const productionId = params?.get('productionId') ?? params?.get('production_id') ?? undefined
    const projectDirectory = params?.get('projectDirectory') ?? params?.get('project_directory') ?? runtime.project.projectDir
    const entrypoint = params?.get('entrypoint') ?? undefined
    const compositionId = params?.get('compositionId') ?? params?.get('composition_id') ?? undefined
    return {
      ...(sessionId ? { sessionId, session_id: sessionId } : {}),
      ...(workspaceId ? { workspaceId, workspace_id: workspaceId } : {}),
      ...(productionId ? { productionId, production_id: productionId } : {}),
      ...(projectDirectory ? { projectDirectory, project_directory: projectDirectory } : {}),
      ...(entrypoint ? { entrypoint } : {}),
      ...(compositionId ? { compositionId, composition_id: compositionId } : {}),
    }
  }, [params, runtime.project.projectDir])
  const sessionQueryKey = useMemo(() => ['project-surface', 'remotion-studio-session', lookup] as const, [lookup])
  const canLookup = Object.keys(lookup).length > 0
  const sessionQuery = useQuery({
    queryKey: sessionQueryKey,
    queryFn: async () => {
      if (!gateway) throw new Error('Remotion Studio 网关不可用。')
      if (lookup.sessionId) {
        try {
          const response = recordValue(await gateway.get(lookup)) ?? {}
          if (!remotionStudioSessionNeedsOpenFallback(response)) return response
        } catch {
          // A stale in-memory session id should not strand the Remotion page.
        }
      }
      const response = await gateway.open(lookup)
      return recordValue(response) ?? {}
    },
    enabled: Boolean(gateway && canLookup),
    refetchInterval: (query) => {
      const status = remotionStudioStatus(query.state.data)
      if (dependencyInstallStartedAt && status === 'blocked') return 2000
      return status === 'checking' || status === 'installing' || status === 'starting' ? 1000 : false
    },
  })
  const stopSession = useMutation({
    mutationFn: async () => {
      if (!gateway) throw new Error('Remotion Studio 网关不可用。')
      return recordValue(await gateway.stop(lookup)) ?? {}
    },
    onSuccess: (nextSession) => {
      queryClient.setQueryData(sessionQueryKey, nextSession)
      void queryClient.invalidateQueries({ queryKey: ['project-surface', 'remotion-studio-session'] })
    },
  })
  const session = recordValue(sessionQuery.data)
  const sessionId = stringValue(session?.sessionId ?? session?.session_id ?? lookup.sessionId)
  const shellSessionId = stringValue(session?.shellSessionId ?? session?.shell_session_id)
  const shellJobId = stringValue(session?.shellJobId ?? session?.shell_job_id)
  const shellStatus = stringValue(session?.shellStatus ?? session?.shell_status)
  const sessionError = stringValue(session?.error ?? session?.message ?? session?.errorMessage ?? session?.error_message)
  const status = remotionStudioStatus(session) ?? (sessionQuery.isFetching ? 'starting' : undefined)
  const dependencyInstallPolling = Boolean(dependencyInstallStartedAt && status === 'blocked')
  const activeShellSessionId = shellSessionId ?? (status === 'blocked' ? dependencyInstallShellSessionId ?? undefined : undefined)
  const previewUrl = stringValue(session?.previewUrl ?? session?.preview_url)
  const commandText = stringValue(session?.commandText ?? session?.command_text)
    ?? arrayText(session?.command)
  const projectDirectory = stringValue(session?.projectDirectory ?? session?.project_directory ?? lookup.projectDirectory)
  const entrypoint = stringValue(session?.entrypoint ?? lookup.entrypoint)
  const compositionId = stringValue(session?.compositionId ?? session?.composition_id ?? lookup.compositionId)
  const blockers = blockerRecords(session?.blockers)
  const installIntent = installShellIntent(blockers, projectDirectory)
  const shellIntent = shellIntentRecord(session?.shellIntent ?? session?.shell_intent)
    ?? installIntent
  const ready = Boolean(gateway && canLookup)
  const hasDesktopShell = Boolean(runtime.gateways.shell)
  const showPreviewFrame = Boolean(previewUrl && remotionStudioCanRenderPreview(status))
  const resolvedPreviewUrl = previewUrl ?? ''
  const [iframeState, setIframeState] = useState<RemotionStudioIframeState>('idle')
  const [iframeRefreshNonce, setIframeRefreshNonce] = useState(0)
  useEffect(() => {
    if (!showPreviewFrame) {
      setIframeState('idle')
      return
    }
    setIframeState('loading')
    const timeout = window.setTimeout(() => {
      setIframeState((current) => current === 'loading' ? 'timeout' : current)
    }, 9000)
    return () => window.clearTimeout(timeout)
  }, [iframeRefreshNonce, previewUrl, showPreviewFrame])
  const restartSession = useMutation({
    mutationFn: async () => {
      if (!gateway) throw new Error('Remotion Studio 网关不可用。')
      return recordValue(await gateway.open({
        ...remotionStudioRestartInput(lookup, session),
        restart: true,
        forceRestart: true,
        force_restart: true,
      })) ?? {}
    },
    onSuccess: (nextSession) => {
      queryClient.setQueryData(sessionQueryKey, nextSession)
      void queryClient.invalidateQueries({ queryKey: ['project-surface', 'remotion-studio-session'] })
    },
    onError: (error) => {
      runtime.notifier.error('无法重新启动 Remotion Studio', error instanceof Error ? error.message : String(error))
    },
  })
  const restartAvailable = Boolean(gateway && canLookup && (status === 'stopped' || status === 'failed'))
  const dependencyInstallShellQuery = useQuery({
    queryKey: ['project-surface', 'remotion-studio-install-shell', dependencyInstallShellSessionId],
    queryFn: async () => {
      const shellGateway = runtime.gateways.shell
      if (!shellGateway || !dependencyInstallShellSessionId) return undefined
      return shellGateway.get({ sessionId: dependencyInstallShellSessionId })
    },
    enabled: Boolean(runtime.gateways.shell && dependencyInstallShellSessionId && dependencyInstallStartedAt && status === 'blocked'),
    refetchInterval: (query) => {
      const installStatus = shellSessionStatus(query.state.data)
      return !installStatus || installStatus === 'starting' || installStatus === 'running' ? 2000 : false
    },
  })
  const continueAfterDependencyInstall = useMutation({
    mutationFn: async () => {
      if (!gateway) throw new Error('Remotion Studio 网关不可用。')
      return recordValue(await gateway.open({
        ...remotionStudioRestartInput(lookup, session),
        restart: true,
        forceRestart: true,
        force_restart: true,
      })) ?? {}
    },
    onSuccess: (nextSession) => {
      setDependencyInstallStartedAt(null)
      setDependencyInstallShellSessionId(null)
      queryClient.setQueryData(sessionQueryKey, nextSession)
      void queryClient.invalidateQueries({ queryKey: ['project-surface', 'remotion-studio-session'] })
    },
    onError: (error) => {
      runtime.notifier.error('依赖安装后仍无法启动 Remotion Studio', error instanceof Error ? error.message : String(error))
    },
  })
  const runShellIntent = async (
    intent: RemotionShellIntent,
    title?: string,
    reveal: boolean | 'always' | 'on_error' | 'silent' = 'on_error',
  ) => {
    const shellGateway = runtime.gateways.shell
    if (!shellGateway) throw new Error('Desktop Shell 网关不可用。')
    const cwd = intent.cwd || projectDirectory
    const targetPreviewUrl = intent.expectedPreviewUrl ?? previewUrl
    return shellGateway.run({
      title: title ?? intent.title ?? 'Remotion Studio',
      owner: 'system',
      scope: 'workspace',
      ownerFeature: 'remotion_studio',
      command: intent.commandText,
      ...(cwd ? { cwd } : {}),
      ...(cwd ? { projectDir: cwd } : {}),
      projectId: runtime.project.projectId,
      ...(runtime.project.projectUid ? { projectUid: runtime.project.projectUid } : {}),
      ...(targetPreviewUrl ? { previewUrl: targetPreviewUrl } : {}),
      reveal,
    })
  }
  const openInShell = useMutation({
    mutationFn: async () => {
      const shellGateway = runtime.gateways.shell
      if (!shellGateway) throw new Error('Desktop Shell 网关不可用。')
      if (activeShellSessionId && shellGateway.reveal && !remotionShellSessionFinished(shellStatus)) {
        await revealRemotionShellSession(shellGateway, activeShellSessionId)
        return
      }
      const command = commandText ?? shellIntent?.commandText
      if (!command) throw new Error('Remotion Studio command is not available.')
      const existingJob = await findExistingRemotionShellJob(shellGateway, {
        commandText: command,
        previewUrl: shellIntent?.expectedPreviewUrl ?? previewUrl,
        projectDirectory: shellIntent?.cwd || projectDirectory,
        projectId: runtime.project.projectId,
        projectUid: runtime.project.projectUid,
      })
      if (existingJob?.sessionId) {
        await revealRemotionShellSession(shellGateway, existingJob.sessionId)
        queryClient.setQueryData(sessionQueryKey, remotionStudioSessionWithShellJob(existingJob))
        return
      }
      const shellSession = await runShellIntent({
        schema: 'movscript.shell_intent.v1',
        intentId: shellIntent?.intentId ?? 'remotion-studio-open-shell',
        title: shellIntent?.title ?? 'Remotion Studio',
        reason: shellIntent?.reason ?? '在 Desktop Shell 中打开 Remotion Studio。',
        cwd: shellIntent?.cwd ?? projectDirectory ?? '',
        command: shellIntent?.command ?? shellCommandTextFallbackArray(command),
        commandText: command,
        ownerFeature: shellIntent?.ownerFeature ?? 'remotion_studio',
        destructive: shellIntent?.destructive ?? false,
        ...(shellIntent?.expectedPreviewUrl ?? previewUrl ? { expectedPreviewUrl: shellIntent?.expectedPreviewUrl ?? previewUrl } : {}),
        ...(shellIntent?.reason ? { reason: shellIntent.reason } : {}),
      }, undefined, 'always')
      queryClient.setQueryData(sessionQueryKey, remotionStudioSessionWithShellSession(shellSession))
      requestHostShellWorkbenchReveal(shellSession.id)
    },
    onError: (error) => {
      runtime.notifier.error('无法打开 Shell', error instanceof Error ? error.message : String(error))
    },
  })
  const installDependencies = useMutation({
    mutationFn: async () => {
      if (!installIntent) throw new Error('Remotion 依赖安装命令不可用。')
      return runShellIntent(installIntent, '安装 Remotion 依赖', 'always')
    },
    onSuccess: (shellSession) => {
      setDependencyInstallShellSessionId(shellSession.id)
      setDependencyInstallStartedAt(Date.now())
      runtime.notifier.info?.('已开始安装依赖')
      void queryClient.invalidateQueries({ queryKey: ['project-surface', 'remotion-studio-session'] })
    },
    onError: (error) => {
      runtime.notifier.error('无法安装依赖', error instanceof Error ? error.message : String(error))
    },
  })
  const shellActionAvailable = Boolean(hasDesktopShell && (activeShellSessionId || commandText || shellIntent?.commandText))
  const reloadPreviewFrame = () => {
    if (!showPreviewFrame) return
    setIframeState('loading')
    setIframeRefreshNonce((value) => value + 1)
  }
  const copyPreviewUrl = useMutation({
    mutationFn: async () => {
      if (!previewUrl) return
      if (!navigator.clipboard?.writeText) throw new Error('剪贴板 API 不可用。')
      await navigator.clipboard.writeText(previewUrl)
    },
    onSuccess: () => {
      runtime.notifier.info?.('预览地址已复制')
    },
    onError: (error) => {
      runtime.notifier.error('无法复制预览地址', error instanceof Error ? error.message : String(error))
    },
  })
  const copyShellIntent = useMutation({
    mutationFn: async () => {
      if (!shellIntent) return
      if (!navigator.clipboard?.writeText) throw new Error('剪贴板 API 不可用。')
      await navigator.clipboard.writeText(shellIntent.commandText)
    },
    onSuccess: () => {
      runtime.notifier.info?.('命令已复制')
    },
    onError: (error) => {
      runtime.notifier.error('无法复制命令', error instanceof Error ? error.message : String(error))
    },
  })
  const checkShellIntent = () => {
    void sessionQuery.refetch()
  }
  const statusTone = remotionStudioStatusTone(status)
  const statusLabel = remotionStudioStatusLabel(status)
  const statusDetail = remotionStudioStatusDetail(status, iframeState, blockers, sessionError)
  const statusFacts = remotionStudioStatusFacts({
    previewUrl,
    projectDirectory,
    shellStatus,
    status: statusLabel,
    entrypoint,
    iframeState,
  })
  const diagnostics = remotionStudioDiagnostics({
    sessionId,
    shellSessionId: activeShellSessionId,
    shellJobId,
    shellStatus,
    commandText: commandText ?? shellIntent?.commandText,
    entrypoint,
    compositionId,
    iframeState,
    sessionError,
  })

  useEffect(() => {
    if (!dependencyInstallStartedAt || !dependencyInstallShellSessionId || status !== 'blocked') return
    const installStatus = shellSessionStatus(dependencyInstallShellQuery.data)
    const installExitCode = shellSessionExitCode(dependencyInstallShellQuery.data)
    if (installStatus === 'exited' && installExitCode === 0 && !continueAfterDependencyInstall.isPending) {
      void continueAfterDependencyInstall.mutateAsync()
      return
    }
    if (installStatus === 'failed' || (installStatus === 'exited' && installExitCode !== undefined && installExitCode !== 0)) {
      setDependencyInstallStartedAt(null)
      runtime.notifier.error('Remotion 依赖安装失败', '请查看 Shell 输出后重新安装。')
    }
  }, [
    continueAfterDependencyInstall,
    dependencyInstallShellQuery.data,
    dependencyInstallShellSessionId,
    dependencyInstallStartedAt,
    runtime.notifier,
    status,
  ])

  return (
    <AgentSurfaceShell
      chrome="immersive"
      title="Remotion Studio"
      ready={ready}
      preparingLabel={gateway ? '缺少 Remotion Studio 会话。' : 'Remotion Studio 网关不可用。'}
    >
      <div className="remotion-studio-surface">
        <section className="remotion-studio-surface__preview">
          <header className="remotion-studio-surface__status-strip" data-status={statusTone}>
            <div className="remotion-studio-surface__status-main">
              <span className="remotion-studio-surface__status-dot" aria-hidden="true" />
              <div className="remotion-studio-surface__status-copy">
                <h1 className="remotion-studio-surface__title">Remotion Studio</h1>
                <p>
                  <strong>{statusLabel}</strong>
                  <span>{statusDetail}</span>
                </p>
              </div>
            </div>
            <div className="remotion-studio-surface__actions">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                title="刷新状态"
                aria-label="刷新状态"
                disabled={sessionQuery.isFetching}
                onClick={() => { void sessionQuery.refetch() }}
              >
                <RefreshCw size={14} />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                title="外部打开"
                aria-label="外部打开"
                disabled={!previewUrl}
                onClick={() => { if (previewUrl) void runtime.navigator.openExternal?.(previewUrl) }}
              >
                <ExternalLink size={14} />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                title="复制预览地址"
                aria-label="复制预览地址"
                disabled={!previewUrl || copyPreviewUrl.isPending}
                onClick={() => { void copyPreviewUrl.mutateAsync() }}
              >
                <Clipboard size={14} />
              </Button>
              {hasDesktopShell && installIntent ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  title={dependencyInstallPolling ? '检查依赖' : '安装依赖'}
                  aria-label={dependencyInstallPolling ? '检查依赖' : '安装依赖'}
                  disabled={installDependencies.isPending || dependencyInstallPolling}
                  onClick={() => { void installDependencies.mutateAsync() }}
                >
                  <Download size={14} />
                </Button>
              ) : null}
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                title="重新启动"
                aria-label="重新启动"
                disabled={!restartAvailable || restartSession.isPending}
                onClick={() => { void restartSession.mutateAsync() }}
              >
                <RotateCw size={14} />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                title="在 Shell 打开"
                aria-label="在 Shell 打开"
                disabled={!shellActionAvailable || openInShell.isPending}
                onClick={() => { void openInShell.mutateAsync() }}
              >
                <SquareTerminal size={14} />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                title="停止"
                aria-label="停止"
                disabled={!session || status === 'stopped' || stopSession.isPending}
                onClick={() => { void stopSession.mutateAsync() }}
              >
                <Square size={14} />
              </Button>
              <details className="remotion-studio-surface__diagnostics-drawer">
                <summary aria-label="诊断信息" title="诊断信息">
                  <Info size={14} />
                  <span>诊断</span>
                </summary>
                <div className="remotion-studio-surface__diagnostics-panel">
                  <dl className="remotion-studio-surface__status-facts" aria-label="Remotion Studio 状态摘要">
                    {statusFacts.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <dl className="remotion-studio-surface__diagnostics" aria-label="Remotion Studio 诊断信息">
                    {diagnostics.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </details>
            </div>
          </header>
          <div className="remotion-studio-surface__frame">
            {showPreviewFrame ? (
              <>
                {renderPreviewFrame
                  ? renderPreviewFrame({
                    previewUrl: resolvedPreviewUrl,
                    refreshNonce: iframeRefreshNonce,
                    className: 'remotion-studio-surface__iframe',
                    title: 'Remotion Studio',
                    onError: () => setIframeState('error'),
                    onLoad: () => setIframeState('loaded'),
                  })
                  : (
                    <iframe
                      key={`${previewUrl}:${iframeRefreshNonce}`}
                      className="remotion-studio-surface__iframe"
                      src={resolvedPreviewUrl}
                      title="Remotion Studio"
                      allow="clipboard-read; clipboard-write; fullscreen"
                      onError={() => setIframeState('error')}
                      onLoad={() => setIframeState('loaded')}
                    />
                  )}
                {iframeState !== 'loaded' ? (
                  <div className="remotion-studio-surface__frame-overlay" data-state={iframeState} aria-live="polite">
                    <strong>{remotionStudioFrameTitle(iframeState)}</strong>
                    <span>{remotionStudioFrameDetail(iframeState)}</span>
                    <div className="remotion-studio-surface__frame-actions">
                      <Button
                        type="button"
                        size="sm"
                        variant="solid"
                        tone="neutral"
                        className="remotion-studio-surface__frame-button gap-2"
                        disabled={!previewUrl || iframeState === 'loading'}
                        onClick={reloadPreviewFrame}
                      >
                        <RefreshCw size={14} />
                        刷新嵌入页
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="solid"
                        tone="neutral"
                        className="remotion-studio-surface__frame-button gap-2"
                        disabled={!previewUrl}
                        onClick={() => { if (previewUrl) void runtime.navigator.openExternal?.(previewUrl) }}
                      >
                        <ExternalLink size={14} />
                        外部打开
                      </Button>
                      {shellActionAvailable ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="solid"
                          tone="neutral"
                          className="remotion-studio-surface__frame-button gap-2"
                          disabled={openInShell.isPending}
                          onClick={() => { void openInShell.mutateAsync() }}
                        >
                          <SquareTerminal size={14} />
                          查看 Shell
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="solid"
                        tone="neutral"
                        className="remotion-studio-surface__frame-button gap-2"
                        disabled={sessionQuery.isFetching}
                        onClick={() => { void sessionQuery.refetch() }}
                      >
                        <RefreshCw size={14} />
                        刷新状态
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="remotion-studio-surface__preparing" data-status={statusTone}>
                <div className="remotion-studio-surface__pulse" data-status={statusTone} aria-hidden="true" />
                <strong>{remotionStudioWaitingTitle(status)}</strong>
                <span>{remotionStudioWaitingDetail(status, blockers, sessionError)}</span>
                {!hasDesktopShell && shellIntent ? (
                  <ProjectSurfaceShellIntentCard
                    className="remotion-studio-surface__intent-card"
                    checking={sessionQuery.isFetching}
                    copying={copyShellIntent.isPending}
                    primaryActionLabel={installIntent ? '复制安装命令' : '复制启动命令'}
                    checkAgainLabel={installIntent ? '安装完成，重新检查' : '我已启动，重新检查'}
                    intent={shellIntent}
                    onCheckAgain={checkShellIntent}
                    onCopyCommand={() => { void copyShellIntent.mutateAsync() }}
                  />
                ) : null}
              </div>
            )}
          </div>
        </section>
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
    || status === 'needs_external_shell'
    ? status
    : undefined
}

function remotionStudioSessionNeedsOpenFallback(session: Record<string, unknown>): boolean {
  return !stringValue(session.sessionId ?? session.session_id) && !remotionStudioStatus(session)
}

function requestHostShellWorkbenchReveal(sessionId?: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('movscript:shell-workbench-reveal', { detail: { sessionId } }))
}

async function revealRemotionShellSession(shellGateway: ShellGateway, sessionId: string): Promise<void> {
  if (shellGateway.reveal) {
    await shellGateway.reveal({ sessionId })
    return
  }
  requestHostShellWorkbenchReveal(sessionId)
}

async function findExistingRemotionShellJob(
  shellGateway: ShellGateway,
  input: {
    commandText?: string
    previewUrl?: string
    projectDirectory?: string
    projectId?: string
    projectUid?: string
  },
): Promise<ProjectSurfaceShellJob | undefined> {
  const { jobs } = await shellGateway.listJobs({
    ownerFeature: 'remotion_studio',
    scope: 'workspace',
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.projectUid ? { projectUid: input.projectUid } : {}),
    ...(input.projectDirectory ? { projectDir: input.projectDirectory } : {}),
  })
  return jobs.find((job) => remotionShellJobMatches(job, input))
}

function remotionShellJobMatches(
  job: ProjectSurfaceShellJob,
  input: {
    commandText?: string
    previewUrl?: string
    projectDirectory?: string
  },
): boolean {
  if (!job.sessionId) return false
  if (job.status !== 'queued' && job.status !== 'running') return false
  if (job.ownerFeature !== 'remotion_studio') return false
  if (input.previewUrl && job.previewUrl === input.previewUrl) return true
  if (input.commandText && normalizedRemotionShellCommandText(job.commandText ?? arrayText(job.command)) === normalizedRemotionShellCommandText(input.commandText)) {
    return true
  }
  if (input.projectDirectory) {
    return remotionShellPathMatches(job.cwd, input.projectDirectory)
      || remotionShellPathMatches(job.projectDir, input.projectDirectory)
  }
  return false
}

function remotionStudioSessionWithShellJob(job: ProjectSurfaceShellJob): (current: unknown) => Record<string, unknown> {
  return (current) => {
    const session = recordValue(current) ?? {}
    return {
      ...session,
      shellSessionId: job.sessionId,
      shell_session_id: job.sessionId,
      shellJobId: job.jobId,
      shell_job_id: job.jobId,
      shellStatus: job.status === 'queued' ? 'starting' : 'running',
      shell_status: job.status === 'queued' ? 'starting' : 'running',
    }
  }
}

function remotionStudioSessionWithShellSession(shellSession: ProjectSurfaceShellSession): (current: unknown) => Record<string, unknown> {
  return (current) => {
    const session = recordValue(current) ?? {}
    const shellStatus = remotionShellSessionFinished(shellSession.status) ? shellSession.status : 'starting'
    return {
      ...session,
      shellSessionId: shellSession.id,
      shell_session_id: shellSession.id,
      ...(shellSession.jobId ? { shellJobId: shellSession.jobId, shell_job_id: shellSession.jobId } : {}),
      shellStatus,
      shell_status: shellStatus,
      ...(session.status === 'failed' || session.status === 'stopped' ? { status: 'starting' } : {}),
      error: undefined,
    }
  }
}

function remotionShellSessionFinished(status: unknown): boolean {
  return status === 'failed' || status === 'exited'
}

function remotionShellPathMatches(candidate: unknown, target: unknown): boolean {
  const candidatePath = normalizedRemotionShellPath(candidate)
  const targetPath = normalizedRemotionShellPath(target)
  return Boolean(candidatePath && targetPath && (
    candidatePath === targetPath
    || candidatePath.startsWith(`${targetPath}/`)
    || targetPath.startsWith(`${candidatePath}/`)
  ))
}

function normalizedRemotionShellPath(value: unknown): string {
  return stringValue(value)
    ?.replace(/\\/g, '/')
    .replace(/\/+$/, '')
    ?? ''
}

function normalizedRemotionShellCommandText(value: unknown): string {
  return stringValue(value)?.replace(/\s+/g, ' ') ?? ''
}

function remotionStudioCanRenderPreview(status: RemotionStudioStatus | undefined): boolean {
  return status !== 'blocked'
    && status !== 'failed'
    && status !== 'stopped'
    && status !== 'needs_external_shell'
}

function remotionStudioStatusTone(status: RemotionStudioStatus | undefined): 'ready' | 'running' | 'blocked' | 'failed' | 'stopped' | 'neutral' {
  if (status === 'ready') return 'ready'
  if (status === 'failed') return 'failed'
  if (status === 'blocked' || status === 'needs_external_shell') return 'blocked'
  if (status === 'stopped') return 'stopped'
  if (status === 'checking' || status === 'installing' || status === 'starting') return 'running'
  return 'neutral'
}

function remotionStudioStatusLabel(status: RemotionStudioStatus | undefined): string {
  if (status === 'ready') return '预览服务已返回'
  if (status === 'checking') return '正在检查工作区'
  if (status === 'installing') return '正在安装依赖'
  if (status === 'starting') return '正在启动预览服务'
  if (status === 'blocked') return '等待依赖或工作区修复'
  if (status === 'needs_external_shell') return '需要手动启动命令'
  if (status === 'failed') return '启动失败'
  if (status === 'stopped') return '已停止'
  return '等待会话'
}

function remotionStudioStatusDetail(
  status: RemotionStudioStatus | undefined,
  iframeState: RemotionStudioIframeState,
  blockers: RemotionStudioBlocker[],
  sessionError?: string,
): string {
  const blocker = blockers[0]
  if (blocker?.message) return blocker.message
  if (sessionError && (status === 'failed' || status === 'blocked')) return sessionError
  if (status === 'ready' && iframeState === 'timeout') return 'Studio 服务可用，但嵌入页面暂未响应。'
  if (status === 'ready' && iframeState === 'error') return 'Studio 服务可用，但当前窗口未能嵌入显示。'
  if (status === 'ready') return iframeState === 'loaded' ? 'Studio 已嵌入当前剪辑台。' : 'Studio 服务可用，正在等待页面完成加载。'
  if (status === 'checking') return '正在读取工作区和依赖状态。'
  if (status === 'installing') return '依赖安装完成后会继续检查预览服务。'
  if (status === 'starting') return '后台 Shell 正在启动 Studio，底部 Shell 不会自动展开。'
  if (status === 'blocked') return '需要先补齐工作区文件或安装 Remotion 依赖。'
  if (status === 'needs_external_shell') return '当前环境需要手动执行命令后再检查。'
  if (status === 'failed') return '可以手动打开 Shell 查看启动输出。'
  if (status === 'stopped') return '会话已停止，可以重新启动。'
  return '等待 Remotion 会话返回状态。'
}

function remotionStudioStatusFacts(input: {
  previewUrl?: string
  projectDirectory?: string
  shellStatus?: string
  status: string
  entrypoint?: string
  iframeState: RemotionStudioIframeState
}): [string, string][] {
  return [
    ['预览地址', input.previewUrl ?? '待返回'],
    ['工作目录', input.projectDirectory ?? '未解析'],
    ['入口文件', input.entrypoint ?? 'src/Root.tsx'],
    ['Shell', input.shellStatus ?? input.status],
    ['嵌入页', remotionStudioIframeStateLabel(input.iframeState)],
  ]
}

function remotionStudioDiagnostics(input: {
  sessionId?: string
  shellSessionId?: string
  shellJobId?: string
  shellStatus?: string
  commandText?: string
  entrypoint?: string
  compositionId?: string
  iframeState: RemotionStudioIframeState
  sessionError?: string
}): [string, string][] {
  const diagnostics: [string, string][] = [
    ['会话', input.sessionId ?? '待创建'],
    ['入口文件', input.entrypoint ?? 'src/Root.tsx'],
    ['合成', input.compositionId ?? '默认'],
    ['嵌入状态', remotionStudioIframeStateLabel(input.iframeState)],
    ['启动命令', input.commandText ?? '待返回'],
    ['Shell 会话', input.shellSessionId ?? '后台运行'],
    ['Shell Job', input.shellJobId ?? '无'],
    ['Shell 状态', input.shellStatus ?? '默认隐藏'],
  ]
  if (input.sessionError) diagnostics.push(['错误', input.sessionError])
  return diagnostics
}

function remotionStudioWaitingTitle(status: RemotionStudioStatus | undefined): string {
  if (status === 'needs_external_shell') return '需要在 Shell 中启动 Remotion Studio'
  if (status === 'blocked') return 'Remotion Studio 暂时被阻塞'
  if (status === 'failed') return 'Remotion Studio 启动失败'
  if (status === 'stopped') return 'Remotion Studio 已停止'
  return '正在启动 Remotion Studio'
}

function remotionStudioWaitingDetail(
  status: RemotionStudioStatus | undefined,
  blockers: RemotionStudioBlocker[],
  sessionError?: string,
): string {
  const blocker = blockers[0]
  if (blocker?.message) return blocker.message
  if (sessionError && (status === 'failed' || status === 'blocked')) return sessionError
  if (status === 'blocked') return '工作区要求尚未满足。'
  if (status === 'needs_external_shell') return '执行 Shell 命令后，等预览服务就绪再检查。'
  if (status === 'failed') return '可以打开 Shell 查看启动错误。'
  if (status === 'stopped') return '当前会话进程已经停止。'
  return '正在等待 Studio 预览地址就绪。'
}

function remotionStudioFrameTitle(state: RemotionStudioIframeState): string {
  if (state === 'timeout') return '预览加载时间较长'
  if (state === 'error') return '预览页面未能加载'
  return '正在加载 Remotion Studio'
}

function remotionStudioFrameDetail(state: RemotionStudioIframeState): string {
  if (state === 'timeout') return '预览连接已经返回，但嵌入页暂未完成加载。可以刷新嵌入页、外部打开，或查看 Shell 输出。'
  if (state === 'error') return 'Studio 服务可能拒绝嵌入显示。外部打开或查看 Shell 可以确认服务是否健康。'
  return '正在等待 Studio 返回首个页面响应。'
}

function remotionStudioIframeStateLabel(state: RemotionStudioIframeState): string {
  if (state === 'loaded') return '已嵌入'
  if (state === 'loading') return '加载中'
  if (state === 'timeout') return '加载超时'
  if (state === 'error') return '加载失败'
  return '待加载'
}

interface RemotionStudioBlocker {
  code?: string
  message?: string
  installCommand?: string[]
  projectDirectory?: string
  shellIntent?: RemotionShellIntent
}

function blockerRecords(value: unknown): RemotionStudioBlocker[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const record = recordValue(item)
    const installCommand = stringArrayValue(record?.installCommand ?? record?.install_command)
    const shellIntent = shellIntentRecord(record?.shellIntent ?? record?.shell_intent)
    return {
      ...(stringValue(record?.code) ? { code: stringValue(record?.code) } : {}),
      ...(stringValue(record?.message) ? { message: stringValue(record?.message) } : {}),
      ...(installCommand ? { installCommand } : {}),
      ...(stringValue(record?.projectDirectory ?? record?.project_directory)
        ? { projectDirectory: stringValue(record?.projectDirectory ?? record?.project_directory) }
        : {}),
      ...(shellIntent ? { shellIntent } : {}),
    }
  })
}

function shellIntentRecord(value: unknown): RemotionShellIntent | undefined {
  const record = recordValue(value)
  if (!record) return undefined
  const commandText = stringValue(record.commandText ?? record.command_text) ?? arrayText(record.command)
  if (!commandText) return undefined
  const command = stringArrayValue(record.command) ?? shellCommandTextFallbackArray(commandText)
  const expectedPreviewUrl = stringValue(record.expectedPreviewUrl ?? record.expected_preview_url)
  const reason = stringValue(record.reason) ?? '在可见 Shell 中启动 Remotion Studio。'
  const destructive = booleanValue(record.destructive)
  const ownerFeature = stringValue(record.ownerFeature ?? record.owner_feature) ?? 'remotion_studio'
  const intentId = stringValue(record.intentId ?? record.intent_id) ?? `remotion-studio-shell:${commandText}`
  return {
    schema: 'movscript.shell_intent.v1',
    intentId,
    intent_id: intentId,
    title: stringValue(record.title) ?? '在 Shell 中启动 Remotion Studio',
    cwd: stringValue(record.cwd) ?? '',
    command,
    commandText,
    command_text: commandText,
    reason,
    ownerFeature,
    owner_feature: ownerFeature,
    destructive: destructive ?? false,
    ...(expectedPreviewUrl ? { expectedPreviewUrl } : {}),
    ...(expectedPreviewUrl ? { expected_preview_url: expectedPreviewUrl } : {}),
  }
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return undefined
}

function installShellIntent(
  blockers: RemotionStudioBlocker[],
  projectDirectory: string | undefined,
): RemotionShellIntent | undefined {
  const blocker = blockers.find((item) => item.shellIntent || item.installCommand?.length)
  if (blocker?.shellIntent) return blocker.shellIntent
  if (!blocker?.installCommand) return undefined
  const commandText = blocker.installCommand.join(' ')
  const cwd = projectDirectory ?? blocker.projectDirectory ?? ''
  return {
    schema: 'movscript.shell_intent.v1',
    intentId: `remotion-install-dependencies:${cwd || commandText}`,
    intent_id: `remotion-install-dependencies:${cwd || commandText}`,
    title: '安装 Remotion 工作区依赖',
    cwd,
    command: blocker.installCommand,
    commandText,
    command_text: commandText,
    reason: blocker.message ?? '打开 Studio 前需要先安装 Remotion 工作区依赖。',
    ownerFeature: 'remotion_studio',
    owner_feature: 'remotion_studio',
    destructive: false,
  }
}

function shellCommandTextFallbackArray(commandText: string): string[] {
  return [commandText.trim()].filter(Boolean)
}

function remotionStudioRestartInput(
  lookup: Record<string, unknown>,
  session: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const sessionId = stringValue(session?.sessionId ?? session?.session_id ?? lookup.sessionId ?? lookup.session_id)
  const workspaceId = stringValue(session?.workspaceId ?? session?.workspace_id ?? lookup.workspaceId ?? lookup.workspace_id)
  const projectDirectory = stringValue(session?.projectDirectory ?? session?.project_directory ?? lookup.projectDirectory ?? lookup.project_directory)
  return {
    ...(sessionId ? { sessionId, session_id: sessionId } : {}),
    ...(workspaceId ? { workspaceId, workspace_id: workspaceId } : {}),
    ...(projectDirectory ? { projectDirectory, project_directory: projectDirectory } : {}),
  }
}

function shellSessionStatus(value: unknown): string | undefined {
  return stringValue(recordValue(value)?.status)
}

function shellSessionExitCode(value: unknown): number | undefined {
  const exitCode = recordValue(value)?.exitCode
    ?? recordValue(value)?.exit_code
  if (typeof exitCode === 'number' && Number.isFinite(exitCode)) return exitCode
  if (typeof exitCode !== 'string' || !exitCode.trim()) return undefined
  const parsed = Number(exitCode)
  return Number.isFinite(parsed) ? parsed : undefined
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
