import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Badge, Button } from '@movscript/ui'
import { localAgentClient, type AgentDraft, type AgentDraftStatus } from '@/lib/localAgentClient'
import { buildDraftArtifactReviewPath, buildDraftReviewPath } from '@/lib/draftDomainModel'
import { ROUTES } from '@/routes/projectRoutes'
import type { AgentTaskArtifactRef } from '@/lib/agentArtifacts'

export function AgentDraftResultCards({ artifacts }: { artifacts?: AgentTaskArtifactRef[] }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const draftIds = useMemo(() => Array.from(new Set((artifacts ?? []).map((artifact) => artifact.draftId).filter(Boolean))), [artifacts])
  const artifactsById = useMemo(() => {
    const map = new Map<string, AgentTaskArtifactRef>()
    for (const artifact of artifacts ?? []) map.set(artifact.draftId, artifact)
    return map
  }, [artifacts])
  const draftsQuery = useQuery({
    queryKey: ['agent-message-draft-artifacts', localAgentClient.baseURL, draftIds],
    queryFn: async () => Promise.all(draftIds.map(async (draftId) => {
      try {
        return await localAgentClient.getDraft(draftId)
      } catch {
        return null
      }
    })),
    enabled: draftIds.length > 0,
    staleTime: 5_000,
    retry: false,
  })
  if (draftIds.length === 0) return null

  const draftsById = new Map((draftsQuery.data ?? []).filter((draft): draft is AgentDraft => !!draft).map((draft) => [draft.id, draft]))
  const draftCards = dedupeDraftResultCards(draftIds, artifactsById, draftsById)

  return (
    <div className="mt-2 space-y-1.5">
      {draftCards.map(({ draftId, artifact, draft }) => {
        const title = draft?.title ?? artifact?.title ?? draftId
        const kind = draft?.kind ?? artifact?.draftKind
        const updatedAt = draft?.updatedAt ?? artifact?.updatedAt
        const openPath = draft ? buildDraftReviewPath(draft) : artifact ? buildDraftArtifactReviewPath(artifact) : null
        return (
          <div key={draftId} className="rounded-md border border-border bg-background/70 px-2.5 py-2 type-label">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                  <ClipboardCheck size={12} />
                  <span className="truncate">{title}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 type-micro text-muted-foreground">
                  {kind && <Badge variant="secondary" className="type-micro leading-4 px-1.5 py-0">{t(`agents.chat.drafts.kinds.${kind}`)}</Badge>}
                  {draft?.status && <Badge variant={draftStatusVariant(draft.status)} className="type-micro leading-4 px-1.5 py-0">{t(`agents.chat.drafts.status.${draft.status}`)}</Badge>}
                  {updatedAt && <span>{formatAgentDate(updatedAt, locale)}</span>}
                </div>
              </div>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="shrink-0 px-1.5 type-tiny"
                disabled={!openPath && draftsQuery.isLoading && !draft}
                onClick={() => navigate(openPath ?? ROUTES.agentDrafts)}
              >
                <Route size={10} />
                {openPath ? t('agents.chat.panel.drafts.openPage') : t('agents.chat.panel.drafts.history')}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function dedupeDraftResultCards(
  draftIds: string[],
  artifactsById: Map<string, AgentTaskArtifactRef>,
  draftsById: Map<string, AgentDraft>,
): Array<{ draftId: string; artifact?: AgentTaskArtifactRef; draft?: AgentDraft }> {
  const cards: Array<{ draftId: string; artifact?: AgentTaskArtifactRef; draft?: AgentDraft }> = []
  const seen = new Set<string>()
  for (const draftId of draftIds) {
    const artifact = artifactsById.get(draftId)
    const draft = draftsById.get(draftId)
    const key = draft ? `draft:${draft.id}` : fallbackDraftCardKey(draftId, artifact)
    if (seen.has(key)) continue
    seen.add(key)
    cards.push({ draftId: draft?.id ?? draftId, artifact, draft })
  }
  return cards
}

function fallbackDraftCardKey(draftId: string, artifact?: AgentTaskArtifactRef) {
  if (artifact?.draftKind || artifact?.title || artifact?.sourceRunId || artifact?.sourceThreadId) {
    return [
      'artifact',
      artifact?.draftKind ?? '',
      artifact?.title ?? '',
      artifact?.sourceRunId ?? '',
      artifact?.sourceThreadId ?? '',
    ].join(':')
  }
  return [
    'artifact',
    draftId,
  ].join(':')
}

function draftStatusVariant(status: AgentDraftStatus): 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'applied') return 'success'
  if (status === 'rejected') return 'destructive'
  if (status === 'accepted') return 'warning'
  if (status === 'superseded') return 'secondary'
  return 'outline'
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
