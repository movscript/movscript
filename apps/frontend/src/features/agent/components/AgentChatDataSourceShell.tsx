import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AgentBody,
  AgentChatMessage,
  AgentConversationListPanel,
  AgentConversationTabsPanel,
  AgentEmpty,
  AgentHeader,
  AgentHeaderActions,
  AgentMain,
  AgentShell,
  AgentStatus,
  AgentThreadFill,
  Button,
} from '@movscript/ui'
import { AgentComposerSection } from '@/features/agent/components/AgentComposerSection'
import { attachmentDisplayUrl } from '@/features/agent/domain/agentAttachments'
import {
  agentChatTextInput,
  type AgentChatInput,
  type AgentChatDataSource,
  type AgentChatNotification,
  type AgentChatNotificationEvent,
  type AgentChatServerRequest,
  type AgentChatServerRequestResponse,
  type AgentChatThread,
  type AgentChatThreadItem,
  type AgentChatTurn,
} from '@/features/agent/domain/agentChatProtocol'
import { useAgentComposerController } from '@/features/agent/presentation/useAgentComposerController'
import { useAgentMentionEditorSync } from '@/features/agent/presentation/useAgentMentionEditorSync'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import { api } from '@/shared/infrastructure/api'
import type { RawResource } from '@/types'

type PendingUserItem = {
  threadId: string
  item: Extract<AgentChatThreadItem, { type: 'userMessage' }>
}

type PendingServerRequest = {
  request: AgentChatServerRequest
  resolve: (response: AgentChatServerRequestResponse | undefined) => void
}

type RecentCapabilityEvent = {
  id: string
  event: AgentChatNotificationEvent
}

export interface AgentChatDataSourceShellLoadResult {
  dataSource?: AgentChatDataSource
  endpoint?: string
}

export interface AgentChatDataSourceShellProps {
  userId: string
  loadDataSource: () => Promise<AgentChatDataSourceShellLoadResult>
  activeThreadStorageKey: string
  openThreadEventName: string
  providerLabel: string
  threadListLabel: string
  emptyThreadListLabel: string
  emptyThreadLabel: string
  unavailableLabel: string
  composerPlaceholder: string
  newThreadLabel: string
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  surface?: 'panel' | 'page'
  showThreadList?: boolean
  showCollapse?: boolean
  onCollapse?: () => void
}

