import { useState } from 'react'
import { FolderOpen, Plus } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@movscript/ui/primitives'
import { useAppShellDialogStore } from '@/features/app-shell/application/appShellDialogStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { openProjectWindow } from '@/shared/infrastructure/appWindowContext'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { workspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'
import {
  backendProjectWithLocalPath,
  bindLocalProjectToBackend,
  ensureBackendProjectForLocalProject,
  ensureProjectDataSpaceForLocalProject,
  resolveBackendProjectByUID,
  type LocalProjectScope,
} from '@/features/project/application/localProjectLifecycle'
import { ROUTES } from '@/routes/projectRoutes'
import type { Project } from '@/types'
import i18n from '@/i18n'

export function ProjectRequiredDialog() {
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)
  const currentUser = useUserStore((s) => s.currentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const orgMemberships = useUserStore((s) => s.orgMemberships)
  const projectDialogOpen = useAppShellDialogStore((s) => s.projectDialogOpen)
  const projectDialogMode = useAppShellDialogStore((s) => s.projectDialogMode)
  const closeProjectDialog = useAppShellDialogStore((s) => s.closeProjectDialog)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [projectDir, setProjectDir] = useState('')
  const [openProjectDir, setOpenProjectDir] = useState('')
  const [error, setError] = useState<string>()
  const [createImpacts, setCreateImpacts] = useState<string[]>([])
  const [openWarning, setOpenWarning] = useState<string>()
  const [isCreating, setIsCreating] = useState(false)
  const [isOpening, setIsOpening] = useState(false)
  const open = projectDialogOpen

  function selectProject(project: Project) {
    const projectDir = project.workspace_path || project.project_path
    setCurrent(project)
    setWorkMode('project')
    closeProjectDialog()
    if (projectDir) void openProjectWindow({ projectDir, project, route: ROUTES.project.home })
  }

  async function pickProjectDir() {
    const selected = await readElectronApi()?.openDirectory?.()
    if (selected) setProjectDir(selected)
  }

  async function pickOpenProjectDir() {
    const selected = await readElectronApi()?.openDirectory?.()
    if (selected) setOpenProjectDir(selected)
  }

  function currentLocalProjectScope(): LocalProjectScope {
    const owner = workspaceOwnerContext({ currentUser, currentOrgID, orgMemberships })
    if (owner.orgId !== undefined) return { scopeKind: 'org', scopeId: String(owner.orgId) }
    if (owner.userId !== undefined) return { scopeKind: 'user', scopeId: String(owner.userId) }
    throw new Error('当前用户不可用，无法绑定后端项目')
  }

  async function submitProject(force = false) {
    const name = projectName.trim()
    const dir = projectDir.trim()
    if (!name || !dir || isCreating) return
    const electronApi = readElectronApi()
    if (!electronApi?.createLocalMovScriptProject || !electronApi.inspectLocalMovScriptProject) {
      setError(i18n.t('pages.projects.localProjectUnavailable', '当前环境不支持本地项目路径'))
      return
    }
    try {
      setIsCreating(true)
      setError(undefined)
      setCreateImpacts([])
      const inspection = await electronApi.inspectLocalMovScriptProject({ projectDir: dir })
      if (!force && !inspection.canCreateClean) {
        setCreateImpacts(inspection.impacts.length > 0 ? inspection.impacts : ['目录中已有文件，强制创建可能覆盖 MovScript 项目身份文件'])
        setError('该目录不是空的 MovScript 初始化目标，请确认影响后再强制创建。')
        return
      }
      const result = await electronApi.createLocalMovScriptProject({
        projectDir: dir,
        title: name,
        description: projectDescription.trim(),
        overwrite: force,
      })
      const ensured = await ensureBackendProjectForLocalProject(result)
      const scope = currentLocalProjectScope()
      await ensureProjectDataSpaceForLocalProject(result, scope)
      const bound = await bindLocalProjectToBackend(result, ensured.project, scope)
      selectProject(backendProjectWithLocalPath(ensured.project, bound))
      setProjectName('')
      setProjectDescription('')
      setProjectDir('')
      setCreateImpacts([])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsCreating(false)
    }
  }

  async function submitOpenProject(force = false) {
    const dir = openProjectDir.trim()
    if (!dir || isOpening) return
    const electronApi = readElectronApi()
    if (!electronApi?.openLocalMovScriptProject || !electronApi.inspectLocalMovScriptProject) {
      setError(i18n.t('pages.projects.localProjectUnavailable', '当前环境不支持本地项目路径'))
      return
    }
    try {
      setIsOpening(true)
      setError(undefined)
      setOpenWarning(undefined)
      const inspection = await electronApi.inspectLocalMovScriptProject({ projectDir: dir })
      if (!inspection.canOpen || !inspection.projectUid) {
        setError('该目录不是可打开的 MovScript 项目：缺少 workspace.json/project_uid。')
        return
      }
      const local = await electronApi.openLocalMovScriptProject({ projectDir: dir })
      const resolved = await resolveBackendProjectByUID(inspection.projectUid)
      if (!resolved && !force) {
        setOpenWarning('后端没有找到这个 project_uid。强制打开会在当前后端空间创建对应项目记录，并写入本机绑定配置。')
        return
      }
      const backendProject = resolved ?? (await ensureBackendProjectForLocalProject(local)).project
      const scope = currentLocalProjectScope()
      await ensureProjectDataSpaceForLocalProject(local, scope)
      const bound = await bindLocalProjectToBackend(local, backendProject, scope)
      selectProject(backendProjectWithLocalPath(backendProject, bound))
      setOpenProjectDir('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsOpening(false)
    }
  }

  if (!open) return null

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (nextOpen) return
        closeProjectDialog()
      }}
    >
      <DialogContent
        closeLabel={i18n.t('common.close')}
        className="w-[480px] max-w-[92vw]"
      >
        <DialogHeader>
          <DialogTitle>{projectDialogMode === 'create' ? i18n.t('pages.projects.newProject') : '打开项目'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {projectDialogMode === 'create' ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2 type-label font-medium text-foreground">
              <Plus size={14} />
              {i18n.t('pages.projects.newProject')}
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="required-project-name">{i18n.t('pages.projects.nameRequired')}</Label>
                <Input
                  id="required-project-name"
                  value={projectName}
                  onChange={(event) => {
                    setProjectName(event.target.value)
                    setCreateImpacts([])
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submitProject()
                  }}
                  placeholder={i18n.t('pages.projects.namePlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="required-project-description">{i18n.t('pages.projects.descriptionOptional')}</Label>
                <Textarea
                  id="required-project-description"
                  value={projectDescription}
                  onChange={(event) => setProjectDescription(event.target.value)}
                  rows={3}
                  placeholder={i18n.t('pages.projects.descriptionPlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="required-project-path">{i18n.t('pages.projects.projectPath', '项目路径')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="required-project-path"
                    value={projectDir}
                    onChange={(event) => {
                      setProjectDir(event.target.value)
                      setCreateImpacts([])
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void submitProject()
                    }}
                    placeholder={i18n.t('pages.projects.projectPathPlaceholder', '选择或输入一个本地项目目录')}
                  />
                  <Button type="button" variant="outline" onClick={() => void pickProjectDir()} aria-label={i18n.t('common.choose', '选择')}>
                    <FolderOpen size={14} />
                  </Button>
                </div>
              </div>
              {error ? (
                <div className="type-caption text-destructive">{error}</div>
              ) : null}
              {createImpacts.length > 0 ? (
                <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 type-caption text-destructive">
                  {createImpacts.map((impact) => <div key={impact}>{impact}</div>)}
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={closeProjectDialog}>{i18n.t('common.cancel')}</Button>
                {createImpacts.length > 0 ? (
                  <Button type="button" variant="outline" onClick={() => void submitProject(true)} disabled={!projectName.trim() || !projectDir.trim() || isCreating}>
                    强制创建并绑定
                  </Button>
                ) : null}
                <Button type="button" onClick={() => void submitProject()} disabled={!projectName.trim() || !projectDir.trim() || isCreating}>
                  <Plus size={14} />
                  {i18n.t('pages.projects.createProject')}
                </Button>
              </div>
            </div>
          </section>
          ) : null}

          {projectDialogMode === 'open' ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2 type-label font-medium text-foreground">
              <FolderOpen size={14} />
              打开已有项目
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="required-open-project-path">项目路径</Label>
                <div className="flex gap-2">
                  <Input
                    id="required-open-project-path"
                    value={openProjectDir}
                    onChange={(event) => {
                      setOpenProjectDir(event.target.value)
                      setOpenWarning(undefined)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void submitOpenProject()
                    }}
                    placeholder="选择或输入已有 MovScript 项目目录"
                  />
                  <Button type="button" variant="outline" onClick={() => void pickOpenProjectDir()} aria-label={i18n.t('common.choose', '选择')}>
                    <FolderOpen size={14} />
                  </Button>
                </div>
              </div>
              {openWarning ? (
                <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 type-caption text-foreground">
                  {openWarning}
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                {openWarning ? (
                  <Button type="button" variant="outline" onClick={() => void submitOpenProject(true)} disabled={!openProjectDir.trim() || isOpening}>
                    注册到后端并打开
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={() => void submitOpenProject()} disabled={!openProjectDir.trim() || isOpening}>
                  <FolderOpen size={14} />
                  打开项目
                </Button>
              </div>
            </div>
          </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
