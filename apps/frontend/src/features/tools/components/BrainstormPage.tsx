import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import { buildCommandFirstClientInput } from '@/features/agent/domain/agentCommandInput'
import { runRuntimeMessage } from '@/shared/infrastructure/runtimeChat'
import { formatLocalAgentAssistantContent } from '@/features/agent/components/localRuntime'
import { publicModelId } from '@/shared/domain/modelDisplay'
import type { PublicModel, RawResource } from '@/types'
import {
  Wand2, Loader2, Bot,
  History,
} from 'lucide-react'
import { ModelSelector } from '@/shared/ui/ModelSelector'
import { ResourcePanel } from '@/shared/ui/ResourcePanel'
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
  ToolBrainstormHistoryDrawer,
  ToolBrainstormHistoryList,
  ToolBrainstormHistoryToggle,
  ToolBrainstormMain,
  ToolBrainstormMentionButton,
  ToolBrainstormMentionList,
  ToolBrainstormPanel,
  ToolBrainstormPanelHeader,
  ToolBrainstormResultCard,
  ToolBrainstormSectionHeader,
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'

const HISTORY_KEY = 'tool_history_brainstorm'
const MAX_HISTORY = 50
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

function loadHistory(): BrainstormEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveHistory(entries: BrainstormEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)))
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
  const [history, setHistory] = useState<BrainstormEntry[]>(loadHistory)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [isRunning, setIsRunning] = useState(false)

  // @ mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionPos, setMentionPos] = useState(0)

  const { data: resources = [] } = useQuery<RawResource[]>({
    queryKey: ['resources'],
    queryFn: () => api.get('/resources').then((r) => r.data),
  })

  const displayHistory = [...history].reverse()
  const latestEntry = displayHistory[0]
  const historyEntries = displayHistory.slice(1)

  const canGenerate = !isRunning && !!prompt.trim() && !!selectedModelId

  // Persist history whenever it changes
  useEffect(() => {
    saveHistory(history)
  }, [history])

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

    setHistory((prev) => [...prev, newEntry])
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

      setHistory((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, status: 'done', result: resp }
            : e
        )
      )
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err)
      setHistory((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, status: 'failed', error: msg }
            : e
        )
      )
    } finally {
      setIsRunning(false)
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
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
    setAttachments((a) => (a.find((x) => x.ID === resource.ID) ? a : [...a, resource]))
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
      {/* Body */}
      <ToolBrainstormBody>
        {/* Left: resource panel */}
        <ResourcePanel
          inputType="image"
          selectedIds={attachments.map((a) => a.ID)}
          onSelect={(r) => setAttachments((a) => [...a, r])}
        />

        {/* Right: main card */}
        <ToolBrainstormMain
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const id = Number(e.dataTransfer.getData('application/resource-id'))
            if (!id) return
            const r = resources.find((r) => r.ID === id)
            if (r && !attachments.find((a) => a.ID === id)) setAttachments((a) => [...a, r])
          }}
        >
          <ToolBrainstormPanel>
              <ToolBrainstormPanelHeader>
                <div className="min-w-0">
                  <p className="type-label font-medium text-foreground">{t('shared.modelSelector.label', { defaultValue: '模型' })}</p>
                  <p className="type-tiny text-muted-foreground">{t('tools.brainstorm.inputHint')}</p>
                </div>
                <ModelSelector
                  capability="text"
                  value={selectedModelId}
                  onChange={setSelectedModelId}
                  onModelChange={setSelectedModel}
                />
              </ToolBrainstormPanelHeader>

              {/* Latest result */}
              {latestEntry && (
                <div className="space-y-1.5">
                  <ToolBrainstormSectionHeader icon={History}>
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
                        removeLabel="移除附件"
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

            {historyEntries.length > 0 && (
              <ToolBrainstormHistoryDrawer>
                <ToolBrainstormHistoryToggle
                  expanded={historyExpanded}
                  count={historyEntries.length}
                  label={t('tools.brainstorm.history')}
                  onClick={() => setHistoryExpanded((e) => !e)}
                />

                {historyExpanded && (
                  <ToolBrainstormHistoryList>
                    {historyEntries.map((entry) => (
                      <BrainstormResultCard
                        key={entry.id}
                        entry={entry}
                        onReuse={() => setPrompt(entry.prompt)}
                      />
                    ))}
                  </ToolBrainstormHistoryList>
                )}
              </ToolBrainstormHistoryDrawer>
            )}

            {history.length === 0 && (
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
      </ToolBrainstormBody>
    </ToolBrainstormFrame>
  )
}