export function AgentChatDataSourceShell({
  userId,
  loadDataSource,
  activeThreadStorageKey,
  openThreadEventName,
  providerLabel,
  threadListLabel,
  emptyThreadListLabel,
  emptyThreadLabel,
  unavailableLabel,
  composerPlaceholder,
  newThreadLabel,
  host,
  surface = 'panel',
  showThreadList = surface !== 'page',
  showCollapse = false,
  onCollapse = () => undefined,
}: AgentChatDataSourceShellProps) {
  const [dataSource, setDataSource] = useState<AgentChatDataSource | undefined>()
  const [endpoint, setEndpoint] = useState<string | undefined>()
  const [threads, setThreads] = useState<AgentChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState(() => readStoredActiveThreadId(activeThreadStorageKey))
  const [pendingUserItems, setPendingUserItems] = useState<PendingUserItem[]>([])
  const [pendingServerRequests, setPendingServerRequests] = useState<PendingServerRequest[]>([])
  const [recentCapabilityEvents, setRecentCapabilityEvents] = useState<RecentCapabilityEvent[]>([])
  const [streamingAgentItems, setStreamingAgentItems] = useState<Record<string, { threadId: string; turnId: string; itemId: string; text: string }>>({})
  const composerInputRef = useRef<HTMLDivElement | null>(null)
  const composerFileRef = useRef<HTMLInputElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [stoppingTurn, setStoppingTurn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const composerConversationId = agentChatComposerConversationId(activeThreadStorageKey, activeThreadId)
  const composerWorkspace = useAgentSessionStore((state) => state.getConversationWorkspace(userId, composerConversationId))
  const { data: resourcesData } = useQuery<RawResource[] | { items: RawResource[] }>({
    queryKey: ['resources', 'agent-panel'],
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 24, type: 'image,video,audio,text' } }).then((response) => response.data),
  })
  const recentResources = Array.isArray(resourcesData) ? resourcesData : (resourcesData?.items ?? [])
  const composer = useAgentComposerController({
    userId,
    conversationId: composerConversationId,
    workspace: composerWorkspace,
    recentResources,
    fileRef: composerFileRef,
    inputRef: composerInputRef,
  })

  useAgentMentionEditorSync({
    conversationId: composerConversationId,
    input: composer.input,
    inputRef: composerInputRef,
    resourceAttachmentIndex: composer.resourceAttachmentIndex,
  })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void loadDataSource()
      .then((result) => {
        if (cancelled) return
        setDataSource(result.dataSource)
        setEndpoint(result.endpoint)
        if (!result.dataSource) setLoading(false)
      })
      .catch((nextError) => {
        if (cancelled) return
        setError(errorMessage(nextError))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadDataSource])

  const upsertThread = useCallback((thread: AgentChatThread) => {
    setThreads((current) => {
      const without = current.filter((item) => item.id !== thread.id)
      return [thread, ...without].sort((a, b) => b.updatedAt - a.updatedAt)
    })
  }, [])

  const loadThreads = useCallback(async () => {
    if (!dataSource) return
    setLoading(true)
    setError(null)
    try {
      const response = await dataSource.listThreads({ limit: 50 })
      const nextThreads = response.threads
      setThreads(nextThreads)
      const stored = readStoredActiveThreadId(activeThreadStorageKey)
      const nextActive = nextThreads.find((thread) => thread.id === stored)?.id
        ?? nextThreads[0]?.id
        ?? null
      setActiveThreadId(nextActive)
      writeStoredActiveThreadId(activeThreadStorageKey, nextActive)
      if (nextActive) {
        const thread = await dataSource.readThread(nextActive, { includeTurns: true })
        upsertThread(thread)
      }
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setLoading(false)
    }
  }, [activeThreadStorageKey, dataSource, upsertThread])

  const openThread = useCallback(async (threadId: string) => {
    if (!dataSource) return
    setActiveThreadId(threadId)
    writeStoredActiveThreadId(activeThreadStorageKey, threadId)
    setError(null)
    try {
      const response = await dataSource.readThread(threadId, { includeTurns: true })
      upsertThread(response)
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }, [activeThreadStorageKey, dataSource, upsertThread])

  useEffect(() => {
    function handleOpenThread(event: Event) {
      const threadId = (event as CustomEvent<{ threadId?: string }>).detail?.threadId?.trim()
      if (!threadId) return
      void openThread(threadId)
    }
    window.addEventListener(openThreadEventName, handleOpenThread)
    return () => window.removeEventListener(openThreadEventName, handleOpenThread)
  }, [openThread, openThreadEventName])

  const startThread = useCallback(async () => {
    if (!dataSource) return null
    setError(null)
    try {
      const thread = await dataSource.startThread()
      upsertThread(thread)
      setActiveThreadId(thread.id)
      writeStoredActiveThreadId(activeThreadStorageKey, thread.id)
      return thread
    } catch (nextError) {
      setError(errorMessage(nextError))
      return null
    }
  }, [activeThreadStorageKey, dataSource, upsertThread])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  useEffect(() => {
    if (!dataSource || !activeThreadId || !dataSource.subscribeThread) return undefined
    const controller = new AbortController()
    let dispose: (() => void) | undefined
    void Promise.resolve(dataSource.subscribeThread({
      threadId: activeThreadId,
      signal: controller.signal,
      onNotification: (notification) => {
        if (notification.event) {
          setRecentCapabilityEvents((current) => [
            { id: `${Date.now()}:${current.length}:${notification.method}`, event: notification.event as AgentChatNotificationEvent },
            ...current,
          ].slice(0, 6))
        }
        applyAgentChatNotification(notification, {
          upsertThread,
          setThreads,
          activeThreadId,
          activeThreadStorageKey,
          setActiveThreadId,
          setPendingUserItems,
          setPendingServerRequests,
          setStreamingAgentItems,
          readThread: (threadId) => {
            void dataSource.readThread(threadId, { includeTurns: true })
              .then((thread) => upsertThread(thread))
              .catch((nextError) => setError(errorMessage(nextError)))
          },
        })
      },
      onServerRequest: (request) => new Promise((resolve) => {
        setPendingServerRequests((current) => [
          ...current.filter((item) => item.request.id !== request.id),
          { request, resolve },
        ])
      }),
    })).then((cleanup) => {
      if (typeof cleanup === 'function') dispose = cleanup
    })
    return () => {
      controller.abort()
      dispose?.()
    }
  }, [activeThreadId, dataSource, upsertThread])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [threads, pendingUserItems, streamingAgentItems, activeThreadId])

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null
  const activeTurn = useMemo(() => activeThread?.turns.find(agentChatTurnIsActive) ?? null, [activeThread])
  const visibleItems = useMemo(() => {
    if (!activeThread) return []
    return buildVisibleItems(activeThread, pendingUserItems, streamingAgentItems)
  }, [activeThread, pendingUserItems, streamingAgentItems])

  const canSteerActiveTurn = Boolean(activeTurn && dataSource?.steerTurn)
  const canSend = Boolean(
    dataSource
    && (composer.input.trim() || composer.composerAttachments.length > 0)
    && !sending
    && !composer.uploading
    && (!activeTurn || canSteerActiveTurn),
  )
  const canStopActiveTurn = Boolean(activeTurn && dataSource?.interruptTurn && !stoppingTurn)
  const resolvedHost = host ?? (surface === 'page' ? 'immersive' : 'dock-panel')
  const shellClassName = surface === 'page'
    ? 'ai-agent-panel-shell agent-page-chat-shell project-agent-chat-shell'
    : 'ai-agent-panel-shell'
  const sendMessage = useCallback(async () => {
    if (!dataSource || sending) return
    const text = composer.input.trim()
    const inputs = agentChatInputsFromComposer(text, composer.composerAttachments)
    if (inputs.length === 0) return
    const previousWorkspace = {
      input: composer.input,
      attachments: composer.attachments,
    }
    let restoreConversationId = composerConversationId
    setSending(true)
    setError(null)
    try {
      const thread = activeThread ?? await startThread()
      if (!thread) return
      restoreConversationId = agentChatComposerConversationId(activeThreadStorageKey, thread.id)
      useAgentSessionStore.getState().updateConversationWorkspace(userId, restoreConversationId, { input: '', attachments: [] })
      if (restoreConversationId !== composerConversationId) composer.updateWorkspace({ input: '', attachments: [] })
      clearAgentChatComposerEditor(composerInputRef.current)
      const clientUserMessageId = `agent_user_${Date.now()}`
      setPendingUserItems((current) => [
        ...current,
        {
          threadId: thread.id,
          item: {
            type: 'userMessage',
            id: clientUserMessageId,
            clientId: clientUserMessageId,
            content: inputs,
          },
        },
      ])
      if (activeTurn && dataSource.steerTurn) {
        await dataSource.steerTurn({
          threadId: thread.id,
          turnId: activeTurn.id,
          clientUserMessageId,
          inputs,
        })
      } else if (dataSource.startTurn) {
        await dataSource.startTurn({
          threadId: thread.id,
          clientUserMessageId,
          inputs,
        })
      } else {
        await dataSource.startTextTurn({
          threadId: thread.id,
          clientUserMessageId,
          text,
        })
      }
    } catch (nextError) {
      useAgentSessionStore.getState().updateConversationWorkspace(userId, restoreConversationId, previousWorkspace)
      setError(errorMessage(nextError))
    } finally {
      setSending(false)
    }
  }, [activeThread, activeThreadStorageKey, activeTurn, composer, composerConversationId, dataSource, sending, startThread, userId])

  const stopActiveTurn = useCallback(async () => {
    if (!dataSource?.interruptTurn || !activeThread || !activeTurn || stoppingTurn) return
    setStoppingTurn(true)
    setError(null)
    try {
      await dataSource.interruptTurn({
        threadId: activeThread.id,
        turnId: activeTurn.id,
        reason: `Interrupted from ${providerLabel}.`,
      })
      const thread = await dataSource.readThread(activeThread.id, { includeTurns: true })
      upsertThread(thread)
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setStoppingTurn(false)
    }
  }, [activeThread, activeTurn, dataSource, providerLabel, stoppingTurn, upsertThread])

  const resolveServerRequest = useCallback((requestId: string, response: AgentChatServerRequestResponse | undefined) => {
    setPendingServerRequests((current) => {
      const pending = current.find((item) => item.request.id === requestId)
      pending?.resolve(response)
      return current.filter((item) => item.request.id !== requestId)
    })
  }, [])

  const renameThread = useCallback(async (threadId: string, name: string) => {
    if (!dataSource?.renameThread) return
    setError(null)
    try {
      const response = await dataSource.renameThread({ threadId, name })
      if (isAgentChatThread(response)) upsertThread(response)
      else {
        setThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, name, updatedAt: Date.now() } : thread))
      }
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }, [dataSource, upsertThread])

  const archiveThread = useCallback(async (threadId: string) => {
    if (!dataSource?.archiveThread) {
      if (threadId === activeThreadId) {
        setActiveThreadId(null)
        writeStoredActiveThreadId(activeThreadStorageKey, null)
      }
      return
    }
    setError(null)
    try {
      await dataSource.archiveThread({ threadId })
      setThreads((current) => current.filter((thread) => thread.id !== threadId))
      if (threadId === activeThreadId) {
        setActiveThreadId(null)
        writeStoredActiveThreadId(activeThreadStorageKey, null)
      }
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }, [activeThreadId, activeThreadStorageKey, dataSource])

  const threadTabs = useMemo(() => threads.map((thread) => ({
    id: thread.id,
    title: thread.name || thread.preview || 'Untitled thread',
    messageCount: thread.turns.reduce((count, turn) => count + turn.items.filter((item) => item.type === 'userMessage' || item.type === 'agentMessage').length, 0),
    runtimeState: agentChatThreadRuntimeState(thread),
    ...(dataSource?.renameThread ? { onRename: (name: string) => void renameThread(thread.id, name) } : {}),
  })), [dataSource?.renameThread, renameThread, threads])

  if (!dataSource) {
    return (
      <AgentShell density="compact" className={shellClassName}>
        <AgentMain className={surface === 'page' ? 'agent-page-chat-main' : 'ai-agent-panel-main'} data-agent-chat-host={resolvedHost}>
          <AgentEmpty role="status" aria-live="polite">
            <span>{error || unavailableLabel}</span>
          </AgentEmpty>
        </AgentMain>
      </AgentShell>
    )
  }

  const listPanel = showThreadList && !activeThread ? (
    <AgentConversationListPanel
      conversations={threads.map((thread) => ({
        id: thread.id,
        title: thread.name || thread.preview || 'Untitled thread',
        description: thread.preview || endpoint || dataSource.label,
        meta: formatAgentChatTime(thread.updatedAt),
        onClick: () => void openThread(thread.id),
        ...(dataSource.renameThread ? { onRename: (name: string) => void renameThread(thread.id, name) } : {}),
        ...(dataSource.archiveThread ? { onArchive: () => void archiveThread(thread.id) } : {}),
      }))}
      localThreads={[]}
      onNew={() => void startThread()}
      onCollapse={onCollapse}
      onRefreshLocalThreads={() => void loadThreads()}
      showCollapse={showCollapse}
      emptyLabel={loading ? 'Loading' : emptyThreadListLabel}
      localRuntimeLabel={threadListLabel}
      localRuntimeThreadsEmptyLabel={emptyThreadListLabel}
      newConversationLabel={newThreadLabel}
      collapseAssistantLabel="Collapse assistant"
      archiveConversationLabel="Archive conversation"
      deleteConversationLabel="Delete conversation"
      renameConversationLabel="Rename conversation"
      refreshLabel="Refresh"
    />
  ) : null

  return (
    <AgentShell density="compact" data-agent-chat-host={resolvedHost} className={shellClassName}>
      {listPanel ?? (
        <AgentMain className={surface === 'page' ? 'agent-page-chat-main' : 'ai-agent-panel-main'} data-agent-chat-host={resolvedHost}>
          {surface === 'panel' ? (
            <section className="ai-agent-panel-content-card" data-empty-conversation={!visibleItems.length ? 'true' : undefined}>
              <AgentHeader className="ai-agent-panel-chat-header">
                <div className="ai-agent-panel-chat-toolbar">
                  <div className="ai-agent-panel-chat-toolbar-tabs">
                    {activeThreadId ? (
                      <AgentConversationTabsPanel
                        activeConversationId={activeThreadId}
                        conversations={threadTabs}
                        onCloseConversation={(threadId) => {
                          void archiveThread(threadId)
                        }}
                        onCloseTabContextMenu={() => undefined}
                        onOpenKeyboardMenu={() => undefined}
                        onOpenMenu={() => undefined}
                        onReorderConversation={() => undefined}
                        onSelectConversation={(threadId) => void openThread(threadId)}
                        conversationTabsLabel={threadListLabel}
                        closeConversationLabel="Close conversation"
                        archiveConversationLabel="Archive conversation"
                        renameConversationLabel="Rename conversation"
                      />
                    ) : null}
                  </div>
                  <AgentHeaderActions className="ai-agent-panel-chat-toolbar-actions">
                    <AgentStatus state={sending || loading || activeTurn ? 'running' : 'idle'}>
                      {loading ? 'Loading' : sending ? activeTurn ? 'Steering' : 'Sending' : activeTurn ? 'Running' : providerLabel}
                    </AgentStatus>
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => void startThread()} aria-label={newThreadLabel} title={newThreadLabel}>
                      +
                    </Button>
                  </AgentHeaderActions>
                </div>
              </AgentHeader>
              <AgentChatDataSourceThreadBody
                emptyThreadLabel={emptyThreadLabel}
                error={error}
                pendingServerRequests={pendingServerRequests.filter((item) => !item.request.threadId || item.request.threadId === activeThreadId)}
          recentCapabilityEvents={recentCapabilityEvents}
                onResolveServerRequest={resolveServerRequest}
                scrollRef={scrollRef}
                visibleItems={visibleItems}
              />
            </section>
          ) : (
            <section className={`agent-page-chat-thread-shell${!visibleItems.length ? ' agent-page-chat-thread-shell--empty' : ''}`} aria-label={composerPlaceholder}>
              {!visibleItems.length ? (
                <div className="agent-page-chat-empty">
                  <h1 className="agent-page-chat-empty-title">{emptyThreadLabel}</h1>
                </div>
              ) : (
                <div className="agent-page-chat-thread">
                  <AgentChatDataSourceThreadBody
                    emptyThreadLabel={emptyThreadLabel}
                    error={error}
                    pendingServerRequests={pendingServerRequests.filter((item) => !item.request.threadId || item.request.threadId === activeThreadId)}
                    recentCapabilityEvents={recentCapabilityEvents}
                    onResolveServerRequest={resolveServerRequest}
                    scrollRef={scrollRef}
                    visibleItems={visibleItems}
                  />
                </div>
              )}
            </section>
          )}
          <div className={surface === 'page' ? 'agent-page-chat-composer' : undefined}>
            <AgentComposerSection
              answeringPendingInput={false}
              addMentionTrigger={composer.addMentionTrigger}
              buildingSendWorkspace={false}
              canSend={canSend}
              canAnswerPendingInputWithText={false}
              canStopLocalRun={canStopActiveTurn}
              chrome={surface === 'page' ? 'flush' : 'bottom-bar'}
              composerAttachmentEntries={composer.composerAttachmentEntries}
              composerAttachmentsCount={composer.composerAttachments.length}
              composerPlaceholder={composerPlaceholder}
              debugBeforeSend={false}
              draggingFiles={composer.draggingFiles}
              fileRef={composerFileRef}
              inputRef={composerInputRef}
              loading={sending}
              mentionRangeActive={!!composer.mentionRange}
              mentionResults={composer.mentionResults}
              pendingRuntimeInputQueue={[]}
              stoppingLocalRun={stoppingTurn}
              uploadedFileCount={composer.uploadedFileCount}
              uploading={composer.uploading}
              uploadingFileNames={composer.uploadingFileNames}
              onAcceptMention={() => {
                if (composer.mentionRange && composer.mentionResults.length > 0) {
                  composer.insertResourceMention(composer.mentionResults[0])
                  return true
                }
                return false
              }}
              onComposerDragEnter={composer.handleComposerDragEnter}
              onComposerDragLeave={composer.handleComposerDragLeave}
              onComposerDragOver={composer.handleComposerDragOver}
              onComposerDrop={(event) => void composer.handleComposerDrop(event)}
              onComposerPaste={(event) => void composer.handleComposerPaste(event)}
              onDebugBeforeSendChange={() => undefined}
              onInputChange={(nextInput) => composer.updateWorkspace({ input: nextInput })}
              onMentionEscape={() => composer.setMentionRange(null)}
              onMentionSelect={composer.insertResourceMention}
              onMentionState={composer.updateMentionState}
              onRemoveAttachment={composer.removeAttachment}
              onSend={() => void sendMessage()}
              onStopLocalRun={() => void stopActiveTurn()}
              onUploadFiles={(files) => void composer.uploadFiles(files)}
              showAttachmentTools
              showDebugPreview={false}
              showMentionTools
            />
          </div>
        </AgentMain>
      )}
    </AgentShell>
  )
}

