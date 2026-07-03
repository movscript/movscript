import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Clock3, FolderKanban, HardDrive, RefreshCw } from 'lucide-react'

import { projectSurfacePath } from '../../domain/projectRoutes.js'
import './ProjectPickerSurface.css'

export interface ProjectPickerProject {
  ID: number
  name: string
  description?: string
  project_uid?: string
  workspace_path?: string
  project_path?: string
  CreatedAt?: string
  UpdatedAt?: string
}

export interface ProjectPickerSurfaceProps {
  gatewayBaseURL?: string
  /** @deprecated Use gatewayBaseURL and let the surface append /api/v1. */
  apiV1BaseURL?: string
  projects?: ProjectPickerProject[]
  title?: string
  description?: string
  projectHref?: (project: ProjectPickerProject) => string
}

type ProjectPickerState =
  | { status: 'idle'; projects: ProjectPickerProject[]; error?: undefined }
  | { status: 'loading'; projects: ProjectPickerProject[]; error?: undefined }
  | { status: 'ready'; projects: ProjectPickerProject[]; error?: undefined }
  | { status: 'error'; projects: ProjectPickerProject[]; error: Error }

export function ProjectPickerSurface({
  gatewayBaseURL = defaultDaemonGatewayBaseURL(),
  apiV1BaseURL,
  projects: controlledProjects,
  title = '项目首页',
  description = '从这里进入具体项目的创作进展、素材、审片与生成工作台。',
  projectHref = defaultProjectHref,
}: ProjectPickerSurfaceProps) {
  const [state, setState] = useState<ProjectPickerState>({
    status: controlledProjects ? 'ready' : 'idle',
    projects: controlledProjects ?? [],
  })

  const canFetch = !controlledProjects
  const projectsAPIBaseURL = projectPickerProjectsAPIBaseURL({ gatewayBaseURL, apiV1BaseURL })
  const loadProjects = useCallback(() => {
    if (!canFetch) return
    let cancelled = false
    setState((current) => ({ status: 'loading', projects: current.projects }))
    fetch(`${projectsAPIBaseURL}/projects`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          const message = readString(readRecord(payload).message ?? readRecord(payload).error)
            ?? `Project list failed with HTTP ${response.status}.`
          throw new Error(message)
        }
        return readListPayload<ProjectPickerProject>(payload, ['projects', 'items', 'records', 'data'])
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
  }, [canFetch, projectsAPIBaseURL])

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
    <section className="project-picker-surface">
      <div className="project-picker-surface__hero">
        <span className="project-picker-surface__eyebrow">Project Surface</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <div className="project-picker-surface__toolbar">
        <span className="project-picker-surface__status">
          {statusLabel(state.status, sortedProjects.length)}
        </span>
        {canFetch ? (
          <button className="project-picker-surface__refresh" type="button" onClick={() => loadProjects()} disabled={state.status === 'loading'}>
            <RefreshCw size={14} />
            刷新
          </button>
        ) : null}
      </div>

      {state.status === 'error' ? (
        <div className="project-picker-surface__error">{state.error.message}</div>
      ) : sortedProjects.length === 0 && state.status !== 'loading' ? (
        <div className="project-picker-surface__empty">还没有项目。</div>
      ) : (
        <div className="project-picker-surface__grid">
          {sortedProjects.map((project) => (
            <ProjectCard key={project.ID} project={project} href={projectHref(project)} />
          ))}
        </div>
      )}
    </section>
  )
}

function ProjectCard({ project, href }: { project: ProjectPickerProject; href: string }) {
  const projectPath = projectPathFromProject(project)
  return (
    <a className="project-picker-project-card" href={href}>
      <div className="project-picker-project-card__head">
        <span className="project-picker-project-card__icon"><FolderKanban size={18} /></span>
        <span className="project-picker-project-card__title">
          <strong>{project.name || `Project ${project.ID}`}</strong>
          <small>{project.project_uid ?? `project_${project.ID}`}</small>
        </span>
      </div>
      <div className="project-picker-project-card__body">
        {project.description ? <p className="project-picker-project-card__description">{project.description}</p> : null}
        {projectPath ? (
          <span className="project-picker-project-card__path">
            <HardDrive size={13} />
            <span>{projectPath}</span>
          </span>
        ) : null}
      </div>
      <div className="project-picker-project-card__footer">
        <span className="project-picker-project-card__meta">
          <Clock3 size={12} /> {formatDate(project.UpdatedAt ?? project.CreatedAt)}
        </span>
        <span className="project-picker-project-card__open">
          打开 <ArrowRight size={14} />
        </span>
      </div>
    </a>
  )
}

export function projectPathFromProject(project: ProjectPickerProject): string | undefined {
  const explicit = project.workspace_path?.trim() || project.project_path?.trim()
  if (explicit) return explicit
  const description = project.description?.trim()
  if (description?.startsWith('/')) return description
  return undefined
}

function defaultProjectHref(project: ProjectPickerProject): string {
  return projectSurfacePath('overview', project.ID)
}

function projectPickerProjectsAPIBaseURL({
  gatewayBaseURL,
  apiV1BaseURL,
}: {
  gatewayBaseURL?: string
  apiV1BaseURL?: string
}): string {
  const legacyBaseURL = apiV1BaseURL?.trim()
  if (legacyBaseURL) return trimTrailingSlash(legacyBaseURL)
  const gateway = trimTrailingSlash(gatewayBaseURL || defaultDaemonGatewayBaseURL())
  if (!gateway) return '/api/v1'
  return gateway.endsWith('/api/v1') ? gateway : `${gateway}/api/v1`
}

function defaultDaemonGatewayBaseURL(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
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

function statusLabel(status: ProjectPickerState['status'], count: number): string {
  if (status === 'loading') return '正在读取项目...'
  if (status === 'error') return '项目读取失败'
  return `${count} 个项目`
}
