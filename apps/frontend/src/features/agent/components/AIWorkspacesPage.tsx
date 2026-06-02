import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ClipboardCheck, Copy, Loader2, RefreshCw, Route } from 'lucide-react'
import {
  AgentWorkspacesPageBody,
  AgentWorkspacesFilterGrid,
  AgentWorkspaceActionRow,
  AgentWorkspaceBadgeRow,
  AgentWorkspaceCodePanel,
  AgentWorkspaceCodePanelHeader,
  AgentWorkspaceDetailCard,
  AgentWorkspaceDetailCopy,
  AgentWorkspaceDetailHeader,
  AgentWorkspaceDetailStack,
  AgentWorkspaceDetailTitle,
  AgentWorkspaceJsonGrid,
  AgentWorkspaceListItemButton,
  AgentWorkspaceListItemHeader,
  AgentWorkspaceListItemMeta,
  AgentWorkspaceListItemTitle,
  AgentWorkspaceListState,
  AgentWorkspaceMetaGrid,
  AgentWorkspaceMetaItem,
  AgentWorkspacesPageList,
  AgentWorkspacesPageMain,
  AgentWorkspacesPageSidebar,
  AgentWorkspacesPageSidebarControls,
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
  type AgentWorkspace,
  type AgentWorkspaceKind,
} from '@/shared/infrastructure/localAgentClient'
import { buildWorkspaceReviewPath } from '@/features/agent/domain/workspaceDomainModel'
import { agentWorkspaceStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'

const WORKSPACE_KINDS: AgentWorkspaceKind[] = [
  'setting_workspace',
  'project_standards_workspace',
  'asset_workspace',
  'production_workspace',
  'content_unit_workspace',
]

type ProjectFilter = 'all' | 'current'

export default function AIWorkspacesPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const currentProject = useProjectStore((s) => s.current)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const [kindFilter, setKindFilter] = useState<AgentWorkspaceKind | 'all'>('all')
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const query = {
    ...(projectFilter === 'current' && currentProject ? { projectId: currentProject.ID } : {}),
    limit: 100,
  }
  const workspacesQuery = useQuery<AgentWorkspace[]>({
    queryKey: ['ai-active-workspaces', localAgentClient.baseURL, query],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.listWorkspaces(query).then((r) => r.workspaces)
    },
    retry: false,
  })
  const workspaces = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const rows = (workspacesQuery.data ?? []).filter((workspace) => kindFilter === 'all' || workspace.kind === kindFilter)
    if (!needle) return rows
    return rows.filter((workspace) => {
      const kindLabel = t(`agents.chat.workspaces.kinds.${workspace.kind}`)
      return [
        workspace.id,
        workspace.kind,
        kindLabel,
        workspace.title,
        workspace.content,
        workspace.status,
        workspace.createdByThreadId,
        workspace.createdByRunId,
        sourceValue(workspace, 'threadId'),
        sourceValue(workspace, 'runId'),
      ].some((value) => (value ?? '').toLowerCase().includes(needle))
    })
  }, [workspacesQuery.data, kindFilter, search, t])
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedId) ?? workspaces[0] ?? null
  const openWorkspacePath = selectedWorkspace ? buildWorkspaceReviewPath(selectedWorkspace) : null

  async function copyWorkspaceId(workspace: AgentWorkspace) {
    await navigator.clipboard.writeText(workspace.id)
  }

  return (
    <AgentPageShell>
      <AgentPageShellHeader>
        <AgentPageHeaderContent>
          <AgentPageHeaderCopy>
            <AgentPageTitleRow>
              <ClipboardCheck size={18} />
              <h1 className="type-title font-semibold text-foreground">{t('agents.workspaceHistory.title')}</h1>
            </AgentPageTitleRow>
            <AgentPageDescription>{t('agents.workspaceHistory.description')}</AgentPageDescription>
          </AgentPageHeaderCopy>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => workspacesQuery.refetch()}
            disabled={workspacesQuery.isFetching}
          >
            <RefreshCw size={14} className={workspacesQuery.isFetching ? 'animate-spin' : ''} />
            {t('agents.chat.panel.workspaces.refresh')}
          </Button>
        </AgentPageHeaderContent>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentWorkspacesPageBody>
        <AgentWorkspacesPageSidebar>
          <AgentWorkspacesPageSidebarControls>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('agents.workspaceHistory.searchPlaceholder')}
              className="h-8 w-full type-label"
            />
            <AgentWorkspacesFilterGrid>
              <Select value={projectFilter} onValueChange={(next) => setProjectFilter(next as ProjectFilter)}>
                <SelectTrigger size="sm" className="h-8 type-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('agents.workspaceHistory.allProjects')}</SelectItem>
                  <SelectItem value="current" disabled={!currentProject}>{t('agents.workspaceHistory.currentProject')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={kindFilter} onValueChange={(next) => setKindFilter(next as AgentWorkspaceKind | 'all')}>
                <SelectTrigger size="sm" className="h-8 type-label"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('agents.chat.workspaces.filters.allKinds')}</SelectItem>
                  {WORKSPACE_KINDS.map((item) => <SelectItem key={item} value={item}>{t(`agents.chat.workspaces.kinds.${item}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </AgentWorkspacesFilterGrid>
          </AgentWorkspacesPageSidebarControls>

          <AgentWorkspacesPageList>
            {workspacesQuery.isLoading ? (
              <AgentWorkspaceListState icon={<Loader2 size={14} className="animate-spin" />}>
                {t('common.loading')}
              </AgentWorkspaceListState>
            ) : workspacesQuery.error ? (
              <AppInlineError className="p-3">
                {workspacesQuery.error instanceof Error ? workspacesQuery.error.message : String(workspacesQuery.error)}
              </AppInlineError>
            ) : workspaces.length === 0 ? (
              <AgentWorkspaceListState>
                {t('agents.chat.panel.workspaces.emptyFilter')}
              </AgentWorkspaceListState>
            ) : workspaces.map((workspace) => (
              <AgentSurfaceBlock key={workspace.id} asChild variant="subtle">
                <AgentWorkspaceListItemButton
                  onClick={() => setSelectedId(workspace.id)}
                  data-active={selectedWorkspace?.id === workspace.id ? 'true' : undefined}
                >
                  <AgentWorkspaceListItemHeader>
                    <AgentWorkspaceListItemTitle>{workspace.title}</AgentWorkspaceListItemTitle>
                    <WorkspaceStatusBadge status={workspace.status} className="shrink-0 type-tiny" />
                  </AgentWorkspaceListItemHeader>
                  <AgentWorkspaceListItemMeta>
                    <span>{t(`agents.chat.workspaces.kinds.${workspace.kind}`)}</span>
                    <span>·</span>
                    <span>{formatAgentDate(workspace.updatedAt, locale)}</span>
                    {workspace.projectId && (
                      <>
                        <span>·</span>
                        <span>{t('agents.chat.panel.workspaces.projectBadge', { id: workspace.projectId })}</span>
                      </>
                    )}
                  </AgentWorkspaceListItemMeta>
                </AgentWorkspaceListItemButton>
              </AgentSurfaceBlock>
            ))}
          </AgentWorkspacesPageList>
        </AgentWorkspacesPageSidebar>

        <AgentWorkspacesPageMain>
          {!selectedWorkspace ? (
            <AgentWorkspaceListState>
              {t('agents.workspaceHistory.emptySelection')}
            </AgentWorkspaceListState>
          ) : (
            <AgentWorkspaceDetailStack>
              <AgentWorkspaceDetailCard>
                <AgentWorkspaceDetailHeader>
                  <AgentWorkspaceDetailCopy>
                    <AgentWorkspaceDetailTitle>{selectedWorkspace.title}</AgentWorkspaceDetailTitle>
                    <AgentWorkspaceBadgeRow>
                      <Badge>{t(`agents.chat.workspaces.kinds.${selectedWorkspace.kind}`)}</Badge>
                      <WorkspaceStatusBadge status={selectedWorkspace.status} />
                      {selectedWorkspace.projectId && <Badge variant="outline">{t('agents.chat.panel.workspaces.projectBadge', { id: selectedWorkspace.projectId })}</Badge>}
                    </AgentWorkspaceBadgeRow>
                  </AgentWorkspaceDetailCopy>
                  <AgentWorkspaceActionRow>
                    <Button type="button" size="sm" variant="outline" onClick={() => copyWorkspaceId(selectedWorkspace)}>
                      <Copy size={14} />
                      {t('agents.workspaceHistory.copyId')}
                    </Button>
                    <Button type="button" size="sm" onClick={() => openWorkspacePath && navigate(openWorkspacePath)} disabled={!openWorkspacePath}>
                      <Route size={14} />
                      {t('agents.chat.panel.workspaces.openPage')}
                    </Button>
                  </AgentWorkspaceActionRow>
                </AgentWorkspaceDetailHeader>
                <AgentWorkspaceMetaGrid>
                  <MetaRow label={t('agents.workspaceHistory.sourceThread')} value={selectedWorkspace.createdByThreadId || sourceValue(selectedWorkspace, 'threadId')} />
                  <MetaRow label={t('agents.workspaceHistory.sourceRun')} value={selectedWorkspace.createdByRunId || sourceValue(selectedWorkspace, 'runId')} />
                  <MetaRow label={t('agents.workspaceHistory.filePath')} value={selectedWorkspace.filePath || '-'} />
                  <MetaRow label={t('agents.workspaceHistory.createdAt')} value={formatAgentDate(selectedWorkspace.createdAt, locale)} />
                  <MetaRow label={t('agents.workspaceHistory.updatedAt')} value={formatAgentDate(selectedWorkspace.updatedAt, locale)} />
                </AgentWorkspaceMetaGrid>
              </AgentWorkspaceDetailCard>

              <AgentWorkspaceCodePanel>
                <section>
                <AgentWorkspaceCodePanelHeader>{t('agents.workspaceHistory.content')}</AgentWorkspaceCodePanelHeader>
                <AppCodeBlock className="max-h-[48vh] p-3 type-label leading-5 text-foreground">
                  {selectedWorkspace.content || t('agents.chat.panel.workspaces.emptyWorkspace')}
                </AppCodeBlock>
                </section>
              </AgentWorkspaceCodePanel>

              <AgentWorkspaceJsonGrid>
                <JSONPanel title={t('agents.workspaceHistory.source')} value={selectedWorkspace.source} />
                <JSONPanel title={t('agents.workspaceHistory.target')} value={selectedWorkspace.target} />
              </AgentWorkspaceJsonGrid>
            </AgentWorkspaceDetailStack>
          )}
        </AgentWorkspacesPageMain>
      </AgentWorkspacesPageBody>
    </AgentPageShell>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <AgentWorkspaceMetaItem label={label} value={value || '-'} title={value} />
  )
}

function JSONPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <AgentWorkspaceCodePanel>
      <section>
      <AgentWorkspaceCodePanelHeader>{title}</AgentWorkspaceCodePanelHeader>
      <AppCodeBlock className="max-h-52 p-3 type-caption leading-5 text-muted-foreground">
        {value ? JSON.stringify(value, null, 2) : '-'}
      </AppCodeBlock>
      </section>
    </AgentWorkspaceCodePanel>
  )
}

function sourceValue(workspace: AgentWorkspace, key: 'threadId' | 'runId'): string {
  const value = workspace.source?.[key]
  return typeof value === 'string' ? value : ''
}

function formatAgentDate(value: string | number, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function WorkspaceStatusBadge({ status, className }: { status: AgentWorkspace['status']; className?: string }) {
  const { t } = useTranslation()
  const statusRecipe = agentWorkspaceStatusRecipe(status)
  return (
    <StatusBadge intent={statusRecipe.intent} emphasis={statusRecipe.emphasis} className={className}>
      {t(`agents.chat.workspaces.status.${status}`)}
    </StatusBadge>
  )
}