function clearAgentChatComposerEditor(editor: HTMLDivElement | null): void {
  if (!editor) return
  editor.textContent = ''
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }))
}

function agentChatComposerConversationId(activeThreadStorageKey: string, threadId: string | null): string {
  return `${activeThreadStorageKey}:${threadId ?? 'draft'}`
}

function agentChatInputsFromComposer(text: string, attachments: AgentAttachment[]): AgentChatInput[] {
  const inputs: AgentChatInput[] = []
  if (text) inputs.push(agentChatTextInput(text))
  for (const attachment of attachments) {
    if (attachment.type === 'image') {
      const url = attachmentDisplayUrl(attachment)
      if (url) {
        inputs.push({ type: 'image', url, detail: 'auto' })
        continue
      }
    }
    if (attachment.resourceId !== undefined) {
      inputs.push({
        type: 'mention',
        name: attachment.name || `resource-${attachment.resourceId}`,
        path: `resource:${attachment.resourceId}`,
      })
    }
  }
  return inputs
}

function isAgentChatThread(value: unknown): value is AgentChatThread {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as AgentChatThread).id === 'string'
    && Array.isArray((value as AgentChatThread).turns),
  )
}

function AgentChatDataSourceThreadBody({
  emptyThreadLabel,
  error,
  pendingServerRequests,
  recentCapabilityEvents,
  onResolveServerRequest,
  scrollRef,
  visibleItems,
}: {
  emptyThreadLabel: string
  error: string | null
  pendingServerRequests: PendingServerRequest[]
  recentCapabilityEvents: RecentCapabilityEvent[]
  onResolveServerRequest: (requestId: string, response: AgentChatServerRequestResponse | undefined) => void
  scrollRef: { current: HTMLDivElement | null }
  visibleItems: Array<{ viewId: string; item: AgentChatThreadItem; streaming: boolean }>
}) {
  return (
    <AgentBody className="ai-agent-panel-thread-body">
      <AgentThreadFill ref={(node) => { scrollRef.current = node }} className="px-4 py-5">
        {error ? (
          <div className="mb-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        ) : null}
        {pendingServerRequests.length > 0 ? (
          <div className="mb-3 space-y-2">
            {pendingServerRequests.map(({ request }) => (
              <AgentChatServerRequestCard
                key={request.id}
                request={request}
                onApprove={() => onResolveServerRequest(request.id, agentChatApproveResponse(request))}
                onReject={() => onResolveServerRequest(request.id, agentChatRejectResponse(request))}
              />
            ))}
          </div>
        ) : null}
        {recentCapabilityEvents.length > 0 ? (
          <div className="mb-3 space-y-2" data-testid="agent-chat-capability-events">
            {recentCapabilityEvents.map((item) => (
              <AgentChatCapabilityEventCard key={item.id} event={item.event} />
            ))}
          </div>
        ) : null}
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {visibleItems.map((item) => (
            <AgentChatThreadItemView key={item.viewId} item={item.item} streaming={item.streaming} />
          ))}
          {!visibleItems.length ? (
            <AgentEmpty>
              <span>{emptyThreadLabel}</span>
            </AgentEmpty>
          ) : null}
        </div>
      </AgentThreadFill>
    </AgentBody>
  )
}

function AgentChatCapabilityEventCard({ event }: { event: AgentChatNotificationEvent }) {
  return (
    <AgentChatMessage role="system" avatar="~" data-testid="agent-chat-capability-event">
      <div className="ms-agent-message-section">
        <div className="text-sm font-medium text-foreground">{agentChatCapabilityEventTitle(event)}</div>
        <div className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{agentChatCapabilityEventDetail(event)}</div>
      </div>
    </AgentChatMessage>
  )
}

function agentChatCapabilityEventTitle(event: AgentChatNotificationEvent): string {
  if (event.type === 'commandOutput') return `Command output · ${event.stream}`
  if (event.type === 'processOutput') return `Process output · ${event.stream}`
  if (event.type === 'processExited') return `Process exited · ${event.exitCode}`
  if (event.type === 'fsChanged') return `Files changed · ${event.watchId}`
  if (event.type === 'threadLifecycle') return `Thread ${event.action}`
  if (event.type === 'serverRequestResolved') return 'Request resolved'
  if (event.type === 'realtime') return `Realtime · ${event.event}`
  if (event.type === 'account') return `Account · ${event.event}`
  if (event.type === 'mcpStatus') return `MCP · ${event.server}`
  return event.title
}

function agentChatCapabilityEventDetail(event: AgentChatNotificationEvent): string {
  if (event.type === 'commandOutput' || event.type === 'processOutput') {
    const text = event.text.trim() || event.deltaBase64
    return text.length > 500 ? `${text.slice(0, 500)}...` : text
  }
  if (event.type === 'processExited') {
    return [`stdout: ${event.stdout || '-'}`, `stderr: ${event.stderr || '-'}`].join('\n')
  }
  if (event.type === 'fsChanged') return event.changedPaths.join('\n') || 'No paths reported'
  if (event.type === 'threadLifecycle') return event.threadId
  if (event.type === 'serverRequestResolved') return event.requestId
  if (event.type === 'realtime') {
    return event.text || event.delta || event.message || event.reason || event.sdp || event.realtimeSessionId || event.threadId || ''
  }
  if (event.type === 'account') return agentChatValuePreview(event.detail)
  if (event.type === 'mcpStatus') return [event.status, event.error].filter(Boolean).join('\n')
  return [event.code, event.detail].filter(Boolean).join('\n')
}

function AgentChatServerRequestCard({
  request,
  onApprove,
  onReject,
}: {
  request: AgentChatServerRequest
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <AgentChatMessage role="system" avatar="!" data-testid="agent-chat-server-request">
      <div className="ms-agent-message-section">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{agentChatServerRequestTitle(request)}</div>
            <div className="truncate text-xs text-muted-foreground">{request.method}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onReject}>
              Reject
            </Button>
            <Button type="button" size="sm" onClick={onApprove} disabled={!agentChatServerRequestCanApprove(request)}>
              Approve
            </Button>
          </div>
        </div>
      </div>
    </AgentChatMessage>
  )
}

function agentChatServerRequestTitle(request: AgentChatServerRequest): string {
  if (request.method === 'item/commandExecution/requestApproval') return 'Command approval required'
  if (request.method === 'item/fileChange/requestApproval') return 'File change approval required'
  if (request.method === 'item/permissions/requestApproval') return 'Permission approval required'
  if (request.method === 'item/tool/requestUserInput') return 'Input required'
  if (request.method === 'mcpServer/elicitation/request') return 'MCP input required'
  if (request.method === 'item/tool/call') return 'Tool call requested'
  return 'Agent request'
}

function agentChatServerRequestCanApprove(request: AgentChatServerRequest): boolean {
  return request.method !== 'item/tool/requestUserInput' && request.method !== 'item/tool/call'
}

function agentChatApproveResponse(request: AgentChatServerRequest): AgentChatServerRequestResponse {
  if (request.method === 'mcpServer/elicitation/request') return { action: 'elicitation', accepted: true, content: null, meta: null }
  if (request.method === 'item/permissions/requestApproval') {
    const params = isRecord(request.params) ? request.params : {}
    return {
      action: 'approve',
      permissions: isRecord(params.permissions) ? params.permissions : {},
      scope: 'turn',
      strictAutoReview: false,
    }
  }
  if (request.method === 'item/tool/call') return { action: 'toolResult', success: true, contentItems: [] }
  return { action: 'approve' }
}

function agentChatRejectResponse(request: AgentChatServerRequest): AgentChatServerRequestResponse {
  if (request.method === 'mcpServer/elicitation/request') return { action: 'elicitation', accepted: false, content: null, meta: null }
  if (request.method === 'item/tool/requestUserInput') return { action: 'answer', answers: {}, text: 'Rejected.' }
  if (request.method === 'item/tool/call') return { action: 'toolResult', success: false, contentItems: [] }
  return { action: 'reject' }
}

export function openAgentChatDataSourceThread(input: {
  storageKey: string
  eventName: string
  threadId: string
}): void {
  if (typeof window === 'undefined') return
  writeStoredActiveThreadId(input.storageKey, input.threadId)
  window.dispatchEvent(new CustomEvent(input.eventName, { detail: { threadId: input.threadId } }))
}

function AgentChatThreadItemView({ item, streaming }: { item: AgentChatThreadItem; streaming?: boolean }) {
  if (item.type === 'userMessage') {
    const text = userMessageText(item)
    return (
      <AgentChatMessage role="user" avatar="U" data-testid="agent-chat-user-message">
        <div className="whitespace-pre-wrap break-words">{text}</div>
      </AgentChatMessage>
    )
  }
  if (item.type === 'agentMessage') {
    return (
      <AgentChatMessage role="assistant" avatar="AI" data-testid="agent-chat-agent-message">
        <div className="whitespace-pre-wrap break-words">{item.text || (streaming ? '...' : '')}</div>
      </AgentChatMessage>
    )
  }
  if (item.type === 'reasoning' || item.type === 'plan') {
    const text = item.type === 'reasoning'
      ? [...item.summary, ...item.content].join('\n')
      : item.text
    if (!text.trim()) return null
    return (
      <AgentChatMessage role="assistant" avatar="AI">
        <div className="ms-agent-message-section">
          <div className="whitespace-pre-wrap break-words text-muted-foreground">{text}</div>
        </div>
      </AgentChatMessage>
    )
  }
  if (item.type === 'commandExecution') {
    return (
      <AgentChatMessage role="tool" avatar="$">
        <div className="ms-agent-message-section">
          <div className="font-medium text-foreground">{item.command || 'Command'}</div>
          {item.aggregatedOutput ? <pre className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{item.aggregatedOutput}</pre> : null}
        </div>
      </AgentChatMessage>
    )
  }
  if (item.type === 'dynamicToolCall' || item.type === 'mcpToolCall') {
    const title = item.type === 'dynamicToolCall' ? item.tool : `${item.server}/${item.tool}`
    return (
      <AgentChatMessage role="tool" avatar="T">
        <div className="ms-agent-message-section">
          <div className="font-medium text-foreground">{title}</div>
          {'status' in item && item.status ? <div className="mt-1 text-muted-foreground">{item.status}</div> : null}
        </div>
      </AgentChatMessage>
    )
  }
  if (item.type === 'fileChange') {
    return (
      <AgentChatMessage role="tool" avatar="F">
        <div className="ms-agent-message-section">
          <div className="font-medium text-foreground">File changes</div>
          {item.status ? <div className="mt-1 text-muted-foreground">{item.status}</div> : null}
          {item.changes ? <pre className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{agentChatValuePreview(item.changes)}</pre> : null}
        </div>
      </AgentChatMessage>
    )
  }
  if (item.type === 'webSearch') {
    return (
      <AgentChatMessage role="tool" avatar="W">
        <div className="ms-agent-message-section">
          <div className="font-medium text-foreground">Web search</div>
          <div className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{item.query}</div>
        </div>
      </AgentChatMessage>
    )
  }
  if (item.type === 'imageView' || item.type === 'imageGeneration') {
    const title = item.type === 'imageView' ? 'Image viewed' : 'Image generation'
    const detail = item.type === 'imageView'
      ? item.path
      : item.savedPath || item.result || item.status
    return (
      <AgentChatMessage role="tool" avatar="I">
        <div className="ms-agent-message-section">
          <div className="font-medium text-foreground">{title}</div>
          <div className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{detail}</div>
        </div>
      </AgentChatMessage>
    )
  }
  if (item.type === 'reviewMode' || item.type === 'contextCompaction' || item.type === 'unknown') {
    const title = item.type === 'reviewMode'
      ? `${item.action === 'entered' ? 'Entered' : 'Exited'} review mode`
      : item.type === 'contextCompaction'
        ? 'Context compacted'
        : `Unknown item: ${item.providerType}`
    const detail = item.type === 'reviewMode'
      ? item.review
      : item.type === 'unknown'
        ? agentChatValuePreview(item.raw)
        : ''
    return (
      <AgentChatMessage role="system" avatar="i">
        <div className="ms-agent-message-section">
          <div className="font-medium text-foreground">{title}</div>
          {detail ? <pre className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">{detail}</pre> : null}
        </div>
      </AgentChatMessage>
    )
  }
  return null
}

function agentChatValuePreview(value: unknown): string {
  try {
    const preview = JSON.stringify(value, null, 2)
    if (!preview) return ''
    return preview.length > 1600 ? `${preview.slice(0, 1600)}...` : preview
  } catch {
    return String(value)
  }
}

function applyAgentChatNotification(notification: AgentChatNotification, state: {
  upsertThread: (thread: AgentChatThread) => void
  setThreads: Dispatch<SetStateAction<AgentChatThread[]>>
  activeThreadId: string | null
  activeThreadStorageKey: string
  setActiveThreadId: Dispatch<SetStateAction<string | null>>
  setPendingUserItems: Dispatch<SetStateAction<PendingUserItem[]>>
  setPendingServerRequests: Dispatch<SetStateAction<PendingServerRequest[]>>
  setStreamingAgentItems: Dispatch<SetStateAction<Record<string, { threadId: string; turnId: string; itemId: string; text: string }>>>
  readThread: (threadId: string) => void
}) {
  applyAgentChatNotificationEvent(notification.event, state)
  const params = isRecord(notification.params) ? notification.params : {}
  const threadId = stringField(params.threadId)
  if (notification.method === 'thread/started') {
    const thread = isRecord(params.thread) ? normalizeThread(params.thread) : null
    if (thread) state.upsertThread(thread)
    return
  }
  if (!threadId) return
  if (notification.method === 'thread/status/changed') {
    const status = agentChatThreadStatusField(params.status)
    if (!status) return
    state.setThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, status, updatedAt: Math.max(thread.updatedAt, unixSecondsNow()) } : thread))
    return
  }
  if (notification.method === 'thread/name/updated') {
    const name = stringField(params.threadName) ?? null
    state.setThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, name, updatedAt: Math.max(thread.updatedAt, unixSecondsNow()) } : thread))
    return
  }
  if (notification.method === 'turn/started') {
    const turn = isRecord(params.turn) ? normalizeTurn(params.turn) : null
    if (!turn) return
    state.setThreads((current) => current.map((thread) => thread.id === threadId ? upsertTurn(thread, turn) : thread))
    return
  }
  if (notification.method === 'item/plan/delta') {
    const turnId = stringField(params.turnId)
    const itemId = stringField(params.itemId)
    const delta = stringField(params.delta)
    if (!turnId || !itemId || !delta) return
    state.setThreads((current) => current.map((thread) => thread.id === threadId ? appendDeltaTurnItem(thread, turnId, {
      type: 'plan',
      id: itemId,
      text: delta,
    }, delta) : thread))
    return
  }
  if (notification.method === 'item/reasoning/textDelta' || notification.method === 'item/reasoning/summaryTextDelta') {
    const turnId = stringField(params.turnId)
    const itemId = stringField(params.itemId)
    const delta = stringField(params.delta)
    if (!turnId || !itemId || !delta) return
    const summaryDelta = notification.method === 'item/reasoning/summaryTextDelta'
    state.setThreads((current) => current.map((thread) => thread.id === threadId ? appendDeltaTurnItem(thread, turnId, {
      type: 'reasoning',
      id: itemId,
      summary: summaryDelta ? [delta] : [],
      content: summaryDelta ? [] : [delta],
    }, delta, summaryDelta ? 'summary' : 'content') : thread))
    return
  }
  if (notification.method === 'command/exec/outputDelta' || notification.method === 'item/commandExecution/outputDelta') {
    const turnId = stringField(params.turnId)
    const itemId = stringField(params.itemId)
    const delta = stringField(params.delta)
    if (!turnId || !itemId || !delta) return
    state.setThreads((current) => current.map((thread) => thread.id === threadId ? appendDeltaTurnItem(thread, turnId, {
      type: 'commandExecution',
      id: itemId,
      command: 'Command',
      aggregatedOutput: delta,
    }, delta) : thread))
    return
  }
  if (notification.method === 'item/fileChange/outputDelta') {
    const turnId = stringField(params.turnId)
    const itemId = stringField(params.itemId)
    const delta = stringField(params.delta)
    if (!turnId || !itemId || !delta) return
    state.setThreads((current) => current.map((thread) => thread.id === threadId ? appendDeltaTurnItem(thread, turnId, {
      type: 'fileChange',
      id: itemId,
      status: 'streaming',
      changes: [delta],
    }, delta) : thread))
    return
  }
  if (notification.method === 'item/agentMessage/delta') {
    const turnId = stringField(params.turnId)
    const itemId = stringField(params.itemId)
    const delta = stringField(params.delta)
    if (!turnId || !itemId || !delta) return
    state.setStreamingAgentItems((current) => {
      const previous = current[itemId]
      return {
        ...current,
        [itemId]: {
          threadId,
          turnId,
          itemId,
          text: `${previous?.text ?? ''}${delta}`,
        },
      }
    })
    return
  }
  if (notification.method === 'item/completed') {
    const turnId = stringField(params.turnId)
    const item = isRecord(params.item) ? params.item as AgentChatThreadItem : null
    if (!turnId || !item) return
    state.setPendingUserItems((current) => current.filter((pending) => {
      if (pending.threadId !== threadId) return true
      return Boolean(pending.item.clientId && pending.item.clientId !== (item as { clientId?: string | null }).clientId)
    }))
    state.setStreamingAgentItems((current) => {
      const next = { ...current }
      delete next[item.id]
      return next
    })
    state.setThreads((current) => current.map((thread) => thread.id === threadId ? appendTurnItem(thread, turnId, item) : thread))
    return
  }
  if (notification.method === 'turn/completed') {
    const turn = isRecord(params.turn) ? normalizeTurn(params.turn) : null
    if (!turn) return
    state.setThreads((current) => current.map((thread) => thread.id === threadId ? upsertTurn(thread, turn) : thread))
    state.setPendingUserItems((current) => current.filter((pending) => pending.threadId !== threadId))
    state.setStreamingAgentItems((current) => {
      const next = { ...current }
      for (const [itemId, item] of Object.entries(current)) {
        if (item.threadId === threadId && item.turnId === turn.id) delete next[itemId]
      }
      return next
    })
    state.readThread(threadId)
  }
}

