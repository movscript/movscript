import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ClipboardCheck, Copy, Loader2, RefreshCw, Route } from 'lucide-react'
import {
  AgentDraftsPageBody,
  AgentDraftsFilterGrid,
  AgentDraftActionRow,
  AgentDraftBadgeRow,
  AgentDraftCodePanel,
  AgentDraftCodePanelHeader,
  AgentDraftDetailCard,
  AgentDraftDetailCopy,
  AgentDraftDetailHeader,
  AgentDraftDetailStack,
  AgentDraftDetailTitle,
  AgentDraftJsonGrid,
  AgentDraftListItemButton,
  AgentDraftListItemHeader,
  AgentDraftListItemMeta,
  AgentDraftListItemTitle,
  AgentDraftListState,
  AgentDraftMetaGrid,
  AgentDraftMetaItem,
  AgentDraftsPageList,
  AgentDraftsPageMain,
  AgentDraftsPageSidebar,
  AgentDraftsPageSidebarControls,
  AgentSurfaceBlock,
  AppCodeBlock,
  AppInlineError,
  AgentPageDescription,
  AgentPageHeaderContent,
  AgentPageHeaderCopy,
  AgentPageShell,
  AgentPageShellHeader,
  AgentPageTitleRow,
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
    <AgentPageShell>
      <AgentPageShellHeader>
        <AgentPageHeaderContent>
          <AgentPageHeaderCopy>
            <AgentPageTitleRow>
              <ClipboardCheck size={18} />
              <h1 className="type-title font-semibold text-foreground">{t('agents.draftHistory.title')}</h1>
            </AgentPageTitleRow>
            <AgentPageDescription>{t('agents.draftHistory.description')}</AgentPageDescription>
          </AgentPageHeaderCopy>
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
        </AgentPageHeaderContent>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentDraftsPageBody>
        <AgentDraftsPageSidebar>
          <AgentDraftsPageSidebarControls>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('agents.draftHistory.searchPlaceholder')}
              className="h-8 w-full type-label"
            />
            <AgentDraftsFilterGrid>
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
            </AgentDraftsFilterGrid>
          </AgentDraftsPageSidebarControls>

          <AgentDraftsPageList>
            {draftsQuery.isLoading ? (
              <AgentDraftListState icon={<Loader2 size={14} className="animate-spin" />}>
                {t('common.loading')}
              </AgentDraftListState>
            ) : draftsQuery.error ? (
              <AppInlineError className="p-3">
                {draftsQuery.error instanceof Error ? draftsQuery.error.message : String(draftsQuery.error)}
              </AppInlineError>
            ) : drafts.length === 0 ? (
              <AgentDraftListState>
                {t('agents.chat.panel.drafts.emptyFilter')}
              </AgentDraftListState>
            ) : drafts.map((draft) => (
              <AgentSurfaceBlock key={draft.id} asChild variant="subtle">
                <AgentDraftListItemButton
                  onClick={() => setSelectedId(draft.id)}
                  data-active={selectedDraft?.id === draft.id ? 'true' : undefined}
                >
                  <AgentDraftListItemHeader>
                    <AgentDraftListItemTitle>{draft.title}</AgentDraftListItemTitle>
                    <DraftStatusBadge status={draft.status} className="shrink-0 type-tiny" />
                  </AgentDraftListItemHeader>
                  <AgentDraftListItemMeta>
                    <span>{t(`agents.chat.drafts.kinds.${draft.kind}`)}</span>
                    <span>·</span>
                    <span>{formatAgentDate(draft.updatedAt, locale)}</span>
                    {draft.projectId && (
                      <>
                        <span>·</span>
                        <span>{t('agents.chat.panel.drafts.projectBadge', { id: draft.projectId })}</span>
                      </>
                    )}
                  </AgentDraftListItemMeta>
                </AgentDraftListItemButton>
              </AgentSurfaceBlock>
            ))}
          </AgentDraftsPageList>
        </AgentDraftsPageSidebar>

        <AgentDraftsPageMain>
          {!selectedDraft ? (
            <AgentDraftListState>
              {t('agents.draftHistory.emptySelection')}
            </AgentDraftListState>
          ) : (
            <AgentDraftDetailStack>
              <AgentDraftDetailCard>
                <AgentDraftDetailHeader>
                  <AgentDraftDetailCopy>
                    <AgentDraftDetailTitle>{selectedDraft.title}</AgentDraftDetailTitle>
                    <AgentDraftBadgeRow>
                      <Badge>{t(`agents.chat.drafts.kinds.${selectedDraft.kind}`)}</Badge>
                      <DraftStatusBadge status={selectedDraft.status} />
                      {selectedDraft.projectId && <Badge variant="outline">{t('agents.chat.panel.drafts.projectBadge', { id: selectedDraft.projectId })}</Badge>}
                    </AgentDraftBadgeRow>
                  </AgentDraftDetailCopy>
                  <AgentDraftActionRow>
                    <Button type="button" size="sm" variant="outline" onClick={() => copyDraftId(selectedDraft)}>
                      <Copy size={14} />
                      {t('agents.draftHistory.copyId')}
                    </Button>
                    <Button type="button" size="sm" onClick={() => openDraftPath && navigate(openDraftPath)} disabled={!openDraftPath}>
                      <Route size={14} />
                      {t('agents.chat.panel.drafts.openPage')}
                    </Button>
                  </AgentDraftActionRow>
                </AgentDraftDetailHeader>
                <AgentDraftMetaGrid>
                  <MetaRow label={t('agents.draftHistory.sourceThread')} value={selectedDraft.createdByThreadId || sourceValue(selectedDraft, 'threadId')} />
                  <MetaRow label={t('agents.draftHistory.sourceRun')} value={selectedDraft.createdByRunId || sourceValue(selectedDraft, 'runId')} />
                  <MetaRow label={t('agents.draftHistory.filePath')} value={selectedDraft.filePath || '-'} />
                  <MetaRow label={t('agents.draftHistory.createdAt')} value={formatAgentDate(selectedDraft.createdAt, locale)} />
                  <MetaRow label={t('agents.draftHistory.updatedAt')} value={formatAgentDate(selectedDraft.updatedAt, locale)} />
                </AgentDraftMetaGrid>
              </AgentDraftDetailCard>

              <AgentDraftCodePanel>
                <section>
                <AgentDraftCodePanelHeader>{t('agents.draftHistory.content')}</AgentDraftCodePanelHeader>
                <AppCodeBlock className="max-h-[48vh] p-3 type-label leading-5 text-foreground">
                  {selectedDraft.content || t('agents.chat.panel.drafts.emptyDraft')}
                </AppCodeBlock>
                </section>
              </AgentDraftCodePanel>

              <AgentDraftJsonGrid>
                <JSONPanel title={t('agents.draftHistory.source')} value={selectedDraft.source} />
                <JSONPanel title={t('agents.draftHistory.target')} value={selectedDraft.target} />
              </AgentDraftJsonGrid>
            </AgentDraftDetailStack>
          )}
        </AgentDraftsPageMain>
      </AgentDraftsPageBody>
    </AgentPageShell>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <AgentDraftMetaItem label={label} value={value || '-'} title={value} />
  )
}

function JSONPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <AgentDraftCodePanel>
      <section>
      <AgentDraftCodePanelHeader>{title}</AgentDraftCodePanelHeader>
      <AppCodeBlock className="max-h-52 p-3 type-caption leading-5 text-muted-foreground">
        {value ? JSON.stringify(value, null, 2) : '-'}
      </AppCodeBlock>
      </section>
    </AgentDraftCodePanel>
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
