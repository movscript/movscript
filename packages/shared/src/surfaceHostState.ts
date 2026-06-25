import type { AppSettings } from './appSettings.js'
import type { OrgMembership, Project, User } from './surfaceTypes.js'

export interface SurfaceWorkspaceOwnerContext {
  userId?: number
  orgId?: number
}

export interface SurfaceHostStateSnapshot {
  currentProject: Project | null
  currentUser: User | null
  currentOrgID: number | null
  orgMemberships: OrgMembership[]
  appSettings: Partial<AppSettings> | null
  localRecentProjects: Project[]
  workspaceRoot?: string | null
}

export interface SurfaceOpenProjectWindowInput {
  project?: Project | unknown
  projectDir?: string
  route?: string
}

export interface SurfaceHostStateActions {
  setCurrentProject?(project: Project | null): void
  setWorkMode?(workMode: NonNullable<AppSettings['workMode']>): void
  openProjectWindow?(input: SurfaceOpenProjectWindowInput): Promise<void>
  openAdminConsole?(baseURL?: string, path?: string): Promise<void>
  removeLocalProjectRecent?(projectDir: string): void
}

export interface SurfaceHostStateClient {
  getSnapshot(): SurfaceHostStateSnapshot
  subscribe(listener: () => void): () => void
  actions?: SurfaceHostStateActions
}

const emptySnapshot: SurfaceHostStateSnapshot = {
  currentProject: null,
  currentUser: null,
  currentOrgID: null,
  orgMemberships: [],
  appSettings: null,
  localRecentProjects: [],
  workspaceRoot: null,
}

let hostStateClient: SurfaceHostStateClient | undefined
let cachedSnapshot: SurfaceHostStateSnapshot | undefined

export function configureSurfaceHostStateClient(client: SurfaceHostStateClient): void {
  hostStateClient = client
  cachedSnapshot = undefined
}

export function getSurfaceHostStateSnapshot(): SurfaceHostStateSnapshot {
  if (!hostStateClient) return emptySnapshot
  const snapshot = hostStateClient.getSnapshot()
  if (cachedSnapshot && surfaceHostStateSnapshotsEqual(cachedSnapshot, snapshot)) {
    return cachedSnapshot
  }
  cachedSnapshot = snapshot
  return snapshot
}

export function subscribeSurfaceHostState(listener: () => void): () => void {
  return hostStateClient?.subscribe(listener) ?? (() => undefined)
}

export function setSurfaceCurrentProject(project: Project | null): void {
  const setCurrentProject = hostStateClient?.actions?.setCurrentProject
  if (!setCurrentProject) throw new Error('Surface host state cannot set the current project.')
  setCurrentProject(project)
}

export function setSurfaceWorkMode(workMode: NonNullable<AppSettings['workMode']>): void {
  const setWorkMode = hostStateClient?.actions?.setWorkMode
  if (!setWorkMode) throw new Error('Surface host state cannot set the work mode.')
  setWorkMode(workMode)
}

export async function openSurfaceProjectWindow(input: SurfaceOpenProjectWindowInput): Promise<void> {
  const openProjectWindow = hostStateClient?.actions?.openProjectWindow
  if (!openProjectWindow) throw new Error('Surface host state cannot open a project window.')
  await openProjectWindow(input)
}

export async function openSurfaceAdminConsole(baseURL?: string, path = ''): Promise<void> {
  const openAdminConsole = hostStateClient?.actions?.openAdminConsole
  if (!openAdminConsole) throw new Error('Surface host state cannot open the admin console.')
  await openAdminConsole(baseURL, path)
}

export function removeSurfaceLocalProjectRecent(projectDir: string): void {
  const removeLocalProjectRecent = hostStateClient?.actions?.removeLocalProjectRecent
  if (!removeLocalProjectRecent) throw new Error('Surface host state cannot remove a local project recent.')
  removeLocalProjectRecent(projectDir)
}

export function isSurfaceLocalProjectEntry(project: Project): boolean {
  return project.local === true
}

export function mergeSurfaceRecentProjects(
  primaryProjects: Project[],
  localProjects: Project[],
  dismissedKeys: string[] = [],
): Project[] {
  const dismissed = new Set(dismissedKeys)
  const merged = new Map<string, Project>()
  const positiveIds = new Set<number>()
  for (const project of [...localProjects, ...primaryProjects]) {
    const key = surfaceProjectKey(project)
    if (project.ID > 0 && positiveIds.has(project.ID)) continue
    if (!key || dismissed.has(key) || merged.has(key)) continue
    merged.set(key, project)
    if (project.ID > 0) positiveIds.add(project.ID)
  }
  return [...merged.values()].sort((left, right) => surfaceProjectTimestamp(right) - surfaceProjectTimestamp(left))
}

export function surfaceWorkspaceOwnerContext(input: {
  currentUser?: User | null
  currentOrgID?: number | null
  orgMemberships?: OrgMembership[]
}): SurfaceWorkspaceOwnerContext {
  const userId = input.currentUser?.ID
  if (userId === undefined) return {}
  const orgId = input.currentOrgID
  const currentMembership = input.orgMemberships?.find((membership) => membership.org_id === orgId)
  if (orgId !== undefined && orgId !== null && currentMembership?.is_personal === false) {
    return { orgId }
  }
  return { userId }
}

export function currentSurfaceWorkspaceOwnerContext(): SurfaceWorkspaceOwnerContext {
  const snapshot = getSurfaceHostStateSnapshot()
  return surfaceWorkspaceOwnerContext({
    currentUser: snapshot.currentUser,
    currentOrgID: snapshot.currentOrgID,
    orgMemberships: snapshot.orgMemberships,
  })
}

export function currentSurfaceWorkspaceProjectDir(): string | undefined {
  const snapshot = getSurfaceHostStateSnapshot()
  const projectDir = snapshot.workspaceRoot?.trim()
    || snapshot.currentProject?.workspace_path?.trim()
    || snapshot.currentProject?.project_path?.trim()
  if (projectDir) return projectDir
  if (typeof window === 'undefined') return undefined
  const params = new URLSearchParams(window.location.search)
  return params.get('projectDir') ?? params.get('projectPath') ?? undefined
}

function surfaceProjectKey(project: Project): string | undefined {
  const projectDir = project.workspace_path?.trim() || project.project_path?.trim()
  if (projectDir) return `path:${projectDir}`
  if (project.project_uid?.trim()) return `uid:${project.project_uid.trim()}`
  return project.ID > 0 ? `id:${project.ID}` : undefined
}

function surfaceProjectTimestamp(project: Project): number {
  return Date.parse(project.UpdatedAt || project.CreatedAt || '') || 0
}

function surfaceHostStateSnapshotsEqual(
  left: SurfaceHostStateSnapshot,
  right: SurfaceHostStateSnapshot,
): boolean {
  return left.currentProject === right.currentProject
    && left.currentUser === right.currentUser
    && left.currentOrgID === right.currentOrgID
    && left.orgMemberships === right.orgMemberships
    && left.appSettings === right.appSettings
    && left.localRecentProjects === right.localRecentProjects
    && left.workspaceRoot === right.workspaceRoot
}