function applyAgentChatNotificationEvent(event: AgentChatNotificationEvent | undefined, state: {
  activeThreadId: string | null
  activeThreadStorageKey: string
  setActiveThreadId: Dispatch<SetStateAction<string | null>>
  setThreads: Dispatch<SetStateAction<AgentChatThread[]>>
  setPendingUserItems: Dispatch<SetStateAction<PendingUserItem[]>>
  setPendingServerRequests: Dispatch<SetStateAction<PendingServerRequest[]>>
  setStreamingAgentItems: Dispatch<SetStateAction<Record<string, { threadId: string; turnId: string; itemId: string; text: string }>>>
  readThread: (threadId: string) => void
}): void {
  if (!event) return
  if (event.type === 'threadLifecycle') {
    if (event.action === 'unarchived') {
      state.readThread(event.threadId)
      return
    }
    state.setThreads((current) => current.filter((thread) => thread.id !== event.threadId))
    state.setPendingUserItems((current) => current.filter((item) => item.threadId !== event.threadId))
    state.setPendingServerRequests((current) => current.filter((item) => item.request.threadId !== event.threadId))
    state.setStreamingAgentItems((current) => {
      const next = { ...current }
      for (const [itemId, item] of Object.entries(current)) {
        if (item.threadId === event.threadId) delete next[itemId]
      }
      return next
    })
    if (state.activeThreadId === event.threadId) {
      state.setActiveThreadId(null)
      writeStoredActiveThreadId(state.activeThreadStorageKey, null)
    }
    return
  }
  if (event.type === 'serverRequestResolved') {
    state.setPendingServerRequests((current) => current.filter((item) => item.request.id !== event.requestId))
  }
}

