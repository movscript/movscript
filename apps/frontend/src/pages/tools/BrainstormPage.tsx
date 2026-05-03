import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { RawResource } from '@/types'
import {
  ArrowLeft, Wand2, Loader2, Bot,
  ChevronDown, ChevronUp, History, X,
} from 'lucide-react'
import { ModelSelector } from '@/components/shared/ModelSelector'
import { ResourcePanel } from '@/components/shared/ResourcePanel'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@movscript/ui'
import { cn } from '@/lib/utils'
import { translateApiError } from '@/lib/apiError'
import { useTranslation } from 'react-i18next'

const HISTORY_KEY = 'tool_history_brainstorm'
const MAX_HISTORY = 50

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
    <div className="rounded-lg border border-border bg-background p-3 space-y-2 text-xs">
      {/* Prompt */}
      <div className="flex items-start gap-2">
        <span className="text-muted-foreground shrink-0 mt-0.5">{t('tools.brainstorm.prompt')}</span>
        <p className="text-foreground leading-relaxed line-clamp-2 flex-1">{entry.prompt}</p>
      </div>

      {/* Attachments */}
      {entry.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.attachments.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]"
            >
              📎 {a.name}
            </span>
          ))}
        </div>
      )}

      {/* Result */}
      {entry.status === 'pending' && (
        <div className="flex items-center gap-2 text-muted-foreground py-2">
          <Loader2 size={12} className="animate-spin" />
          <span>{t('canvas.generating')}</span>
        </div>
      )}
      {entry.status === 'failed' && (
        <p className="text-destructive">{entry.error ?? t('canvas.generationFailed')}</p>
      )}
      {entry.status === 'done' && (
        <div className="bg-muted/40 rounded-md p-2.5 text-foreground leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
          {entry.result}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-muted-foreground/60 text-[10px]">
          {new Date(entry.timestamp).toLocaleString(i18n.language, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
        {entry.status === 'done' && (
          <button
            onClick={onReuse}
            className="text-[10px] text-primary hover:underline"
          >
            {t('shared.genResult.reusePrompt')}
          </button>
        )}
      </div>
    </div>
  )
}

// ── BrainstormPage ────────────────────────────────────────────────────────────

export default function BrainstormPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<RawResource[]>([])
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
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
      const resp = await api.post('/ai/chat', {
        model_config_id: selectedModelId,
        messages: [{ role: 'user', content: prompt.trim() }],
      }).then((r) => r.data as { content: string })

      setHistory((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, status: 'done', result: resp.content }
            : e
        )
      )
    } catch (err: any) {
      const msg = translateApiError(err?.response?.data, 'tools.brainstorm.requestFailed')
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
    <div className="flex flex-col h-full bg-muted/20">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm font-medium text-muted-foreground">{t('sidebar.sections.tools')}</span>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-semibold text-foreground">{t('sidebar.items.brainstorm')}</span>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: resource panel */}
        <ResourcePanel
          inputType="image"
          selectedIds={attachments.map((a) => a.ID)}
          onSelect={(r) => setAttachments((a) => [...a, r])}
        />

        {/* Right: main card */}
        <div
          className="flex-1 overflow-y-auto p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const id = Number(e.dataTransfer.getData('application/resource-id'))
            if (!id) return
            const r = resources.find((r) => r.ID === id)
            if (r && !attachments.find((a) => a.ID === id)) setAttachments((a) => [...a, r])
          }}
        >
          <Card className="max-w-2xl mx-auto shadow-md">

            {/* CardHeader */}
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot size={16} className="text-violet-500" />
                    {t('sidebar.items.brainstorm')}
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-xs">
                    {t('tools.brainstorm.description')}
                  </CardDescription>
                </div>
                <ModelSelector
                  capability="text"
                  value={selectedModelId}
                  onChange={setSelectedModelId}
                />
              </div>
            </CardHeader>

            {/* CardContent: latest + input */}
            <CardContent className="p-4 space-y-4">

              {/* Latest result */}
              {latestEntry && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <History size={11} />
                    {t('tools.brainstorm.latestResult')}
                  </p>
                  <BrainstormResultCard
                    entry={latestEntry}
                    onReuse={() => setPrompt(latestEntry.prompt)}
                  />
                </div>
              )}

              {latestEntry && <div className="border-t border-border/60" />}

              {/* Input */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {latestEntry ? t('tools.brainstorm.newQuestion') : t('tools.brainstorm.startQuestion')}
                </p>

                {/* Attachment chips */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {attachments.map((a, i) => (
                      <span
                        key={a.ID}
                        className="inline-flex items-center gap-1 bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px]"
                      >
                        📎 {a.name}
                        <button
                          onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                          className="hover:text-foreground transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Textarea + mention dropdown */}
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring leading-relaxed bg-background text-foreground min-h-[80px] max-h-[160px]"
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
                    <div className="absolute left-0 bottom-full mb-1 w-full bg-popover border border-border rounded-lg shadow-lg z-20 overflow-hidden">
                      {mentionResults.map((r) => (
                        <button
                          key={r.ID}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            insertMention(r)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 text-left transition-colors"
                        >
                          <span className="text-muted-foreground">📎</span>
                          <span className="truncate text-foreground">{r.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">
                    {!selectedModelId ? t('tools.brainstorm.selectModelFirst') : t('tools.brainstorm.inputHint')}
                  </p>
                  <button
                    onClick={generate}
                    disabled={!canGenerate}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      canGenerate
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'bg-muted text-muted-foreground cursor-not-allowed'
                    )}
                  >
                    {isRunning
                      ? <><Loader2 size={12} className="animate-spin" /> {t('canvas.generating')}</>
                      : <><Wand2 size={12} /> {t('agents.chat.send')}</>
                    }
                  </button>
                </div>
              </div>
            </CardContent>

            {/* CardFooter: history */}
            {historyEntries.length > 0 && (
              <CardFooter className="flex-col items-stretch p-0 border-t border-border">
                <button
                  onClick={() => setHistoryExpanded((e) => !e)}
                  className="flex items-center justify-between w-full px-4 py-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <History size={12} />
                    {t('tools.brainstorm.history')}
                    <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                      {historyEntries.length}
                    </span>
                  </span>
                  {historyExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                {historyExpanded && (
                  <div className="px-4 pb-4 space-y-3 max-h-[480px] overflow-y-auto">
                    {historyEntries.map((entry) => (
                      <BrainstormResultCard
                        key={entry.id}
                        entry={entry}
                        onReuse={() => setPrompt(entry.prompt)}
                      />
                    ))}
                  </div>
                )}
              </CardFooter>
            )}

            {/* Empty state */}
            {history.length === 0 && (
              <CardFooter className="justify-center py-8 border-t border-border">
                <div className="flex flex-col items-center gap-2 text-muted-foreground/40 select-none">
                  <Bot size={28} className="opacity-30" />
                  <p className="text-xs">{t('tools.brainstorm.empty')}</p>
                  <p className="text-[10px]">{t('tools.brainstorm.emptyHint')}</p>
                </div>
              </CardFooter>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
