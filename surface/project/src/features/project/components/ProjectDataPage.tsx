import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, CheckCircle2, CircleUserRound, Database, RefreshCw, Search, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppPageHeader } from '@movscript/ui/layout'
import { StatusBadge } from '@movscript/ui/primitives'
import { surfaceDataApi as api } from '@movscript/shared/surface-http'
import { resolveResourceFileUrl } from '@movscript/resource-surface/resource-media'
import { ProjectListPageLayout, ProjectPageActionButton, ProjectPageEmptyState } from './ProjectPageUi'
import { useSurfaceHostState } from '../application/surfaceHostStateHooks'

type ProjectDataScopeKind = 'user' | 'org'
type ProjectDataSpaceFilter = 'all' | 'pending' | 'recent' | 'archived'
type ProjectDataDecisionFilter = 'all' | 'missing' | 'pending' | 'selected'
type CandidatePreviewKind = 'image' | 'video' | 'audio' | 'text' | 'unknown'
type ProjectDataCandidateFilter = 'all' | 'selected' | CandidatePreviewKind

interface ProjectDataSpaceSummary {
  id: number
  scope_kind: ProjectDataScopeKind
  scope_id: string
  project_uid: string
  title?: string
  status: string
  decision_count: number
  candidate_count: number
  selection_count: number
  created_at: string
  updated_at: string
  last_decision_at?: string
}

interface ProjectDataDecisionContext {
  id: number
  project_data_space_id: number
  target_kind: string
  target_ref: string
  candidates: unknown[]
  selection?: unknown
  status: string
  created_at: string
  updated_at: string
}

interface ProjectDataSpacesResponse {
  items: ProjectDataSpaceSummary[]
}

interface ProjectDataDecisionsResponse {
  items: ProjectDataDecisionContext[]
}

interface ProjectDataCandidatePreview {
  id: string
  title: string
  status?: string
  source?: string
  resourceId?: string
  mediaKind: CandidatePreviewKind
  mediaUrl?: string
}

const projectDataKeys = {
  spaces: (scopeKind: ProjectDataScopeKind, scopeId: number | null | undefined) => ['project-data', 'spaces', scopeKind, scopeId ?? 'none'] as const,
  decisions: (scopeKind: ProjectDataScopeKind, scopeId: number | null | undefined, spaceId: number | undefined) => ['project-data', 'space-decisions', scopeKind, scopeId ?? 'none', spaceId ?? 'none'] as const,
}

function formatDate(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function ProjectDataScopeButton({
  active,
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  disabled?: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <ProjectPageActionButton
      type="button"
      variant={active ? 'solid' : 'outline'}
      size="sm"
      disabled={disabled}
      onClick={onClick}
      className="gap-1.5"
    >
      <Icon size={14} />
      {label}
    </ProjectPageActionButton>
  )
}

function ProjectDataFilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <ProjectPageActionButton
      type="button"
      variant={active ? 'solid' : 'ghost'}
      size="sm"
      onClick={onClick}
    >
      {label}
    </ProjectPageActionButton>
  )
}