function normalizeThread(value: Record<string, unknown>): AgentChatThread | null {
  const id = stringField(value.id)
  if (!id) return null
  return {
    provider: agentChatProviderKind(value.provider),
    id,
    sessionId: stringField(value.sessionId) ?? id,
    preview: stringField(value.preview) ?? '',
    name: stringField(value.name) ?? null,
    createdAt: numberField(value.createdAt) ?? unixSecondsNow(),
    updatedAt: numberField(value.updatedAt) ?? unixSecondsNow(),
    status: agentChatThreadStatusField(value.status) ?? 'unknown',
    turns: Array.isArray(value.turns)
      ? value.turns.flatMap((turn) => isRecord(turn) ? [normalizeTurn(turn)].filter(Boolean) as AgentChatTurn[] : [])
      : [],
    raw: value.raw ?? value,
  }
}

function buildVisibleItems(
  thread: AgentChatThread,
  pendingUserItems: PendingUserItem[],
  streamingAgentItems: Record<string, { threadId: string; turnId: string; itemId: string; text: string }>,
) {
  const items = thread.turns.flatMap((turn) => turn.items.map((item) => ({ viewId: `${turn.id}:${item.id}`, item, streaming: false })))
  const itemIds = new Set(items.map((item) => item.item.id).filter(Boolean))
  for (const pending of pendingUserItems) {
    if (pending.threadId === thread.id && !itemIds.has(pending.item.id)) {
      items.push({ viewId: `pending:${pending.item.id}`, item: pending.item, streaming: false })
    }
  }
  for (const streaming of Object.values(streamingAgentItems)) {
    if (streaming.threadId === thread.id && !itemIds.has(streaming.itemId)) {
      items.push({
        viewId: `streaming:${streaming.itemId}`,
        streaming: true,
        item: {
          type: 'agentMessage',
          id: streaming.itemId,
          text: streaming.text,
          phase: null,
          memoryCitation: null,
        },
      })
    }
  }
  return items
}

