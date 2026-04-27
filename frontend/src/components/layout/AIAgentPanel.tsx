import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Bot, ChevronRight, Send, Loader2,
  Plus, ArrowLeft, Copy, Check, Settings, MessageSquare, X, ChevronDown,
} from 'lucide-react'
import { api } from '@/lib/api'
import { translateApiError } from '@/lib/apiError'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  useAgentStore,
  type ChatMessage,
  type Conversation,
  type UserAgent,
  type AgentTemplate,
} from '@/store/agentStore'
import { useUserStore } from '@/store/userStore'
import type { PublicModel } from '@/types'

// ── Markdown renderer ─────────────────────────────────────────────────────────

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="rounded-md overflow-hidden bg-black/20 my-2 text-xs">
      <div className="flex items-center justify-between px-3 py-1 border-b border-white/10">
        <span className="font-mono text-muted-foreground/70">{lang || 'code'}</span>
        <button onClick={copy} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          {copied ? <Check size={11} /> : <Copy size={11} />}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-all"><code>{code}</code></pre>
    </div>
  )
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
          return <code key={i} className="px-1 py-0.5 rounded bg-muted/60 text-xs font-mono">{part.slice(1, -1)}</code>
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
          return <strong key={i}>{part.slice(2, -2)}</strong>
        return part.split('\n').map((line, j, arr) => (
          <React.Fragment key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</React.Fragment>
        ))
      })}
    </>
  )
}

