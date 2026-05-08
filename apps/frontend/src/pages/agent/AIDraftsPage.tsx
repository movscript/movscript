import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ClipboardCheck, Copy, Loader2, RefreshCw, Route } from 'lucide-react'
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui'
import {
  localAgentClient,
  type AgentDraft,
  type AgentDraftKind,
  type AgentDraftStatus,
} from '@/lib/localAgentClient'
import { useProjectStore } from '@/store/projectStore'
import { cn } from '@/lib/utils'

const DRAFT_KINDS: AgentDraftKind[] = ['script_split', 'script', 'asset_slot', 'storyboard_line', 'content_unit', 'prompt', 'note', 'pipeline', 'segment', 'scene_moment', 'project_proposal', 'production_proposal']

type ProjectFilter = 'all' | 'current'

export default function AIDraftsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const currentProject = useProjectStore((s) => s.current)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const [kind, setKind] = useState<AgentDraftKind | 'all'>('all')
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const query = {
    ...(projectFilter === 'current' && currentProject ? { projectId: currentProject.ID } : {}),
    ...(kind !== 'all' ? { kind } : {}),
    status: 'draft' as AgentDraftStatus,
    limit: 100,
  }
  const draftsQuery = useQuery<AgentDraft[]>({
    queryKey: ['ai-active-drafts', localAgentClient.baseURL, query],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.listDrafts(query).then((r) => r.drafts)
    },
    retry: false,
  })
  const drafts = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const rows = draftsQuery.data ?? []
    if (!needle) return rows
    return rows.filter((draft) => [
      draft.id,
      draft.title,
      draft.content,
      draft.createdByThreadId,
      draft.createdByRunId,
      sourceValue(draft, 'threadId'),
      sourceValue(draft, 'runId'),
    ].some((value) => (value ?? '').toLowerCase().includes(needle)))
  }, [draftsQuery.data, search])
  const selectedDraft = drafts.find((draft) => draft.id === selectedId) ?? drafts[0] ?? null
  const openDraftPath = selectedDraft ? buildDraftOpenPath(selectedDraft) : null

  async function copyDraftId(draft: AgentDraft) {
    await navigator.clipboard.writeText(draft.id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ClipboardCheck size={18} />
              <h1 className="text-lg font-semibold text-foreground">{t('agents.draftHistory.title')}</h1>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{t('agents.draftHistory.description')}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => draftsQuery.refetch()}
            disabled={draftsQuery.isFetching}
          >
            <RefreshCw size={13} className={draftsQuery.isFetching ? 'animate-spin' : ''} />
            {t('agents.chat.panel.drafts.refresh')}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-border">
          <div className="space-y-2 border-b border-border p-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('agents.draftHistory.searchPlaceholder')}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <Select value={projectFilter} onValueChange={(next) => setProjectFilter(next as ProjectFilter)}>
                <SelectTrigger size="sm" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('agents.draftHistory.allProjects')}</SelectItem>
                  <SelectItem value="current" disabled={!currentProject}>{t('agents.draftHistory.currentProject')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={kind} onValueChange={(next) => setKind(next as AgentDraftKind | 'all')}>
                <SelectTrigger size="sm" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('agents.chat.drafts.filters.allKinds')}</SelectItem>
                  {DRAFT_KINDS.map((item) => <SelectItem key={item} value={item}>{t(`agents.chat.drafts.kinds.${item}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {draftsQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                {t('common.loading')}
              </div>
            ) : draftsQuery.error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {draftsQuery.error instanceof Error ? draftsQuery.error.message : String(draftsQuery.error)}
              </div>
            ) : drafts.length === 0 ? (
              <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                {t('agents.chat.panel.drafts.emptyFilter')}
              </div>
            ) : drafts.map((draft) => (
              <button
                key={draft.id}
                type="button"
                onClick={() => setSelectedId(draft.id)}
                className={cn(
                  'mb-1.5 w-full rounded-md border px-2.5 py-2 text-left transition-colors',
                  selectedDraft?.id === draft.id ? 'border-ring bg-muted/50' : 'border-border bg-background hover:bg-muted/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-xs font-medium text-foreground">{draft.title}</span>
                  <Badge variant={draftStatusVariant(draft.status)} className="shrink-0 text-[9px]">{t(`agents.chat.drafts.status.${draft.status}`)}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                  <span>{t(`agents.chat.drafts.kinds.${draft.kind}`)}</span>
                  <span>·</span>
                  <span>{formatAgentDate(draft.updatedAt, locale)}</span>
                  {draft.projectId && (
                    <>
                      <span>·</span>
                      <span>{t('agents.chat.panel.drafts.projectBadge', { id: draft.projectId })}</span>
                    </>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto p-4">
          {!selectedDraft ? (
            <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
              {t('agents.draftHistory.emptySelection')}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-foreground">{selectedDraft.title}</h2>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{t(`agents.chat.drafts.kinds.${selectedDraft.kind}`)}</Badge>
                      <Badge variant={draftStatusVariant(selectedDraft.status)}>{t(`agents.chat.drafts.status.${selectedDraft.status}`)}</Badge>
                      {selectedDraft.projectId && <Badge variant="outline">{t('agents.chat.panel.drafts.projectBadge', { id: selectedDraft.projectId })}</Badge>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => copyDraftId(selectedDraft)}>
                      <Copy size={13} />
                      {t('agents.draftHistory.copyId')}
                    </Button>
                    <Button type="button" size="sm" onClick={() => openDraftPath && navigate(openDraftPath)} disabled={!openDraftPath}>
                      <Route size={13} />
                      {t('agents.chat.panel.drafts.openPage')}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                  <MetaRow label={t('agents.draftHistory.sourceThread')} value={selectedDraft.createdByThreadId || sourceValue(selectedDraft, 'threadId')} />
                  <MetaRow label={t('agents.draftHistory.sourceRun')} value={selectedDraft.createdByRunId || sourceValue(selectedDraft, 'runId')} />
                  <MetaRow label={t('agents.draftHistory.createdAt')} value={formatAgentDate(selectedDraft.createdAt, locale)} />
                  <MetaRow label={t('agents.draftHistory.updatedAt')} value={formatAgentDate(selectedDraft.updatedAt, locale)} />
                </div>
              </div>

              <section className="rounded-md border border-border bg-background">
                <div className="border-b border-border px-3 py-2 text-xs font-medium text-foreground">{t('agents.draftHistory.content')}</div>
                <pre className="max-h-[48vh] overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-5 text-foreground">
                  {selectedDraft.content || t('agents.chat.panel.drafts.emptyDraft')}
                </pre>
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <JSONPanel title={t('agents.draftHistory.source')} value={selectedDraft.source} />
                <JSONPanel title={t('agents.draftHistory.target')} value={selectedDraft.target} />
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/20 px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="truncate font-mono text-xs text-foreground" title={value}>{value || '-'}</div>
    </div>
  )
}

function JSONPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-md border border-border bg-background">
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-foreground">{title}</div>
      <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words p-3 text-[11px] leading-5 text-muted-foreground">
        {value ? JSON.stringify(value, null, 2) : '-'}
      </pre>
    </div>
  )
}

function sourceValue(draft: AgentDraft, key: 'threadId' | 'runId'): string {
  const value = draft.source?.[key]
  return typeof value === 'string' ? value : ''
}

function formatAgentDate(value: string | number, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function draftStatusVariant(status: AgentDraftStatus): 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'applied') return 'success'
  if (status === 'rejected') return 'destructive'
  if (status === 'accepted') return 'warning'
  if (status === 'superseded') return 'secondary'
  return 'outline'
}

function buildDraftOpenPath(draft: AgentDraft): string | null {
  const source = draft.source && typeof draft.source === 'object' ? draft.source : undefined
  const target = draft.target && typeof draft.target === 'object' ? draft.target : undefined
  const sourceEntityType = typeof source?.entityType === 'string' ? source.entityType : undefined
  const targetEntityType = typeof target?.entityType === 'string' ? target.entityType : undefined
  const sourceEntityId = numberValue(source?.entityId)
  const targetEntityId = numberValue(target?.entityId)

  if (draft.kind === 'script_split') {
    return `/workbench/script?draftId=${encodeURIComponent(draft.id)}`
  }

  if (draft.kind === 'project_proposal' || sourceEntityType === 'project' || targetEntityType === 'project') {
    return `/project-workspace?draftId=${encodeURIComponent(draft.id)}`
  }

  const productionId = sourceEntityId ?? targetEntityId
  const productionRelatedKinds: AgentDraft['kind'][] = [
    'production_proposal',
    'pipeline',
    'segment',
    'scene_moment',
    'content_unit',
    'asset_slot',
    'storyboard_line',
  ]
  if (
    productionId !== undefined
    && (
      draft.kind === 'production_proposal'
      || sourceEntityType === 'production'
      || targetEntityType === 'production'
      || productionRelatedKinds.includes(draft.kind)
    )
  ) {
    return `/production-orchestrate?productionId=${productionId}&draftId=${encodeURIComponent(draft.id)}`
  }

  return null
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}