function upsertTurn(thread: AgentChatThread, turn: AgentChatTurn): AgentChatThread {
  const turns = thread.turns ?? []
  const nextTurns = turns.some((item) => item.id === turn.id)
    ? turns.map((item) => item.id === turn.id ? turn : item)
    : [...turns, turn]
  return { ...thread, turns: nextTurns, updatedAt: Math.max(thread.updatedAt, turn.completedAt ?? turn.startedAt ?? 0) }
}

function appendTurnItem(thread: AgentChatThread, turnId: string, item: AgentChatThreadItem): AgentChatThread {
  const turns = thread.turns ?? []
  const existingTurn = turns.find((turn) => turn.id === turnId)
  if (!existingTurn) {
    return upsertTurn(thread, {
      id: turnId,
      items: [item],
      itemsView: 'full',
      status: 'inProgress',
      error: null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
    })
  }
  const items = existingTurn.items.some((existing) => existing.id === item.id)
    ? existingTurn.items.map((existing) => existing.id === item.id ? item : existing)
    : [...existingTurn.items, item]
  return upsertTurn(thread, { ...existingTurn, items })
}

function appendDeltaTurnItem(
  thread: AgentChatThread,
  turnId: string,
  nextItem: AgentChatThreadItem,
  delta: string,
  reasoningTarget: 'summary' | 'content' = 'content',
): AgentChatThread {
  const turn = thread.turns.find((item) => item.id === turnId)
  const existing = turn?.items.find((item) => item.id === nextItem.id)
  if (!existing) return appendTurnItem(thread, turnId, nextItem)
  if (existing.type === 'agentMessage' && nextItem.type === 'agentMessage') {
    return appendTurnItem(thread, turnId, { ...existing, text: `${existing.text}${delta}` })
  }
  if (existing.type === 'plan' && nextItem.type === 'plan') {
    return appendTurnItem(thread, turnId, { ...existing, text: `${existing.text}${delta}` })
  }
  if (existing.type === 'reasoning' && nextItem.type === 'reasoning') {
    if (reasoningTarget === 'summary') {
      const summary = existing.summary.length ? [...existing.summary] : ['']
      summary[summary.length - 1] = `${summary[summary.length - 1] ?? ''}${delta}`
      return appendTurnItem(thread, turnId, { ...existing, summary })
    }
    const content = existing.content.length ? [...existing.content] : ['']
    content[content.length - 1] = `${content[content.length - 1] ?? ''}${delta}`
    return appendTurnItem(thread, turnId, { ...existing, content })
  }
  if (existing.type === 'commandExecution' && nextItem.type === 'commandExecution') {
    return appendTurnItem(thread, turnId, { ...existing, aggregatedOutput: `${existing.aggregatedOutput ?? ''}${delta}` })
  }
  if (existing.type === 'fileChange' && nextItem.type === 'fileChange') {
    const previousText = existing.changes?.map((change) => typeof change === 'string' ? change : agentChatValuePreview(change)).join('') ?? ''
    return appendTurnItem(thread, turnId, { ...existing, changes: [`${previousText}${delta}`] })
  }
  return appendTurnItem(thread, turnId, nextItem)
}

