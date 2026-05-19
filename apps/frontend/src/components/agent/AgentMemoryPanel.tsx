import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui'
import { localAgentClient, type AgentMemory, type AgentMemoryKind, type AgentMemoryScope } from '@/lib/localAgentClient'
import type { Project } from '@/types'

const MEMORY_SCOPES: AgentMemoryScope[] = ['global', 'project', 'thread']
const MEMORY_KINDS: AgentMemoryKind[] = ['preference', 'fact', 'decision', 'entity_ref', 'draft', 'warning']

export function AgentMemoryPanel({
  project,
  threadId,
  online,
}: {
  project: Project | null
  threadId?: string
  online: boolean
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const [scope, setScope] = useState<AgentMemoryScope>('global')
  const [kind, setKind] = useState<AgentMemoryKind>('preference')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const query = {
    scope,
    ...(scope === 'project' && project ? { projectId: project.ID } : {}),
    ...(scope === 'thread' && threadId ? { threadId } : {}),
  }
  const scopedTargetMissing = (scope === 'project' && !project) || (scope === 'thread' && !threadId)
  const memoriesQuery = useQuery<AgentMemory[]>({
    queryKey: ['local-agent-memories', localAgentClient.baseURL, query],
    queryFn: () => localAgentClient.listMemories(query).then((r) => r.memories),
    enabled: online && !scopedTargetMissing,
    retry: false,
  })
  const memories = memoriesQuery.data ?? []

  async function saveMemory() {
    const text = content.trim()
    if (!text || scopedTargetMissing) return
    setSaving(true)
    try {
      await localAgentClient.createMemory({
        scope,
        kind,
        content: text,
        ...(scope === 'project' && project ? { projectId: project.ID } : {}),
        ...(scope === 'thread' && threadId ? { threadId } : {}),
      })
      setContent('')
      qc.invalidateQueries({ queryKey: ['local-agent-memories'] })
    } finally {
      setSaving(false)
    }
  }

  async function deleteMemory(id: string) {
    await localAgentClient.deleteMemory(id)
    qc.invalidateQueries({ queryKey: ['local-agent-memories'] })
  }

  return (
    <div className="rounded-md border border-border bg-background/60 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground">
          <Database size={11} />
          {t('agents.chat.panel.memory.title')}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => memoriesQuery.refetch()}
          disabled={!online || scopedTargetMissing || memoriesQuery.isFetching}
          className="h-5 px-1 text-[10px] text-muted-foreground"
        >
          <RefreshCw size={10} className={memoriesQuery.isFetching ? 'animate-spin' : ''} />
          {t('agents.chat.panel.memory.refresh')}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Select value={scope} onValueChange={(next) => setScope(next as AgentMemoryScope)}>
          <SelectTrigger size="sm" className="h-7 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEMORY_SCOPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(next) => setKind(next as AgentMemoryKind)}>
          <SelectTrigger size="sm" className="h-7 text-[10px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEMORY_KINDS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {scopedTargetMissing ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {scope === 'project' ? t('agents.chat.panel.memory.missingProject') : t('agents.chat.panel.memory.missingThread')}
        </p>
      ) : (
        <>
          <div className="flex gap-1.5">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!online || saving}
              placeholder={t('agents.chat.panel.memory.add')}
              rows={2}
              className="min-h-12 flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              type="button"
              size="icon-sm"
              onClick={saveMemory}
              disabled={!online || saving || !content.trim()}
              className="h-12 w-8 shrink-0"
              title={t('agents.chat.panel.memory.save')}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            </Button>
          </div>
          <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
            {memories.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">{t('agents.chat.panel.memory.noMemory')}</p>
            ) : memories.map((memory) => (
              <div key={memory.id} className="rounded-md border border-border bg-background p-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="secondary" className="text-[9px] leading-4 px-1.5 py-0">{memory.kind}</Badge>
                      <span className="text-[9px] text-muted-foreground">{formatAgentDate(memory.updatedAt, locale)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[10px] leading-relaxed text-foreground">{memory.content}</p>
                  </div>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => deleteMemory(memory.id)}
                    className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                    title={t('agents.chat.panel.memory.delete')}
                  >
                    <Trash2 size={10} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function formatAgentDate(value: string | number, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}
