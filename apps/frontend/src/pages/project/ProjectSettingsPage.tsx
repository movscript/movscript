import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Database, FolderOpen, GitBranch, Loader2, RefreshCw, Settings, UploadCloud } from 'lucide-react'
import { AppContentLayout, ProjectSurfaceHeader } from '@movscript/ui/layout'
import { Button, Input, Label, StatusBadge, Switch } from '@movscript/ui/primitives'
import { api } from '@/shared/infrastructure/api'
import { getAPIBaseURL } from '@/shared/infrastructure/config'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { workspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'
import { projectGitStatusQueryKey, runProjectGitWorkspaceAction, type ProjectGitWorkspaceAction } from '@/features/project/application/projectGitWorkspace'
import { ROUTES } from '@/routes/projectRoutes'
import { toast } from '@/shared/ui/toastStore'
import '@/features/project/components/ProjectPageUi.css'

type ProjectDataScopeKind = 'user' | 'org'

interface ProjectDataSpaceSummary {
  scope_kind: ProjectDataScopeKind
  scope_id: string
  project_uid: string
  title?: string
  status: string
  decision_count: number
  candidate_count: number
  selection_count: number
  updated_at: string
  last_decision_at?: string
}

interface ProjectWorkspaceMetadata {
  projectId: number
  provider: string
  owner: string
  repo: string
  defaultBranch: string
  gitRemoteUrl?: string
  gitRemoteStrategy?: string
  gitRemoteExpiresAt?: number
  status: string
  lastSyncError?: string
}

export default function ProjectSettingsPage() {
  const project = useProjectStore((state) => state.current)
  const currentUser = useUserStore((state) => state.currentUser)
  const currentOrgID = useUserStore((state) => state.currentOrgID)
  const orgMemberships = useUserStore((state) => state.orgMemberships)
  const [runningAction, setRunningAction] = useState<ProjectGitWorkspaceAction | null>(null)
  const [remoteURL, setRemoteURL] = useState('')
  const [remoteTouched, setRemoteTouched] = useState(false)
  const [remoteSaving, setRemoteSaving] = useState(false)
  const projectDir = project?.workspace_path ?? project?.project_path
  const projectUid = project?.project_uid
  const ownerContext = workspaceOwnerContext({ currentUser, currentOrgID, orgMemberships })
  const scopeKind: ProjectDataScopeKind = ownerContext.orgId !== undefined ? 'org' : 'user'
  const scopeId = ownerContext.orgId ?? ownerContext.userId

  const gitStatusQuery = useQuery({
    queryKey: projectGitStatusQueryKey(projectDir, project?.ID),
    queryFn: async () => {
      if (!projectDir) return undefined
      const result = await readElectronApi()?.getProjectGitWorkspaceStatus?.({
        projectDir,
        ...(project && project.ID > 0 ? { projectId: project.ID } : {}),
      })
      return result
    },
    enabled: Boolean(projectDir),
  })

  const projectDataQuery = useQuery({
    queryKey: ['project-settings-data-space', scopeKind, scopeId, projectUid],
    queryFn: async () => {
      const response = await api.get<{ items: ProjectDataSpaceSummary[] }>('/project-data/spaces', {
        params: { scope_kind: scopeKind },
      })
      return response.data.items.find((space) => space.project_uid === projectUid)
    },
    enabled: Boolean(projectUid && scopeId),
  })

  const projectWorkspaceQuery = useQuery({
    queryKey: ['project-settings-workspace-metadata', project?.ID],
    queryFn: async () => {
      const response = await api.get<ProjectWorkspaceMetadata>(`/projects/${project!.ID}/workspace`)
      return response.data
    },
    enabled: Boolean(project?.ID && project.ID > 0),
  })

  const gitStatus = gitStatusQuery.data
  const dataSpace = projectDataQuery.data
  const backendGitRemoteURL = resolveBackendGitRemoteURL(projectWorkspaceQuery.data?.gitRemoteUrl)
  const gitTone = gitStatus?.hasGit ? gitStatus.isDirty ? 'warning' : 'success' : 'neutral'
  const dataTone = dataSpace ? 'success' : projectUid ? 'warning' : 'neutral'

  useEffect(() => {
    if (remoteTouched) return
    if (gitStatus?.remoteURL) {
      setRemoteURL(gitStatus.remoteURL)
      return
    }
    if (backendGitRemoteURL) setRemoteURL(backendGitRemoteURL)
  }, [backendGitRemoteURL, gitStatus?.remoteURL, remoteTouched])

  async function runGitAction(action: ProjectGitWorkspaceAction, input?: { remoteURL?: string }) {
    if (!projectDir) {
      toast.error('项目 Git 不可用', '当前项目没有本地目录')
      return
    }
    setRunningAction(action)
    try {
      const result = await runProjectGitWorkspaceAction(action, {
        projectDir,
        ...(project && project.ID > 0 ? { projectId: project.ID } : {}),
        ...(input?.remoteURL ? { remoteURL: input.remoteURL } : {}),
      })
      if (!result) {
        toast.error('项目 Git 不可用')
        return
      }
      if (!result.ok) {
        toast.error(gitActionFailureLabel(action), result.error || result.stderr)
        return
      }
      toast.success(gitActionSuccessLabel(action), result.path)
      await gitStatusQuery.refetch()
    } catch (error) {
      toast.error(gitActionFailureLabel(action), error instanceof Error ? error.message : String(error))
    } finally {
      setRunningAction(null)
    }
  }

  async function saveRemoteURL() {
    const trimmed = remoteURL.trim()
    if (!trimmed) {
      toast.error('Git URL 不能为空')
      return
    }
    setRemoteSaving(true)
    try {
      await runGitAction('init', { remoteURL: trimmed })
      await gitStatusQuery.refetch()
    } finally {
      setRemoteSaving(false)
    }
  }

  const identityRows = useMemo(() => [
    { label: 'Project directory', value: projectDir ?? '未绑定' },
    { label: 'Project UID', value: projectUid ?? 'workspace.json 未声明 project_uid' },
    { label: 'Title', value: project?.name ?? '未命名项目' },
    { label: 'Backend scope', value: scopeId ? `${scopeKind}:${scopeId}` : '未登录' },
  ], [project?.name, projectDir, projectUid, scopeId, scopeKind])

  return (
    <AppContentLayout variant="contained" width="wide" contentClassName="project-settings-page py-5">
      <ProjectSurfaceHeader
        icon={Settings}
        title="Project Settings"
        description="管理当前目录项目的 Git 仓库和后端候选数据空间。"
      />

      <section className="project-settings-grid">
        <ProjectSettingsPanel
          icon={<FolderOpen size={16} />}
          title="Project Identity"
          status={<StatusBadge tone={projectDir && projectUid ? 'success' : 'warning'}>{projectDir && projectUid ? 'Ready' : 'Incomplete'}</StatusBadge>}
        >
          <div className="project-settings-kv">
            {identityRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </div>
        </ProjectSettingsPanel>

        <ProjectSettingsPanel
          icon={<GitBranch size={16} />}
          title="Git Repository"
          status={<StatusBadge tone={gitTone}>{gitStatus?.hasGit ? gitStatus.isDirty ? 'Dirty' : 'Clean' : 'Not initialized'}</StatusBadge>}
          actions={(
            <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => void gitStatusQuery.refetch()}>
              <RefreshCw size={14} />
              Refresh
            </Button>
          )}
        >
          <div className="project-settings-git-summary">
            <ProjectSettingsMetric label="Branch" value={gitStatus?.branch ?? '—'} />
            <ProjectSettingsMetric label="Changed files" value={gitStatus?.changedFiles ?? 0} />
            <ProjectSettingsMetric label="Remote" value={gitStatus?.remoteName ?? '未配置'} />
          </div>
          <div className="project-settings-git-toggle">
            <div className="min-w-0">
              <Label htmlFor="project-git-enabled">开启 Git 存储</Label>
              <p>开启后会在当前项目目录执行 git init，默认跟随后端 Git；也可以填入其他 Git 仓库。</p>
            </div>
            <Switch
              id="project-git-enabled"
              checked={Boolean(gitStatus?.hasGit)}
              disabled={!projectDir || runningAction !== null || Boolean(gitStatus?.hasGit)}
              onCheckedChange={(checked) => {
                if (!checked) return
                const initialRemoteURL = remoteURL.trim() || backendGitRemoteURL
                void runGitAction('init', initialRemoteURL ? { remoteURL: initialRemoteURL } : undefined)
              }}
            />
          </div>
          <div className="project-settings-remote-form">
            <div className="min-w-0 flex-1">
              <Label htmlFor="project-git-remote-url">Git URL</Label>
              <Input
                id="project-git-remote-url"
                value={remoteURL}
                placeholder={backendGitRemoteURL || 'https://example.com/owner/repo.git'}
                onChange={(event) => {
                  setRemoteTouched(true)
                  setRemoteURL(event.target.value)
                }}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={!projectDir || !remoteURL.trim() || runningAction !== null || remoteSaving}
              onClick={() => void saveRemoteURL()}
            >
              {remoteSaving ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
              Save Remote
            </Button>
          </div>
          <div className="project-settings-note">
            {gitStatus?.remoteURL ?? (backendGitRemoteURL
              ? `默认后端 Git：${backendGitRemoteURL}`
              : 'Push / Pull 需要先配置项目 Git remote。')}
          </div>
          <div className="project-settings-actions">
            <GitActionButton action="init" running={runningAction} onRun={runGitAction} />
            <GitActionButton action="commit" running={runningAction} onRun={runGitAction} />
            <GitActionButton action="pull" running={runningAction} onRun={runGitAction} />
            <GitActionButton action="push" running={runningAction} onRun={runGitAction} />
          </div>
        </ProjectSettingsPanel>

        <ProjectSettingsPanel
          icon={<Database size={16} />}
          title="Backend Data Space"
          status={<StatusBadge tone={dataTone}>{dataSpace ? 'Linked' : projectUid ? 'Empty' : 'Missing UID'}</StatusBadge>}
          actions={(
            <Button asChild type="button" size="sm" variant="outline" className="gap-2">
              <Link to={ROUTES.projectData}>
                <Database size={14} />
                Open
              </Link>
            </Button>
          )}
        >
          <div className="project-settings-git-summary">
            <ProjectSettingsMetric label="Targets" value={dataSpace?.decision_count ?? 0} />
            <ProjectSettingsMetric label="Candidates" value={dataSpace?.candidate_count ?? 0} />
            <ProjectSettingsMetric label="Selections" value={dataSpace?.selection_count ?? 0} />
          </div>
          <div className="project-settings-note">
            {dataSpace
              ? `后端按 ${dataSpace.scope_kind}:${dataSpace.scope_id} / ${dataSpace.project_uid} 保存候选和选择。`
              : projectUid
                ? '后端还没有这个 project_uid 的候选数据，首次生成候选后会自动出现。'
                : '请先初始化 workspace.json 的 project_uid，后端才能稳定识别候选数据空间。'}
          </div>
        </ProjectSettingsPanel>
      </section>
    </AppContentLayout>
  )
}

function ProjectSettingsPanel({
  icon,
  title,
  status,
  actions,
  children,
}: {
  icon: ReactNode
  title: string
  status: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="project-settings-panel">
      <div className="project-settings-panel__header">
        <div className="project-settings-panel__title">
          {icon}
          <h2>{title}</h2>
          {status}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

function ProjectSettingsMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="project-settings-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function GitActionButton({
  action,
  running,
  onRun,
}: {
  action: ProjectGitWorkspaceAction
  running: ProjectGitWorkspaceAction | null
  onRun: (action: ProjectGitWorkspaceAction) => Promise<void>
}) {
  const busy = running === action
  return (
    <Button
      type="button"
      size="sm"
      variant={action === 'push' ? undefined : 'outline'}
      className="gap-2"
      disabled={running !== null}
      onClick={() => void onRun(action)}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : action === 'push' ? <UploadCloud size={14} /> : <CheckCircle2 size={14} />}
      {gitActionLabel(action)}
    </Button>
  )
}

function gitActionLabel(action: ProjectGitWorkspaceAction) {
  if (action === 'init') return 'Init'
  if (action === 'commit') return 'Commit'
  if (action === 'pull') return 'Pull'
  if (action === 'push') return 'Push'
  return 'Status'
}

function gitActionSuccessLabel(action: ProjectGitWorkspaceAction) {
  if (action === 'init') return 'Git 仓库已初始化'
  if (action === 'commit') return '项目已提交'
  if (action === 'pull') return '项目已下载'
  if (action === 'push') return '项目已上传'
  return 'Git 状态已刷新'
}

function gitActionFailureLabel(action: ProjectGitWorkspaceAction) {
  if (action === 'init') return '初始化 Git 失败'
  if (action === 'commit') return '提交失败'
  if (action === 'pull') return '下载失败'
  if (action === 'push') return '上传失败'
  return '读取 Git 状态失败'
}

function resolveBackendGitRemoteURL(value: string | undefined): string | undefined {
  const remoteURL = value?.trim()
  if (!remoteURL) return undefined
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(remoteURL) || remoteURL.startsWith('file://')) return remoteURL
  if (!remoteURL.startsWith('/')) return remoteURL
  return `${getAPIBaseURL()}${remoteURL}`
}