function normalizeTurn(value: Record<string, unknown>): AgentChatTurn | null {
  const id = stringField(value.id)
  if (!id) return null
  return {
    id,
    items: Array.isArray(value.items) ? value.items as AgentChatThreadItem[] : [],
    itemsView: value.itemsView === 'notLoaded' || value.itemsView === 'summary' || value.itemsView === 'full' ? value.itemsView : 'full',
    status: typeof value.status === 'string' ? value.status : 'inProgress',
    error: isRecord(value.error) ? value.error : null,
    startedAt: typeof value.startedAt === 'number' ? value.startedAt : null,
    completedAt: typeof value.completedAt === 'number' ? value.completedAt : null,
    durationMs: typeof value.durationMs === 'number' ? value.durationMs : null,
    raw: value.raw,
  }
}

function agentChatProviderKind(value: unknown): AgentChatThread['provider'] {
  return typeof value === 'string' && value.trim() ? value.trim() : 'codex'
}

function agentChatThreadStatusField(value: unknown): AgentChatThread['status'] | undefined {
  if (typeof value === 'string') {
    if (value === 'notLoaded' || value === 'idle' || value === 'running' || value === 'failed' || value === 'completed' || value === 'cancelled' || value === 'unknown') return value
    if (value === 'active') return 'running'
    if (value === 'systemError') return 'failed'
    return undefined
  }
  if (!isRecord(value)) return undefined
  return agentChatThreadStatusField(value.type)
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function unixSecondsNow(): number {
  return Math.floor(Date.now() / 1000)
}

function readStoredActiveThreadId(storageKey: string): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(storageKey)?.trim() || null
}

function writeStoredActiveThreadId(storageKey: string, threadId: string | null): void {
  if (typeof window === 'undefined') return
  if (threadId) window.localStorage.setItem(storageKey, threadId)
  else window.localStorage.removeItem(storageKey)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatAgentChatTime(value: number | undefined): string {
  if (!value) return ''
  return new Date(value * 1000).toLocaleString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function userMessageText(item: AgentChatThreadItem): string {
  const content = item.type === 'userMessage' ? item.content : []
  return content.map((part) => {
    if (!isRecord(part)) return ''
    return part.type === 'text' ? stringField(part.text) ?? '' : ''
  }).join('\n').trim()
}

function agentChatThreadRuntimeState(thread: AgentChatThread): 'stopped' | 'waiting' | 'active' {
  if (thread.status === 'running') return 'active'
  if (thread.status === 'failed') return 'waiting'
  return 'stopped'
}

function agentChatTurnIsActive(turn: AgentChatTurn): boolean {
  return turn.status === 'inProgress'
}