function MarkdownContent({ text }: { text: string }) {
  const segments = text.split(/(```[\w]*\n[\s\S]*?```)/g)
  return (
    <div>
      {segments.map((seg, i) => {
        const m = seg.match(/^```([\w]*)\n([\s\S]*?)```$/)
        if (m) return <CodeBlock key={i} lang={m[1]} code={m[2].trimEnd()} />
        return <span key={i}><InlineText text={seg} /></span>
      })}
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const { i18n } = useTranslation()
  const [copied, setCopied] = useState(false)
  const isUser = msg.role === 'user'
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const time = new Date(msg.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  function copy() {
    navigator.clipboard.writeText(msg.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={cn('group flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Bot size={12} className="text-primary" />
        </div>
      )}
      <div className={cn('flex flex-col gap-1 max-w-[85%]', isUser ? 'items-end' : 'items-start')}>
        <div className={cn(
          'px-3 py-2 rounded-2xl text-xs leading-relaxed break-words',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-muted text-foreground rounded-tl-sm'
        )}>
          {isUser ? msg.content : <MarkdownContent text={msg.content} />}
        </div>
        <div className={cn('flex items-center gap-1.5', isUser ? 'flex-row-reverse' : 'flex-row')}>
          <span className="text-[10px] text-muted-foreground/50">{time}</span>
          <button
            onClick={copy}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40 hover:text-muted-foreground"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Agent picker ──────────────────────────────────────────────────────────────

function AgentPicker({ onSelect, onCancel }: {
  onSelect: (userAgentId: number | null) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: templates = [] } = useQuery<AgentTemplate[]>({
    queryKey: ['agents'],
    queryFn: () => api.get('/agents').then((r) => r.data),
  })
  const { data: myAgents = [] } = useQuery<UserAgent[]>({
    queryKey: ['agents', 'my'],
    queryFn: () => api.get('/agents/my').then((r) => r.data),
  })

  async function pickTemplate(tpl: AgentTemplate) {
    // Find or create a UserAgent linked to this template
    const existing = myAgents.find((a) => a.source_template_id === tpl.id)
    if (existing) {
      onSelect(existing.id)
      return
    }
    const { data } = await api.post('/agents/my', {
      name: tpl.name,
      source_template_id: tpl.id,
      accept_platform_updates: true,
      soul: tpl.soul,
      skills: tpl.skills,
      platform_model_id: tpl.platform_model_id,
    })
    qc.invalidateQueries({ queryKey: ['agents', 'my'] })
    onSelect(data.id)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 py-2.5 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{t('agents.chat.selectAgent')}</span>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={14} />
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Platform templates */}
          {templates.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-1">{t('agents.chat.platformTemplates')}</p>
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => pickTemplate(tpl)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-border hover:border-ring hover:bg-muted/30 transition-colors space-y-0.5"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot size={11} className="text-primary" />
                    </div>
                    <span className="text-xs font-medium text-foreground">{tpl.name}</span>
                  </div>
                  {tpl.soul && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2 pl-7">{tpl.soul}</p>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* User's own agents */}
          {myAgents.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-1">{t('agents.chat.myAgents')}</p>
              {myAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => onSelect(agent.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-border hover:border-ring hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Bot size={11} className="text-muted-foreground" />
                    </div>
                    <span className="text-xs font-medium text-foreground">{agent.name}</span>
                  </div>
                  {agent.soul && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1 pl-7">{agent.soul}</p>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* No agent option */}
          <button
            onClick={() => onSelect(null)}
            className="w-full text-left px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            {t('agents.chat.noAgent')}
          </button>

          <div className="pt-1 border-t border-border">
            <button
              onClick={() => { onCancel(); navigate('/agents') }}
              className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              {t('agents.chat.manageMyAgents')}
            </button>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

// ── Chat view ─────────────────────────────────────────────────────────────────

function ChatView({ conv, userId, onBack }: { conv: Conversation; userId: string; onBack: () => void }) {
  const { t } = useTranslation()
  const { settings, addMessage, updateConversationTitle, updateSettings } = useAgentStore()
  const { data: textModels = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', 'text'],
    queryFn: () => api.get('/models?capability=text').then((r) => r.data),
  })
  const { data: myAgents = [] } = useQuery<UserAgent[]>({
    queryKey: ['agents', 'my'],
    queryFn: () => api.get('/agents/my').then((r) => r.data),
  })
  const { data: templates = [] } = useQuery<AgentTemplate[]>({
    queryKey: ['agents'],
    queryFn: () => api.get('/agents').then((r) => r.data),
  })

  const userAgent = myAgents.find((a) => a.id === conv.userAgentId) ?? null

  // If agent follows platform updates, merge template soul/skills/model
  const effectiveAgent = (() => {
    if (!userAgent) return null
    if (userAgent.accept_platform_updates && userAgent.source_template_id) {
      const tpl = templates.find((t) => t.id === userAgent.source_template_id)
      if (tpl) return { ...userAgent, soul: tpl.soul, skills: tpl.skills, platform_model_id: tpl.platform_model_id }
    }
    return userAgent
  })()

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [conv.messages, loading])
  useEffect(() => { inputRef.current?.focus() }, [conv.id])

  // Auto-clear stale modelId
  useEffect(() => {
    if (textModels.length > 0 && settings.modelId !== null) {
      const exists = textModels.some((m) => m.id === settings.modelId)
      if (!exists) updateSettings({ modelId: null })
    }
  }, [textModels]) // eslint-disable-line react-hooks/exhaustive-deps

  const modelId = effectiveAgent?.platform_model_id ?? settings.modelId ?? textModels[0]?.id ?? null
  const systemPrompt = effectiveAgent?.soul ?? ''

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    if (!modelId) {
      addMessage(userId, conv.id, { role: 'assistant', content: t('agents.chat.selectModelFirst') })
      return
    }
    setInput('')
    setLoading(true)

    addMessage(userId, conv.id, { role: 'user', content: text })
    if (conv.messages.length === 0) {
      updateConversationTitle(userId, conv.id, text.slice(0, 30) + (text.length > 30 ? '…' : ''))
    }

    const messages = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...conv.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: text },
    ]

    try {
      const { data } = await api.post('/ai/chat', { model_config_id: modelId, messages })
      addMessage(userId, conv.id, { role: 'assistant', content: data.content })
    } catch (e: any) {
      const rawErr: string = e?.response?.data?.error ?? e?.response?.data?.message ?? String(e)
      const errMsg = translateApiError(e?.response?.data)
      if (rawErr.includes('not found') || rawErr.includes('disabled')) {
        updateSettings({ modelId: null })
        addMessage(userId, conv.id, { role: 'assistant', content: t('agents.chat.modelInvalid') })
      } else {
        addMessage(userId, conv.id, { role: 'assistant', content: t('agents.chat.errorMessage', { message: errMsg }) })
      }
    } finally {
      setLoading(false)
    }
  }, [input, loading, conv, systemPrompt, modelId, userId, addMessage, updateConversationTitle, updateSettings, t])

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{conv.title}</p>
          {effectiveAgent && (
            <p className="text-[10px] text-muted-foreground truncate">{effectiveAgent.name}</p>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground/50 shrink-0">{t('agents.chat.messagesCount', { count: conv.messages.length })}</span>
      </div>

      <ScrollArea className="flex-1 px-3 py-3 min-h-0">
        <div className="space-y-4">
          {conv.messages.length === 0 && (
            <div className="text-center mt-8">
              <Bot size={24} className="mx-auto mb-2 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground/50">
                {effectiveAgent ? t('agents.chat.agentReady', { name: effectiveAgent.name }) : t('agents.chat.startChat')}
              </p>
            </div>
          )}
          {conv.messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
          {loading && (
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot size={12} className="text-primary" />
              </div>
              <div className="bg-muted px-3 py-2 rounded-2xl rounded-tl-sm">
                <Loader2 size={12} className="animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="px-3 py-2.5 border-t border-border shrink-0 space-y-2">
        {textModels.length > 0 && (
          <select
            value={modelId ?? ''}
            onChange={(e) => updateSettings({ modelId: Number(e.target.value) || null })}
            className="w-full text-[11px] border border-border rounded-md px-2 py-1 bg-background text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {textModels.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
        )}
        <div className="flex gap-1.5">
          <Textarea
            ref={inputRef}
            className="flex-1 text-xs resize-none leading-relaxed min-h-0 py-2 h-16"
            placeholder={t('agents.chat.inputPlaceholder')}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            disabled={loading}
          />
          <Button size="icon" onClick={send} disabled={!input.trim() || loading} className="h-8 w-8 self-end">
            <Send size={13} />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/40 text-right">{t('agents.chat.inputHint')}</p>
      </div>
    </>
  )
}

// ── Conversation list ─────────────────────────────────────────────────────────

function ConversationList({
  conversations,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: Conversation[]
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}) {
  const { t, i18n } = useTranslation()
  const { data: myAgents = [] } = useQuery<UserAgent[]>({
    queryKey: ['agents', 'my'],
    queryFn: () => api.get('/agents/my').then((r) => r.data),
  })

  function formatDate(ts: number) {
    const d = new Date(ts)
    const now = new Date()
    const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 py-2 border-b border-border shrink-0">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-ring hover:text-foreground transition-colors"
        >
          <Plus size={13} /> {t('agents.chat.newConversation')}
        </button>
      </div>
      <ScrollArea className="flex-1">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground/40">
            <MessageSquare size={24} className="opacity-30" />
            <p className="text-xs">{t('agents.chat.noConversations')}</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {conversations.map((conv) => {
              const agent = myAgents.find((a) => a.id === conv.userAgentId)
              return (
                <div
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className="group flex items-start gap-2 px-3 py-2.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{conv.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {agent ? agent.name : (conv.messages[conv.messages.length - 1]?.content.slice(0, 40) ?? '')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground/50">{formatDate(conv.updatedAt)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all"
                    >
                      <X size={11} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

// ── Built-in chat ─────────────────────────────────────────────────────────────

function BuiltinChat({ userId }: { userId: string }) {
  const {
    getConversations,
    getActiveConversationId,
    createConversation,
    setActiveConversation,
    deleteConversation,
  } = useAgentStore()
  const [picking, setPicking] = useState(false)

  const conversations = getConversations(userId)
  const activeConversationId = getActiveConversationId(userId)
  const activeConv = conversations.find((c) => c.id === activeConversationId) ?? null

  function handleNew() {
    setPicking(true)
  }

  function handlePickAgent(userAgentId: number | null) {
    setPicking(false)
    createConversation(userId, userAgentId)
  }

  if (picking) {
    return <AgentPicker onSelect={handlePickAgent} onCancel={() => setPicking(false)} />
  }
  if (activeConv) {
    return (
      <ChatView
        conv={activeConv}
        userId={userId}
        onBack={() => setActiveConversation(userId, null)}
      />
    )
  }
  return (
    <ConversationList
      conversations={conversations}
      onSelect={(id) => setActiveConversation(userId, id)}
      onNew={handleNew}
      onDelete={(id) => deleteConversation(userId, id)}
    />
  )
}

// ── AIAgentPanel ──────────────────────────────────────────────────────────────

const PANEL_OPEN_KEY = 'ai-panel-open'

export function AIAgentPanel() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(PANEL_OPEN_KEY)
      return saved === null ? true : saved === 'true'
    } catch {
      return true
    }
  })
  const navigate = useNavigate()
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''

  function toggleOpen() {
    setOpen((v) => {
      const next = !v
      try { localStorage.setItem(PANEL_OPEN_KEY, String(next)) } catch {}
      return next
    })
  }

  return (
    <div className={cn(
      'shrink-0 border-l border-sidebar-border bg-sidebar flex flex-col overflow-hidden transition-all duration-200',
      open ? 'w-80' : 'w-9'
    )}>
      <button
        onClick={toggleOpen}
        title={open ? t('agents.chat.collapseAssistant') : t('agents.chat.aiAssistant')}
        className="flex items-center h-10 text-muted-foreground hover:text-foreground transition-colors border-b border-border shrink-0 px-2 gap-2 w-full"
      >
        <Bot size={15} className="shrink-0 text-foreground" />
        {open && <span className="text-xs font-medium flex-1 text-left text-foreground">{t('agents.chat.aiAssistant')}</span>}
        {open && (
          <button
            onClick={(e) => { e.stopPropagation(); navigate('/agents') }}
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
            title={t('agents.chat.manageAgent')}
          >
            <Settings size={13} />
          </button>
        )}
        {open && <ChevronRight size={13} className="shrink-0" />}
      </button>

      {open && (
        <div className="flex flex-col flex-1 min-h-0">
          <BuiltinChat userId={userId} />
        </div>
      )}
    </div>
  )
}
