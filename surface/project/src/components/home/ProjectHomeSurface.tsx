import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Clock3, FolderKanban, HardDrive, RefreshCw } from 'lucide-react'

import './ProjectHomeSurface.css'

export interface ProjectHomeProject {
  ID: number
  name: string
  description?: string
  project_uid?: string
  workspace_path?: string
  project_path?: string
  CreatedAt?: string
  UpdatedAt?: string
}

export interface ProjectHomeSurfaceProps {
  apiV1BaseURL?: string
  projects?: ProjectHomeProject[]
  title?: string
  description?: string
  projectHref?: (project: ProjectHomeProject) => string
}

type ProjectHomeState =
  | { status: 'idle'; projects: ProjectHomeProject[]; error?: undefined }
  | { status: 'loading'; projects: ProjectHomeProject[]; error?: undefined }
  | { status: 'ready'; projects: ProjectHomeProject[]; error?: undefined }
  | { status: 'error'; projects: ProjectHomeProject[]; error: Error }

export function ProjectHomeSurface({
  apiV1BaseURL = defaultAPIBaseURL(),
  projects: controlledProjects,
  title = '项目首页',
  description = '从这里进入具体项目的创作进展、素材、审片与生成工作台。',
  projectHref = defaultProjectHref,
}: ProjectHomeSurfaceProps) {
  const [state, setState] = useState<ProjectHomeState>({
    status: controlledProjects ? 'ready' : 'idle',
    projects: controlledProjects ?? [],
  })

  const canFetch = !controlledProjects
  const loadProjects = useCallback(() => {
    if (!canFetch) return
    let cancelled = false
    setState((current) => ({ status: 'loading', projects: current.projects }))
    fetch(`${trimTrailingSlash(apiV1BaseURL)}/projects`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          const message = readString(readRecord(payload).message ?? readRecord(payload).error)
            ?? `Project list failed with HTTP ${response.status}.`
          throw new Error(message)
        }
        return readListPayload<ProjectHomeProject>(payload, ['projects', 'items', 'records', 'data'])
      })
      .then((items) => {
        if (!cancelled) setState({ status: 'ready', projects: items })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState((current) => ({
            status: 'error',
            projects: current.projects,
            error: error instanceof Error ? error : new Error(String(error)),
          }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [apiV1BaseURL, canFetch])

  useEffect(() => {
    if (controlledProjects) {
      setState({ status: 'ready', projects: controlledProjects })
      return
    }
    return loadProjects()
  }, [controlledProjects, loadProjects])

  const sortedProjects = useMemo(() => {
    return [...state.projects].sort((left, right) => timestamp(right.UpdatedAt) - timestamp(left.UpdatedAt))
  }, [state.projects])

  return (
    <section className="project-home-surface">
      <div className="project-home-surface__hero">
        <span className="project-home-surface__eyebrow">Project Surface</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <div className="project-home-surface__toolbar">
        <span className="project-home-surface__status">
          {statusLabel(state.status, sortedProjects.length)}
        </span>
        {canFetch ? (
          <button className="project-home-surface__refresh" type="button" onClick={() => loadProjects()} disabled={state.status === 'loading'}>
            <RefreshCw size={14} />
            刷新
          </button>
        ) : null}
      </div>

      {state.status === 'error' ? (
        <div className="project-home-surface__error">{state.error.message}</div>
      ) : sortedProjects.length === 0 && state.status !== 'loading' ? (
        <div className="project-home-surface__empty">还没有项目。</div>
      ) : (
        <div className="project-home-surface__grid">
          {sortedProjects.map((project) => (
            <ProjectCard key={project.ID} project={project} href={projectHref(project)} />
          ))}
        </div>
      )}
    </section>
  )
}

function ProjectCard({ project, href }: { project: ProjectHomeProject; href: string }) {
  const projectPath = projectPathFromProject(project)
  return (
    <a className="project-home-project-card" href={href}>
      <div className="project-home-project-card__head">
        <span className="project-home-project-card__icon"><FolderKanban size={18} /></span>
        <span className="project-home-project-card__title">
          <strong>{project.name || `Project ${project.ID}`}</strong>
          <small>{project.project_uid ?? `project_${project.ID}`}</small>
        </span>
      </div>
      <div className="project-home-project-card__body">
        {project.description ? <p className="project-home-project-card__description">{project.description}</p> : null}
        {projectPath ? (
          <span className="project-home-project-card__path">
            <HardDrive size={13} />
            <span>{projectPath}</span>
          </span>
        ) : null}
      </div>
      <div className="project-home-project-card__footer">
        <span className="project-home-project-card__meta">
          <Clock3 size={12} /> {formatDate(project.UpdatedAt ?? project.CreatedAt)}
        </span>
        <span className="project-home-project-card__open">
          打开 <ArrowRight size={14} />
        </span>
      </div>
    </a>
  )
}

export function projectPathFromProject(project: ProjectHomeProject): string | undefined {
  const explicit = project.workspace_path?.trim() || project.project_path?.trim()
  if (explicit) return explicit
  const description = project.description?.trim()
  if (description?.startsWith('/')) return description
  return undefined
}

function defaultProjectHref(project: ProjectHomeProject): string {
  return `/studio/${encodeURIComponent(String(project.ID))}`
}

function defaultAPIBaseURL(): string {
  if (typeof window === 'undefined') return '/local-api/data/api/v1'
  return `${window.location.origin}/local-api/data/api/v1`
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function readListPayload<T>(raw: unknown, keys: string[]): T[] {
  if (Array.isArray(raw)) return raw as T[]
  const record = readRecord(raw)
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) return value as T[]
  }
  return []
}

function readRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function timestamp(value: string | undefined): number {
  return value ? Date.parse(value) || 0 : 0
}

function formatDate(value: string | undefined): string {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未记录'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function statusLabel(status: ProjectHomeState['status'], count: number): string {
  if (status === 'loading') return '正在读取项目...'
  if (status === 'error') return '项目读取失败'
  return `${count} 个项目`
}
