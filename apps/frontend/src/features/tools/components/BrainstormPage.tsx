import { useState, useRef } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import { buildCommandFirstClientInput } from '@/features/agent/domain/agentCommandInput'
import { runRuntimeMessage } from '@/shared/infrastructure/runtimeChat'
import { formatLocalAgentAssistantContent } from '@/features/agent/components/localRuntime'
import { publicModelId } from '@/shared/domain/modelDisplay'
import type { PublicModel, RawResource } from '@/types'
import {
  Wand2, Loader2, Bot,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import { ModelSelector } from '@/shared/ui/ModelSelector'
import { ResourceLibraryView } from '@/features/resources/components/ResourcesPage'
import {
  Button,
  Textarea,
  ToolBrainstormActionRow,
  ToolBrainstormAttachmentChip,
  ToolBrainstormAttachmentList,
  ToolBrainstormBody,
  ToolBrainstormComposerFrame,
  ToolBrainstormDivider,
  ToolBrainstormEmptyFooter,
  ToolBrainstormEmptyState,
  ToolBrainstormFrame,
  ToolBrainstormMain,
  ToolBrainstormMentionButton,
  ToolBrainstormMentionList,
  ToolBrainstormPanel,
  ToolBrainstormPanelHeader,
  ToolBrainstormResultCard,
  ToolBrainstormSectionHeader,
  ToolDialogResourcePane,
  useResizableOverlapPane,
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import {
  TOOL_RESOURCE_PANE_MAIN_MIN_WIDTH,
  TOOL_RESOURCE_PANE_MAX_WIDTH,
  TOOL_RESOURCE_PANE_MIN_WIDTH,
  usePersistentToolResourcePaneWidth,
} from './toolResourcePaneWidth'

const AI_SYSTEM_PROMPT = `你是头脑风暴助手，专注于把用户的模糊想法整理成可执行的创意方向。
请用中文回答，输出要具体、可继续追问，并尽量给出可直接复用的素材或结构。`

interface BrainstormEntry {
  id: string
  prompt: string
  attachments: { id: number; name: string }[]
  result: string
  timestamp: number
  status: 'done' | 'failed' | 'pending'
  error?: string
}

// ── BrainstormResultCard ──────────────────────────────────────────────────────

function BrainstormResultCard({
  entry,
  onReuse,
}: {
  entry: BrainstormEntry
  onReuse: () => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <ToolBrainstormResultCard
      promptLabel={t('tools.brainstorm.prompt')}
      prompt={entry.prompt}
      attachments={entry.attachments}
      status={entry.status}
      result={entry.result}
      error={entry.error}
      pendingLabel={t('canvas.generating')}
      failedLabel={t('canvas.generationFailed')}
      timestampLabel={new Date(entry.timestamp).toLocaleString(i18n.language, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      reuseLabel={t('shared.genResult.reusePrompt')}
      onReuse={onReuse}
    />
  )
}

// ── BrainstormPage ────────────────────────────────────────────────────────────

export default function BrainstormPage() {
  const { t } = useTranslation()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<RawResource[]>([])
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState<PublicModel | null>(null)
  const [latestEntry, setLatestEntry] = useState<BrainstormEntry | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [resourcePaneCollapsed, setResourcePaneCollapsed] = useState(false)
  const [resourcePaneExpanded, setResourcePaneExpanded] = useState(false)
  const [resourcePaneWidth, setResourcePaneWidth] = usePersistentToolResourcePaneWidth()
  const resourcePaneResize = useResizableOverlapPane({
    size: resourcePaneWidth,
    onSizeChange: setResourcePaneWidth,
    minSize: TOOL_RESOURCE_PANE_MIN_WIDTH,
    maxSize: (rect) => Math.max(
      TOOL_RESOURCE_PANE_MIN_WIDTH,
      Math.min(TOOL_RESOURCE_PANE_MAX_WIDTH, rect.width - TOOL_RESOURCE_PANE_MAIN_MIN_WIDTH),
    ),
    resizeEdge: 'left',
    collapsed: resourcePaneCollapsed,
    onCollapsedChange: setResourcePaneCollapsed,
    collapseMode: 'after-min',
    expanded: resourcePaneExpanded,
    onExpandedChange: setResourcePaneExpanded,
    expandMode: 'after-max',
    ariaLabel: t('common.resize', { defaultValue: '调整宽度' }),
  })

  // @ mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionPos, setMentionPos] = useState(0)

  const { data: resources = [] } = useQuery<RawResource[]>({
    queryKey: ['resources'],
    queryFn: () => api.get('/resources').then((r) => r.data),
  })

  const canGenerate = !isRunning && !!prompt.trim() && !!selectedModelId

  function addAttachment(resource: RawResource) {
    setAttachments((current) => (
      current.some((attachment) => attachment.ID === resource.ID)
        ? current
        : [...current, resource]
    ))
  }

  async function generate() {
    if (!canGenerate) return

    const entryId = Math.random().toString(36).slice(2, 10)
    const newEntry: BrainstormEntry = {
      id: entryId,
      prompt: prompt.trim(),
      attachments: attachments.map((a) => ({ id: a.ID, name: a.name })),
      result: '',
      timestamp: Date.now(),
      status: 'pending',
    }

    setLatestEntry(newEntry)
    setPrompt('')
    setAttachments([])
    setIsRunning(true)

    try {
      const userPrompt = prompt.trim()
      const clientInput = buildCommandFirstClientInput({
        message: userPrompt,
        attachments: attachments.map((attachment) => ({
          id: String(attachment.ID),
          name: attachment.name,
          type: attachment.type,
          mimeType: attachment.mime_type,
          size: attachment.size,
          resourceId: attachment.ID,
        })),
      })
      const { run, thread } = await runRuntimeMessage({
        message: `${AI_SYSTEM_PROMPT}\n\n${userPrompt}`,
        title: 'Brainstorm',
        clientInput,
        modelId: selectedModel ? publicModelId(selectedModel) : undefined,
        timeoutMs: 60_000,
        pollMs: 400,
        standaloneTaskId: `brainstorm_${entryId}`,
        standaloneTaskType: 'brainstorm',
      })
      const resp = formatLocalAgentAssistantContent(run, thread)

      setLatestEntry((entry) =>
        entry?.id === entryId
          ? { ...entry, status: 'done', result: resp }
          : entry
      )
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err)
      setLatestEntry((entry) =>
        entry?.id === entryId
          ? { ...entry, status: 'failed', error: msg }
          : entry
      )
    } finally {
      setIsRunning(false)
    }
  }

  function handleTextareaChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setPrompt(val)
    // Auto-resize
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'

    // @ mention detection
    const cursor = e.target.selectionStart
    const before = val.slice(0, cursor)
    const match = before.match(/@(\w*)$/)
    if (match) {
      setMentionQuery(match[1])
      setMentionPos(cursor - match[0].length)
    } else {
      setMentionQuery(null)
    }
  }

  function insertMention(resource: RawResource) {
    const before = prompt.slice(0, mentionPos)
    const after = prompt.slice(textareaRef.current?.selectionStart ?? mentionPos)
    const inserted = `@${resource.name} `
    setPrompt(before + inserted + after)
    addAttachment(resource)
    setMentionQuery(null)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const mentionResults = mentionQuery !== null
    ? resources.filter((r) =>
        r.type === 'image' &&
        r.name.toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 6)
    : []

  return (
    <ToolBrainstormFrame>
      <ToolBrainstormBody
        className="tool-dialog-body--reference-workbench"
        data-resource-pane-collapsed={resourcePaneCollapsed ? 'true' : undefined}
        data-resource-pane-expanded={resourcePaneExpanded ? 'true' : undefined}
        style={{ '--tool-dialog-resource-pane-width': `${resourcePaneWidth}px` } as CSSProperties}
      >
        <ToolBrainstormMain
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const id = Number(e.dataTransfer.getData('application/resource-id'))
            if (!id) return
            const r = resources.find((r) => r.ID === id)
            if (r) addAttachment(r)
          }}
        >
          <ToolBrainstormPanel>
              <ToolBrainstormPanelHeader>
                <div className="min-w-0">
                  <p className="type-label font-medium text-foreground">{t('shared.modelSelector.label', { defaultValue: '模型' })}</p>
                  <p className="type-tiny text-muted-foreground">{t('tools.brainstorm.inputHint')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!resourcePaneCollapsed ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      title={t('common.hide', { defaultValue: '隐藏' })}
                      aria-label={t('common.hide', { defaultValue: '隐藏' })}
                      onClick={() => {
                        setResourcePaneExpanded(false)
                        setResourcePaneCollapsed(true)
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <PanelRightClose size={14} />
                    </Button>
                  ) : null}
                  <ModelSelector
                    capability="text"
                    value={selectedModelId}
                    onChange={setSelectedModelId}
                    onModelChange={setSelectedModel}
                  />
                </div>
              </ToolBrainstormPanelHeader>

              {/* Latest result */}
              {latestEntry && (
                <div className="space-y-1.5">
                  <ToolBrainstormSectionHeader icon={Bot}>
                    {t('tools.brainstorm.latestResult')}
                  </ToolBrainstormSectionHeader>
                  <BrainstormResultCard
                    entry={latestEntry}
                    onReuse={() => setPrompt(latestEntry.prompt)}
                  />
                </div>
              )}

              {latestEntry && <ToolBrainstormDivider />}

              {/* Input */}
              <div className="space-y-1.5">
                <ToolBrainstormSectionHeader>
                  {latestEntry ? t('tools.brainstorm.newQuestion') : t('tools.brainstorm.startQuestion')}
                </ToolBrainstormSectionHeader>

                {/* Attachment chips */}
                {attachments.length > 0 && (
                  <ToolBrainstormAttachmentList>
                    {attachments.map((a, i) => (
                      <ToolBrainstormAttachmentChip
                        key={a.ID}
                        removeLabel={t('common.remove', { defaultValue: '移除' })}
                        onRemove={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      >
                        {a.name}
                      </ToolBrainstormAttachmentChip>
                    ))}
                  </ToolBrainstormAttachmentList>
                )}

                {/* Textarea + mention dropdown */}
                <ToolBrainstormComposerFrame>
                  <Textarea
                    ref={textareaRef}
                    className="min-h-[80px] max-h-[160px] w-full resize-none px-3 py-2.5 type-body leading-relaxed"
                    rows={3}
                    placeholder={t('tools.brainstorm.promptPlaceholder')}
                    value={prompt}
                    onChange={handleTextareaChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        generate()
                      }
                      if (e.key === 'Escape') setMentionQuery(null)
                    }}
                  />

                  {/* @ mention dropdown */}
                  {mentionQuery !== null && mentionResults.length > 0 && (
                    <ToolBrainstormMentionList>
                      {mentionResults.map((r) => (
                        <ToolBrainstormMentionButton
                          key={r.ID}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            insertMention(r)
                          }}
                        >
                          {r.name}
                        </ToolBrainstormMentionButton>
                      ))}
                    </ToolBrainstormMentionList>
                  )}
                </ToolBrainstormComposerFrame>

                {/* Actions */}
                <ToolBrainstormActionRow>
                  <p className="type-tiny text-muted-foreground">
                    {!selectedModelId ? t('tools.brainstorm.selectModelFirst') : t('tools.brainstorm.inputHint')}
                  </p>
                  <Button
                    type="button"
                    onClick={generate}
                    disabled={!canGenerate}
                    className="gap-1.5"
                  >
                    {isRunning
                      ? <><Loader2 size={12} className="animate-spin" /> {t('canvas.generating')}</>
                      : <><Wand2 size={12} /> {t('agents.chat.send')}</>
                    }
                  </Button>
                </ToolBrainstormActionRow>
              </div>

            {!latestEntry && (
              <ToolBrainstormEmptyFooter>
                <ToolBrainstormEmptyState
                  icon={Bot}
                  title={t('tools.brainstorm.empty')}
                  detail={t('tools.brainstorm.emptyHint')}
                />
              </ToolBrainstormEmptyFooter>
            )}
          </ToolBrainstormPanel>
        </ToolBrainstormMain>
        {!resourcePaneCollapsed ? (
          <ToolDialogResourcePane
            resizeHandleProps={{
              ...resourcePaneResize.resizeHandleProps,
            }}
          >
            <ResourceLibraryView variant="pane" />
          </ToolDialogResourcePane>
        ) : null}
        {resourcePaneCollapsed ? (
          <Button
            type="button"
            variant="soft"
            size="icon-sm"
            className="overlap-pane-reveal-button overlap-pane-reveal-button--top overlap-pane-reveal-button--right"
            title={t('common.show', { defaultValue: '显示' })}
            aria-label={t('common.show', { defaultValue: '显示' })}
            onClick={() => {
              setResourcePaneExpanded(false)
              setResourcePaneCollapsed(false)
            }}
          >
            <PanelRightOpen size={14} />
          </Button>
        ) : null}
        {resourcePaneExpanded ? (
          <Button
            type="button"
            variant="soft"
            size="icon-sm"
            className="overlap-pane-reveal-button overlap-pane-reveal-button--top overlap-pane-reveal-button--right"
            title={t('common.restore', { defaultValue: '还原' })}
            aria-label={t('common.restore', { defaultValue: '还原' })}
            onClick={() => setResourcePaneExpanded(false)}
          >
            <PanelRightClose size={14} />
          </Button>
        ) : null}
      </ToolBrainstormBody>
    </ToolBrainstormFrame>
  )
}
