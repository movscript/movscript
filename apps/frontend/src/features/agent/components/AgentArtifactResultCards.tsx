import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AgentSurfaceBlock, Badge, StatusBadge, Button } from '@movscript/ui'
import { providerSessionClient, type WorkspaceArtifact } from '@/shared/infrastructure/providerSessionClient'
import { buildWorkspaceArtifactReviewPath, buildWorkspaceReviewPath } from '@/features/agent/domain/workspaceDomainModel'
import { workspaceArtifactStatusRecipe } from '@/features/agent/presentation/agentSemanticUi'
import { ROUTES } from '@/routes/projectRoutes'
import type { AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'

export function AgentArtifactResultCards({ artifacts }: { artifacts?: AgentTaskArtifactRef[] }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const workspaceIds = useMemo(() => Array.from(new Set((artifacts ?? []).map((artifact) => artifact.workspaceId).filter(Boolean))), [artifacts])
  const artifactsById = useMemo(() => {
    const map = new Map<string, AgentTaskArtifactRef>()
    for (const artifact of artifacts ?? []) map.set(artifact.workspaceId, artifact)
    return map
  }, [artifacts])
  const workspacesQuery = useQuery({
    queryKey: ['agent-message-workspace-artifacts', providerSessionClient.baseURL, workspaceIds],
    queryFn: async () => Promise.all(workspaceIds.map(async (workspaceId) => {
      try {
        return await providerSessionClient.getWorkspaceArtifact(workspaceId)
      } catch {
        return null
      }
    })),
    enabled: workspaceIds.length > 0,
    staleTime: 5_000,
    retry: false,
  })
  if (workspaceIds.length === 0) return null

  const workspacesById = new Map((workspacesQuery.data ?? []).filter((workspace): workspace is WorkspaceArtifact => !!workspace).map((workspace) => [workspace.id, workspace]))
  const artifactCards = dedupeArtifactResultCards(workspaceIds, artifactsById, workspacesById)

  return (
    <div className="mt-2 space-y-1.5">
      {artifactCards.map(({ workspaceId, artifact, workspace }) => {
        const title = workspace?.title ?? artifact?.title ?? workspaceId
        const kind = workspace?.kind ?? artifact?.workspaceKind
        const updatedAt = workspace?.updatedAt ?? artifact?.updatedAt
        const openPath = workspace ? buildWorkspaceReviewPath(workspace) : artifact ? buildWorkspaceArtifactReviewPath(artifact) : null
        const workspaceStatusRecipe = workspace?.status ? workspaceArtifactStatusRecipe(workspace.status) : undefined
        return (
          <AgentSurfaceBlock key={workspaceId} className="px-2.5 py-2 type-label">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                  <ClipboardCheck size={12} />
                  <span className="truncate">{title}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 type-tiny text-muted-foreground">
                  {kind && <Badge className="type-tiny leading-4 px-1.5 py-0">{t(`agents.chat.workspaces.kinds.${kind}`)}</Badge>}
                  {workspace?.status && <StatusBadge intent={workspaceStatusRecipe?.intent} emphasis={workspaceStatusRecipe?.emphasis} className="type-tiny leading-4 px-1.5 py-0">{t(`agents.chat.workspaces.status.${workspace.status}`)}</StatusBadge>}
                  {updatedAt && <span>{formatAgentDate(updatedAt, locale)}</span>}
                </div>
              </div>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="shrink-0 px-1.5 type-tiny"
                disabled={!openPath && workspacesQuery.isLoading && !workspace}
                onClick={() => navigate(openPath ?? ROUTES.agentConsole)}
              >
                <Route size={10} />
                {openPath ? t('agents.chat.panel.workspaces.openPage') : t('agents.chat.panel.workspaces.history')}
              </Button>
            </div>
          </AgentSurfaceBlock>
        )
      })}
    </div>
  )
}

function dedupeArtifactResultCards(
  workspaceIds: string[],
  artifactsById: Map<string, AgentTaskArtifactRef>,
  workspacesById: Map<string, WorkspaceArtifact>,
): Array<{ workspaceId: string; artifact?: AgentTaskArtifactRef; workspace?: WorkspaceArtifact }> {
  const cards: Array<{ workspaceId: string; artifact?: AgentTaskArtifactRef; workspace?: WorkspaceArtifact }> = []
  const seen = new Set<string>()
  for (const workspaceId of workspaceIds) {
    const artifact = artifactsById.get(workspaceId)
    const workspace = workspacesById.get(workspaceId)
    const key = workspace ? `workspace:${workspace.id}` : fallbackWorkspaceCardKey(workspaceId, artifact)
    if (seen.has(key)) continue
    seen.add(key)
    cards.push({ workspaceId: workspace?.id ?? workspaceId, artifact, workspace })
  }
  return cards
}

function fallbackWorkspaceCardKey(workspaceId: string, artifact?: AgentTaskArtifactRef) {
  if (artifact?.workspaceKind || artifact?.title || artifact?.sourceRunId || artifact?.sourceThreadId) {
    return [
      'artifact',
      artifact?.workspaceKind ?? '',
      artifact?.title ?? '',
      artifact?.sourceRunId ?? '',
      artifact?.sourceThreadId ?? '',
    ].join(':')
  }
  return [
    'artifact',
    workspaceId,
  ].join(':')
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
