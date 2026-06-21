import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, CheckCircle2, CircleUserRound, Database, RefreshCw } from 'lucide-react'
import { AppPageHeader } from '@movscript/ui/layout'
import { StatusBadge } from '@movscript/ui/primitives'
import { api } from '@/shared/infrastructure/api'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ProjectListPageLayout, ProjectPageActionButton, ProjectPageEmptyState } from './ProjectPageUi'

type ProjectDataScopeKind = 'user' | 'org'

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

interface ProjectDataSpacesResponse {
  items: ProjectDataSpaceSummary[]
}

const projectDataKeys = {
  spaces: (scopeKind: ProjectDataScopeKind, scopeId: number | null | undefined) => ['project-data', 'spaces', scopeKind, scopeId ?? 'none'] as const,
}

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
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
  icon: typeof CircleUserRound
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

function ProjectDataSpaceRow({ space }: { space: ProjectDataSpaceSummary }) {
  const title = space.title?.trim() || space.project_uid
  return (
    <div className="project-data-row">
      <div className="project-data-row__identity">
        <div className="project-data-row__title-line">
          <span className="project-data-row__title">{title}</span>
          <StatusBadge tone={space.status === 'archived' ? 'neutral' : 'success'}>{space.status}</StatusBadge>
        </div>
        <div className="project-data-row__uid">{space.project_uid}</div>
      </div>

      <dl className="project-data-row__stats">
        <div>
          <dt>Targets</dt>
          <dd>{space.decision_count}</dd>
        </div>
        <div>
          <dt>Candidates</dt>
          <dd>{space.candidate_count}</dd>
        </div>
        <div>
          <dt>Selections</dt>
          <dd>{space.selection_count}</dd>
        </div>
      </dl>

      <div className="project-data-row__scope">
        <span>{space.scope_kind === 'org' ? 'Org' : 'User'}</span>
        <span className="project-data-row__scope-id">{space.scope_id}</span>
      </div>

      <div className="project-data-row__time">
        <span>Updated</span>
        <strong>{formatDate(space.last_decision_at ?? space.updated_at)}</strong>
      </div>
    </div>
  )
}

export default function ProjectDataPage() {
  const currentOrgID = useUserStore((state) => state.currentOrgID)
  const currentUser = useUserStore((state) => state.currentUser)
  const [scopeKind, setScopeKind] = useState<ProjectDataScopeKind>('user')
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
  const totals = useMemo(() => spaces.reduce(
    (acc, item) => ({
      decisions: acc.decisions + item.decision_count,
      candidates: acc.candidates + item.candidate_count,
      selections: acc.selections + item.selection_count,
    }),
    { decisions: 0, candidates: 0, selections: 0 },
  ), [spaces])

  return (
    <ProjectListPageLayout contentClassName="projects-page project-data-page">
      <AppPageHeader
        icon={Database}
        title="Project Data"
        description="Backend candidate and selection metadata"
        actions={(
          <div className="project-data-page__actions">
            <ProjectDataScopeButton
              active={scopeKind === 'user'}
              icon={CircleUserRound}
              label="User"
              onClick={() => setScopeKind('user')}
            />
            <ProjectDataScopeButton
              active={scopeKind === 'org'}
              disabled={!currentOrgID}
              icon={Building2}
              label="Org"
              onClick={() => setScopeKind('org')}
            />
            <ProjectPageActionButton type="button" variant="outline" size="sm" onClick={() => void query.refetch()} className="gap-1.5">
              <RefreshCw size={14} />
              Refresh
            </ProjectPageActionButton>
          </div>
        )}
      />

      <section className="projects-region" aria-label="Project data spaces">
        <div className="projects-region__header">
          <div>
            <h2 className="projects-region__title">Data Spaces</h2>
            <p className="projects-region__description">
              {totals.decisions} targets · {totals.candidates} candidates · {totals.selections} selections
            </p>
          </div>
          <div className="projects-region__count">{spaces.length}</div>
        </div>

        {query.isLoading ? (
          <div className="projects-region__body">
            <p className="type-body text-muted-foreground">Loading</p>
          </div>
        ) : spaces.length === 0 ? (
          <div className="projects-region__body">
            <ProjectPageEmptyState
              icon={CheckCircle2}
              title="No project data"
            />
          </div>
        ) : (
          <div className="project-data-list">
            {spaces.map((space) => (
              <ProjectDataSpaceRow key={`${space.scope_kind}:${space.scope_id}:${space.project_uid}`} space={space} />
            ))}
          </div>
        )}
      </section>
    </ProjectListPageLayout>
  )
}