function ProjectDataSpaceRow({
  active,
  space,
  onSelect,
}: {
  active: boolean
  space: ProjectDataSpaceSummary
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const title = space.title?.trim() || space.project_uid
  const pending = pendingDecisionCount(space)
  const tone = space.status === 'archived' ? 'neutral' : pending > 0 ? 'info' : 'success'
  return (
    <button
      type="button"
      className="project-data-row"
      data-active={active ? 'true' : undefined}
      onClick={onSelect}
    >
      <div className="project-data-row__identity">
        <div className="project-data-row__title-line">
          <span className="project-data-row__title">{title}</span>
          <StatusBadge tone={tone}>{space.status === 'archived' ? t('projectData.status.archived') : pending > 0 ? t('projectData.status.pending') : t('projectData.status.ready')}</StatusBadge>
        </div>
        <div className="project-data-row__uid">{space.project_uid}</div>
      </div>

      <dl className="project-data-row__stats">
        <div>
          <dt>{t('projectData.stats.targets')}</dt>
          <dd>{space.decision_count}</dd>
        </div>
        <div>
          <dt>{t('projectData.stats.selections')}</dt>
          <dd>{space.selection_count}</dd>
        </div>
        <div>
          <dt>{t('projectData.stats.pending')}</dt>
          <dd>{pending}</dd>
        </div>
      </dl>

      <div className="project-data-row__time">
        <span>{t('projectData.updated')}</span>
        <strong>{formatDate(space.last_decision_at ?? space.updated_at)}</strong>
      </div>
    </button>
  )
}

function ProjectDataSpaceDetail({
  candidateFilter,
  decisions,
  filter,
  loading,
  selectedDecisionID,
  space,
  onCandidateFilterChange,
  onFilterChange,
  onSelectDecision,
}: {
  candidateFilter: ProjectDataCandidateFilter
  decisions: ProjectDataDecisionContext[]
  filter: ProjectDataDecisionFilter
  loading: boolean
  selectedDecisionID?: number
  space?: ProjectDataSpaceSummary
  onCandidateFilterChange: (filter: ProjectDataCandidateFilter) => void
  onFilterChange: (filter: ProjectDataDecisionFilter) => void
  onSelectDecision: (decisionID: number | undefined) => void
}) {
  const { t } = useTranslation()
  const filtered = useMemo(() => filterDecisions(decisions, filter), [decisions, filter])
  const selectedDecision = filtered.find((decision) => decision.id === selectedDecisionID) ?? filtered[0]
  if (!space) {
    return (
      <section className="project-data-detail project-data-detail--empty">
        <ProjectPageEmptyState icon={Database} title={t('projectData.emptyTitle')} />
      </section>
    )
  }

  const missing = decisions.filter((decision) => decision.candidates.length === 0).length
  const pending = decisions.filter((decision) => decision.candidates.length > 0 && decision.status !== 'selected').length
  return (
    <section className="project-data-detail" aria-label={t('projectData.detailAriaLabel')}>
      <div className="project-data-detail__header">
        <div>
          <h2>{space.title?.trim() || space.project_uid}</h2>
          <p>{space.project_uid}</p>
        </div>
        <StatusBadge tone={pending > 0 || missing > 0 ? 'info' : 'success'}>
          {t('projectData.lockedRatio', { selections: space.selection_count, targets: space.decision_count })}
        </StatusBadge>
      </div>

      <dl className="project-data-detail__summary">
        <div>
          <dt>{t('projectData.stats.targets')}</dt>
          <dd>{space.decision_count}</dd>
        </div>
        <div>
          <dt>{t('projectData.stats.selections')}</dt>
          <dd>{space.selection_count}</dd>
        </div>
        <div>
          <dt>{t('projectData.stats.pending')}</dt>
          <dd>{pending}</dd>
        </div>
        <div>
          <dt>{t('projectData.stats.missing')}</dt>
          <dd>{missing}</dd>
        </div>
      </dl>

      <div className="project-data-detail__filters">
        {(['all', 'missing', 'pending', 'selected'] as const).map((item) => (
          <ProjectDataFilterButton
            key={item}
            active={filter === item}
            label={t(`projectData.decisionFilters.${item}`)}
            onClick={() => {
              onFilterChange(item)
              onSelectDecision(undefined)
              onCandidateFilterChange('all')
            }}
          />
        ))}
      </div>

      {loading ? (
        <p className="project-data-detail__loading">{t('common.loadingShort')}</p>
      ) : filtered.length === 0 ? (
        <ProjectPageEmptyState icon={CheckCircle2} title={t('projectData.emptyDecisionTitle')} />
      ) : (
        <div className="project-data-target-workspace">
          <div className="project-data-target-list" aria-label={t('projectData.targetsAriaLabel')}>
            {filtered.map((decision) => (
              <ProjectDataTargetRow
                key={decision.id}
                active={decision.id === selectedDecision?.id}
                decision={decision}
                onSelect={() => {
                  onSelectDecision(decision.id)
                  onCandidateFilterChange('all')
                }}
              />
            ))}
          </div>
          <ProjectDataCandidateWorkspace
            candidateFilter={candidateFilter}
            decision={selectedDecision}
            onCandidateFilterChange={onCandidateFilterChange}
          />
        </div>
      )}
    </section>
  )
}

function ProjectDataTargetRow({
  active,
  decision,
  onSelect,
}: {
  active: boolean
  decision: ProjectDataDecisionContext
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const status = decisionStatus(decision)
  const selected = selectionSummary(decision.selection)
  return (
    <button
      type="button"
      className="project-data-target-row"
      data-active={active ? 'true' : undefined}
      onClick={onSelect}
    >
      <div className="project-data-target-row__main">
        <span>{targetKindLabel(decision.target_kind)}</span>
        <strong>{decision.target_ref}</strong>
      </div>
      <div className="project-data-target-row__meta">
        <StatusBadge tone={status === 'selected' ? 'success' : status === 'pending' ? 'info' : 'neutral'}>
          {t(`projectData.decisionStatus.${status}`)}
        </StatusBadge>
        <span>{t('projectData.candidateCount', { count: decision.candidates.length })}</span>
      </div>
      <div className="project-data-target-row__selection">{selected || t('projectData.noEvidence')}</div>
    </button>
  )
}

function ProjectDataCandidateWorkspace({
  candidateFilter,
  decision,
  onCandidateFilterChange,
}: {
  candidateFilter: ProjectDataCandidateFilter
  decision?: ProjectDataDecisionContext
  onCandidateFilterChange: (filter: ProjectDataCandidateFilter) => void
}) {
  const { t } = useTranslation()
  if (!decision) {
    return (
      <section className="project-data-candidate-workspace project-data-candidate-workspace--empty">
        <ProjectPageEmptyState icon={Database} title={t('projectData.emptyDecisionTitle')} />
      </section>
    )
  }

  const selectedCandidateID = selectedCandidateId(decision.selection)
  const selectedResourceID = selectedResourceId(decision.selection)
  const previews = decision.candidates.map((candidate, index) => candidatePreview(candidate, index))
  const filteredPreviews = filterCandidatePreviews(previews, candidateFilter, selectedCandidateID, selectedResourceID)
  const status = decisionStatus(decision)
  return (
    <section className="project-data-candidate-workspace" aria-label={t('projectData.candidatePreviewAriaLabel')}>
      <div className="project-data-candidate-workspace__header">
        <div>
          <span>{targetKindLabel(decision.target_kind)}</span>
          <h3>{decision.target_ref}</h3>
        </div>
        <StatusBadge tone={status === 'selected' ? 'success' : status === 'pending' ? 'info' : 'neutral'}>
          {t(`projectData.decisionStatus.${status}`)}
        </StatusBadge>
      </div>

      <div className="project-data-candidate-workspace__filters">
        {(['all', 'selected', 'image', 'video', 'audio', 'text', 'unknown'] as const).map((item) => (
          <ProjectDataFilterButton
            key={item}
            active={candidateFilter === item}
            label={t(`projectData.candidateFilters.${item}`)}
            onClick={() => onCandidateFilterChange(item)}
          />
        ))}
      </div>

      <div className="project-data-candidate-workspace__selection">
        <span>{t('projectData.currentSelection')}</span>
        <strong>{selectionSummary(decision.selection) || t('projectData.noEvidence')}</strong>
      </div>

      {filteredPreviews.length === 0 ? (
        <div className="project-data-candidate-grid__empty">{t('projectData.noPreview')}</div>
      ) : (
        <div className="project-data-candidate-grid">
          {filteredPreviews.map((preview) => (
            <ProjectDataCandidateTile
              key={`${preview.id}:${preview.resourceId ?? 'inline'}`}
              preview={preview}
              selected={isSelectedCandidatePreview(preview, selectedCandidateID, selectedResourceID)}
            />
          ))}
        </div>
      )}

      <div className="project-data-candidate-workspace__updated">
        {t('projectData.updated')}: {formatDate(decision.updated_at)}
      </div>
    </section>
  )
}

function ProjectDataCandidateTile({
  preview,
  selected,
}: {
  preview: ProjectDataCandidatePreview
  selected: boolean
}) {
  const { t } = useTranslation()
  const meta = [
    preview.resourceId ? t('projectData.resourceLabel', { id: preview.resourceId }) : undefined,
    preview.source,
    preview.status,
  ].filter(Boolean).join(' · ')
  return (
    <figure className="project-data-candidate-tile" data-selected={selected ? 'true' : undefined}>
      <div className="project-data-candidate-tile__media">
        {preview.mediaUrl && preview.mediaKind === 'image' ? (
          <img src={preview.mediaUrl} alt={preview.title} loading="lazy" />
        ) : preview.mediaUrl && preview.mediaKind === 'video' ? (
          <video src={preview.mediaUrl} muted playsInline preload="metadata" />
        ) : preview.mediaUrl && preview.mediaKind === 'audio' ? (
          <audio src={preview.mediaUrl} controls preload="metadata" />
        ) : preview.mediaKind === 'text' ? (
          <span>{t('projectData.previewKind.text')}</span>
        ) : (
          <span>{t('projectData.previewKind.unknown')}</span>
        )}
      </div>
      <figcaption>
        <strong>{preview.title}</strong>
        <small>{selected ? t('projectData.selectedCandidate') : meta || t(`projectData.previewKind.${preview.mediaKind}`)}</small>
      </figcaption>
    </figure>
  )
}

export default function ProjectDataPage() {
  const { t } = useTranslation()
  const currentOrgID = useSurfaceHostState((state) => state.currentOrgID)
  const currentUser = useSurfaceHostState((state) => state.currentUser)
  const [scopeKind, setScopeKind] = useState<ProjectDataScopeKind>('user')
  const [spaceFilter, setSpaceFilter] = useState<ProjectDataSpaceFilter>('all')
  const [decisionFilter, setDecisionFilter] = useState<ProjectDataDecisionFilter>('all')
  const [candidateFilter, setCandidateFilter] = useState<ProjectDataCandidateFilter>('all')
  const [selectedSpaceID, setSelectedSpaceID] = useState<number | undefined>(undefined)
  const [selectedDecisionID, setSelectedDecisionID] = useState<number | undefined>(undefined)
  const [queryText, setQueryText] = useState('')
  const activeScopeID = scopeKind === 'org' ? currentOrgID : currentUser?.ID
  const query = useQuery({
    queryKey: projectDataKeys.spaces(scopeKind, activeScopeID),
    queryFn: async () => {
      const response = await api.get<ProjectDataSpacesResponse>('/project-data/spaces', {
        params: { scope_kind: scopeKind },
      })
      return response.data.items
    },
    enabled: scopeKind !== 'org' || !!currentOrgID,
  })
  const spaces = query.data ?? []
  const filteredSpaces = useMemo(() => filterSpaces(spaces, spaceFilter, queryText), [queryText, spaceFilter, spaces])
  const selectedSpace = filteredSpaces.find((space) => space.id === selectedSpaceID) ?? filteredSpaces[0]
  const decisionsQuery = useQuery({
    queryKey: projectDataKeys.decisions(scopeKind, activeScopeID, selectedSpace?.id),
    queryFn: async () => {
      const response = await api.get<ProjectDataDecisionsResponse>(`/project-data/spaces/${selectedSpace?.id}/decisions`, {
        params: { scope_kind: scopeKind },
      })
      return response.data.items
    },
    enabled: Boolean(selectedSpace?.id) && (scopeKind !== 'org' || !!currentOrgID),
  })
  const totals = useMemo(() => spaces.reduce(
    (acc, item) => ({
      spaces: acc.spaces + 1,
      decisions: acc.decisions + item.decision_count,
      candidates: acc.candidates + item.candidate_count,
      selections: acc.selections + item.selection_count,
      pending: acc.pending + pendingDecisionCount(item),
    }),
    { spaces: 0, decisions: 0, candidates: 0, selections: 0, pending: 0 },
  ), [spaces])

  return (
    <ProjectListPageLayout contentClassName="projects-page project-data-page">
      <AppPageHeader
        icon={Database}
        title={t('projectData.title')}
        description={t('projectData.description')}
        actions={(
          <div className="project-data-page__actions">
            <ProjectDataScopeButton
              active={scopeKind === 'user'}
              icon={CircleUserRound}
              label={t('projectData.scope.user')}
              onClick={() => setScopeKind('user')}
            />
            <ProjectDataScopeButton
              active={scopeKind === 'org'}
              disabled={!currentOrgID}
              icon={Building2}
              label={t('projectData.scope.org')}
              onClick={() => setScopeKind('org')}
            />
            <ProjectPageActionButton type="button" variant="outline" size="sm" onClick={() => void query.refetch()} className="gap-1.5">
              <RefreshCw size={14} />
              {t('common.refresh')}
            </ProjectPageActionButton>
          </div>
        )}
      />

      <section className="project-data-toolbar" aria-label={t('projectData.overviewAriaLabel')}>
        <div className="project-data-search">
          <Search size={14} />
          <input
            value={queryText}
            placeholder={t('projectData.searchPlaceholder')}
            onChange={(event) => setQueryText(event.target.value)}
            aria-label={t('projectData.searchPlaceholder')}
          />
        </div>
        <div className="project-data-filter-row">
          {(['all', 'pending', 'recent', 'archived'] as const).map((filter) => (
            <ProjectDataFilterButton
              key={filter}
              active={spaceFilter === filter}
              label={t(`projectData.filters.${filter}`)}
              onClick={() => {
                setSpaceFilter(filter)
                setSelectedDecisionID(undefined)
                setCandidateFilter('all')
              }}
            />
          ))}
        </div>
        <p className="project-data-toolbar__summary">
          {t('projectData.totals', {
            spaces: totals.spaces,
            targets: totals.decisions,
            selections: totals.selections,
            pending: totals.pending,
          })}
        </p>
      </section>

      <section className="projects-region" aria-label={t('projectData.spacesAriaLabel')}>
        <div className="projects-region__header project-data-region-header">
          <div>
            <h2 className="projects-region__title">{t('projectData.spacesTitle')}</h2>
            <p className="projects-region__description">{t('projectData.spacesSubtitle')}</p>
          </div>
        </div>

        {query.isLoading ? (
          <div className="projects-region__body">
            <p className="type-body text-muted-foreground">{t('common.loadingShort')}</p>
          </div>
        ) : filteredSpaces.length === 0 ? (
          <div className="projects-region__body">
            <ProjectPageEmptyState
              icon={CheckCircle2}
              title={t('projectData.emptyTitle')}
            />
          </div>
        ) : (
          <div className="project-data-workspace">
            <div className="project-data-list">
              {filteredSpaces.map((space) => (
                <ProjectDataSpaceRow
                  key={`${space.scope_kind}:${space.scope_id}:${space.project_uid}`}
                  active={space.id === selectedSpace?.id}
                  space={space}
                  onSelect={() => {
                    setSelectedSpaceID(space.id)
                    setDecisionFilter('all')
                    setSelectedDecisionID(undefined)
                    setCandidateFilter('all')
                  }}
                />
              ))}
            </div>
            <ProjectDataSpaceDetail
              candidateFilter={candidateFilter}
              decisions={decisionsQuery.data ?? []}
              filter={decisionFilter}
              loading={decisionsQuery.isLoading}
              selectedDecisionID={selectedDecisionID}
              space={selectedSpace}
              onCandidateFilterChange={setCandidateFilter}
              onFilterChange={setDecisionFilter}
              onSelectDecision={setSelectedDecisionID}
            />
          </div>
        )}
      </section>
    </ProjectListPageLayout>
  )
}

function filterSpaces(spaces: ProjectDataSpaceSummary[], filter: ProjectDataSpaceFilter, queryText: string): ProjectDataSpaceSummary[] {
  const needle = queryText.trim().toLowerCase()
  const searched = needle
    ? spaces.filter((space) => `${space.title ?? ''} ${space.project_uid}`.toLowerCase().includes(needle))
    : spaces
  const filtered = searched.filter((space) => {
    if (filter === 'archived') return space.status === 'archived'
    if (filter === 'pending') return space.status !== 'archived' && pendingDecisionCount(space) > 0
    if (filter === 'recent') return space.status !== 'archived'
    return space.status !== 'archived'
  })
  const sorted = [...filtered].sort((a, b) => updatedTime(b) - updatedTime(a))
  return filter === 'recent' ? sorted.slice(0, 8) : sorted
}

function filterDecisions(decisions: ProjectDataDecisionContext[], filter: ProjectDataDecisionFilter): ProjectDataDecisionContext[] {
  if (filter === 'missing') return decisions.filter((decision) => decision.candidates.length === 0)
  if (filter === 'pending') return decisions.filter((decision) => decision.candidates.length > 0 && decision.status !== 'selected')
  if (filter === 'selected') return decisions.filter((decision) => decision.status === 'selected')
  return decisions
}

function filterCandidatePreviews(
  previews: ProjectDataCandidatePreview[],
  filter: ProjectDataCandidateFilter,
  selectedCandidateID: string | undefined,
  selectedResourceID: string | undefined,
): ProjectDataCandidatePreview[] {
  if (filter === 'selected') return previews.filter((preview) => isSelectedCandidatePreview(preview, selectedCandidateID, selectedResourceID))
  if (filter === 'all') return previews
  return previews.filter((preview) => preview.mediaKind === filter)
}

function isSelectedCandidatePreview(
  preview: ProjectDataCandidatePreview,
  selectedCandidateID: string | undefined,
  selectedResourceID: string | undefined,
) {
  return Boolean(
    (selectedCandidateID && selectedCandidateID === preview.id)
    || (selectedResourceID && selectedResourceID === preview.resourceId),
  )
}

function pendingDecisionCount(space: ProjectDataSpaceSummary) {
  return Math.max(space.decision_count - space.selection_count, 0)
}

function updatedTime(space: ProjectDataSpaceSummary) {
  const date = new Date(space.last_decision_at ?? space.updated_at)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function decisionStatus(decision: ProjectDataDecisionContext): 'missing' | 'pending' | 'selected' {
  if (decision.status === 'selected') return 'selected'
  if (decision.candidates.length > 0) return 'pending'
  return 'missing'
}

function targetKindLabel(kind: string) {
  return kind.replace(/_/g, ' ')
}

function selectionSummary(value: unknown) {
  if (!isRecord(value)) return ''
  const candidateID = stringValue(value.candidate_id ?? value.candidateId)
  const resourceID = stringValue(value.resource_id ?? value.resourceId)
  if (candidateID && resourceID) return `${candidateID} / resource #${resourceID}`
  if (candidateID) return candidateID
  if (resourceID) return `resource #${resourceID}`
  return ''
}

function selectedCandidateId(value: unknown) {
  if (!isRecord(value)) return undefined
  return stringValue(value.candidate_id ?? value.candidateId)
}

function selectedResourceId(value: unknown) {
  if (!isRecord(value)) return undefined
  return stringValue(value.resource_id ?? value.resourceId)
}

function candidatePreview(value: unknown, index: number): ProjectDataCandidatePreview {
  const record = isRecord(value) ? value : {}
  const output = firstCandidateOutput(record)
  const resourceId = stringValue(
    output?.resource_id
    ?? output?.resourceId
    ?? record.resource_id
    ?? record.resourceId,
  )
  const explicitUrl = stringValue(
    output?.url
    ?? output?.resource_url
    ?? output?.resourceUrl
    ?? output?.preview_url
    ?? output?.previewUrl
    ?? output?.thumbnail_url
    ?? output?.thumbnailUrl
    ?? record.url
    ?? record.resource_url
    ?? record.resourceUrl
    ?? record.preview_url
    ?? record.previewUrl
    ?? record.thumbnail_url
    ?? record.thumbnailUrl,
  )
  const mediaKind = candidatePreviewKind(
    output?.kind
    ?? output?.type
    ?? output?.media_type
    ?? output?.mime_type
    ?? output?.mimeType
    ?? record.output_kind
    ?? record.outputKind
    ?? record.kind
    ?? record.type
    ?? record.media_type
    ?? record.mime_type
    ?? record.mimeType,
  )
  const id = stringValue(record.id ?? record.candidate_id ?? record.candidateId) ?? `candidate-${index + 1}`
  return {
    id,
    title: stringValue(record.title ?? record.name) ?? id,
    status: stringValue(record.status),
    source: stringValue(record.source ?? record.origin),
    resourceId,
    mediaKind,
    mediaUrl: resolveResourceFileUrl(resourceId, explicitUrl),
  }
}

function firstCandidateOutput(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const outputs = Array.isArray(record.outputs) ? record.outputs.filter(isRecord) : []
  return outputs.find((output) => output.resource_id || output.resourceId || output.url || output.resource_url || output.resourceUrl)
    ?? outputs[0]
}

function candidatePreviewKind(value: unknown): CandidatePreviewKind {
  const kind = stringValue(value)?.toLowerCase() ?? ''
  if (kind.startsWith('image/') || kind === 'image' || kind === 'storyboard' || kind.includes('png') || kind.includes('jpeg') || kind.includes('jpg') || kind.includes('webp')) return 'image'
  if (kind.startsWith('video/') || kind === 'video' || kind.includes('mp4') || kind.includes('mpegurl')) return 'video'
  if (kind.startsWith('audio/') || kind === 'audio' || kind === 'voiceover' || kind === 'music') return 'audio'
  if (kind.startsWith('text/') || kind === 'text' || kind === 'subtitle' || kind === 'metadata') return 'text'
  return 'unknown'
}

function stringValue(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
