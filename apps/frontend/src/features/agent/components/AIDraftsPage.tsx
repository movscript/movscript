import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ClipboardCheck, Copy, Loader2, RefreshCw, Route } from 'lucide-react'
import {
  AgentDataBlock,
  AgentSurfaceBlock,
  AppCodeBlock,
  AppInlineError,
  AppPageShell,
  AppPageShellBody,
  AppPageShellHeader,
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@movscript/ui'
import {
  localAgentClient,
  type AgentDraft,
  type AgentDraftKind,
} from '@/shared/infrastructure/localAgentClient'
import { buildDraftReviewPath } from '@/features/agent/domain/draftDomainModel'
import { agentDraftStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { cn } from '@/shared/ui/cn'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'

const DRAFT_KINDS: AgentDraftKind[] = [
  'setting_proposal',
  'project_standards_proposal',
  'asset_proposal',
  'production_proposal',
  'content_unit_proposal',
]

type ProjectFilter = 'all' | 'current'

export default function AIDraftsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const currentProject = useProjectStore((s) => s.current)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const [kindFilter, setKindFilter] = useState<AgentDraftKind | 'all'>('all')
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const query = {
    ...(projectFilter === 'current' && currentProject ? { projectId: currentProject.ID } : {}),
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
    const rows = (draftsQuery.data ?? []).filter((draft) => kindFilter === 'all' || draft.kind === kindFilter)
    if (!needle) return rows
    return rows.filter((draft) => {
      const kindLabel = t(`agents.chat.drafts.kinds.${draft.kind}`)
      return [
        draft.id,
        draft.kind,
        kindLabel,
        draft.title,
        draft.content,
        draft.status,
        draft.createdByThreadId,
        draft.createdByRunId,
        sourceValue(draft, 'threadId'),
        sourceValue(draft, 'runId'),
      ].some((value) => (value ?? '').toLowerCase().includes(needle))
    })
  }, [draftsQuery.data, kindFilter, search, t])
  const selectedDraft = drafts.find((draft) => draft.id === selectedId) ?? drafts[0] ?? null
  const openDraftPath = selectedDraft ? buildDraftReviewPath(selectedDraft) : null

  async function copyDraftId(draft: AgentDraft) {
    await navigator.clipboard.writeText(draft.id)
  }

  return (
    <AppPageShell>
      <AppPageShellHeader>
        <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ClipboardCheck size={18} />
              <h1 className="type-title font-semibold text-foreground">{t('agents.draftHistory.title')}</h1>
            </div>
            <p className="mt-1 line-clamp-2 max-w-3xl type-label leading-5 text-muted-foreground">{t('agents.draftHistory.description')}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => draftsQuery.refetch()}
            disabled={draftsQuery.isFetching}
          >
            <RefreshCw size={14} className={draftsQuery.isFetching ? 'animate-spin' : ''} />
            {t('agents.chat.panel.drafts.refresh')}
          </Button>
        </div>
      </AppPageShellHeader>

      <AgentConsoleNav compact />

      <AppPageShellBody padding="none" scroll="responsive-split" className="grid grid-cols-1 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
        <aside className="flex min-h-0 min-w-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="space-y-2 border-b border-border p-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('agents.draftHistory.searchPlaceholder')}
              className="h-8 w-full type-label"
            />
            <div className="grid grid-cols-2 gap-1.5">
              <Select value={projectFilter} onValueChange={(next) => setProjectFilter(next as ProjectFilter)}>
                <SelectTrigger size="sm" className="h-8 type-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('agents.draftHistory.allProjects')}</SelectItem>
                  <SelectItem value="current" disabled={!currentProject}>{t('agents.draftHistory.currentProject')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={kindFilter} onValueChange={(next) => setKindFilter(next as AgentDraftKind | 'all')}>
                <SelectTrigger size="sm" className="h-8 type-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('agents.chat.drafts.filters.allKinds')}</SelectItem>
                  {DRAFT_KINDS.map((item) => <SelectItem key={item} value={item}>{t(`agents.chat.drafts.kinds.${item}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {draftsQuery.isLoading ? (
              <AgentDataBlock className="flex items-center gap-2 p-3 type-label text-muted-foreground">
                <Loader2 size={14} className="animate-spin" />
                {t('common.loading')}
              </AgentDataBlock>
            ) : draftsQuery.error ? (
              <AppInlineError className="p-3">
                {draftsQuery.error instanceof Error ? draftsQuery.error.message : String(draftsQuery.error)}
              </AppInlineError>
            ) : drafts.length === 0 ? (
              <AgentDataBlock className="p-3 type-label text-muted-foreground">
                {t('agents.chat.panel.drafts.emptyFilter')}
              </AgentDataBlock>
            ) : drafts.map((draft) => (
              <AgentSurfaceBlock key={draft.id} asChild variant="subtle">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSelectedId(draft.id)}
                  data-active={selectedDraft?.id === draft.id ? 'true' : undefined}
                  className={cn(
                    'mb-1.5 h-auto w-full justify-start px-2.5 py-2 text-left transition-colors [&_.ms-button__content]:block [&_.ms-button__content]:w-full',
                    selectedDraft?.id === draft.id ? 'border-ring bg-muted/50' : 'hover:bg-muted/30',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 type-label font-medium text-foreground">{draft.title}</span>
                    <DraftStatusBadge status={draft.status} className="shrink-0 type-tiny" />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 type-tiny text-muted-foreground">
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
                </Button>
              </AgentSurfaceBlock>
            ))}
          </div>
        </aside>

        <main className="min-h-0 min-w-0 overflow-y-auto p-4">
          {!selectedDraft ? (
            <AgentDataBlock className="p-4 type-body text-muted-foreground">
              {t('agents.draftHistory.emptySelection')}
            </AgentDataBlock>
          ) : (
            <div className="space-y-3">
              <AgentSurfaceBlock className="p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate type-title font-semibold text-foreground">{selectedDraft.title}</h2>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge>{t(`agents.chat.drafts.kinds.${selectedDraft.kind}`)}</Badge>
                      <DraftStatusBadge status={selectedDraft.status} />
                      {selectedDraft.projectId && <Badge variant="outline">{t('agents.chat.panel.drafts.projectBadge', { id: selectedDraft.projectId })}</Badge>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => copyDraftId(selectedDraft)}>
                      <Copy size={14} />
                      {t('agents.draftHistory.copyId')}
                    </Button>
                    <Button type="button" size="sm" onClick={() => openDraftPath && navigate(openDraftPath)} disabled={!openDraftPath}>
                      <Route size={14} />
                      {t('agents.chat.panel.drafts.openPage')}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 type-label md:grid-cols-2">
                  <MetaRow label={t('agents.draftHistory.sourceThread')} value={selectedDraft.createdByThreadId || sourceValue(selectedDraft, 'threadId')} />
                  <MetaRow label={t('agents.draftHistory.sourceRun')} value={selectedDraft.createdByRunId || sourceValue(selectedDraft, 'runId')} />
                  <MetaRow label={t('agents.draftHistory.filePath')} value={selectedDraft.filePath || '-'} />
                  <MetaRow label={t('agents.draftHistory.createdAt')} value={formatAgentDate(selectedDraft.createdAt, locale)} />
                  <MetaRow label={t('agents.draftHistory.updatedAt')} value={formatAgentDate(selectedDraft.updatedAt, locale)} />
                </div>
              </AgentSurfaceBlock>

              <AgentSurfaceBlock asChild>
                <section>
                <div className="border-b border-border px-3 py-2 type-label font-medium text-foreground">{t('agents.draftHistory.content')}</div>
                <AppCodeBlock className="max-h-[48vh] p-3 type-label leading-5 text-foreground">
                  {selectedDraft.content || t('agents.chat.panel.drafts.emptyDraft')}
                </AppCodeBlock>
                </section>
              </AgentSurfaceBlock>

              <section className="grid gap-3 md:grid-cols-2">
                <JSONPanel title={t('agents.draftHistory.source')} value={selectedDraft.source} />
                <JSONPanel title={t('agents.draftHistory.target')} value={selectedDraft.target} />
              </section>
            </div>
          )}
        </main>
      </AppPageShellBody>
    </AppPageShell>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <AgentDataBlock className="px-2 py-1.5">
      <div className="type-tiny text-muted-foreground">{label}</div>
      <div className="truncate font-mono type-label text-foreground" title={value}>{value || '-'}</div>
    </AgentDataBlock>
  )
}

function JSONPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <AgentSurfaceBlock>
      <div className="border-b border-border px-3 py-2 type-label font-medium text-foreground">{title}</div>
      <AppCodeBlock className="max-h-52 p-3 type-caption leading-5 text-muted-foreground">
        {value ? JSON.stringify(value, null, 2) : '-'}
      </AppCodeBlock>
    </AgentSurfaceBlock>
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

function DraftStatusBadge({ status, className }: { status: AgentDraft['status']; className?: string }) {
  const { t } = useTranslation()
  const statusRecipe = agentDraftStatusRecipe(status)
  return (
    <StatusBadge intent={statusRecipe.intent} emphasis={statusRecipe.emphasis} className={className}>
      {t(`agents.chat.drafts.status.${status}`)}
    </StatusBadge>
  )
}
