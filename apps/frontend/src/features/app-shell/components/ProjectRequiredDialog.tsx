import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@movscript/ui/primitives'
import { useAppShellDialogStore } from '@/features/app-shell/application/appShellDialogStore'
import { invalidateProjectMutationResult, projectListChangedResult } from '@/features/project/application/projectMutationInvalidation'
import { initializeProjectGitWorkspace } from '@/features/project/application/projectGitWorkspace'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { openProjectWindow } from '@/shared/infrastructure/appWindowContext'
import { api } from '@/shared/infrastructure/api'
import { ROUTES } from '@/routes/projectRoutes'
import type { Project } from '@/types'
import i18n from '@/i18n'

export function ProjectRequiredDialog() {
  const queryClient = useQueryClient()
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)
  const projectDialogOpen = useAppShellDialogStore((s) => s.projectDialogOpen)
  const closeProjectDialog = useAppShellDialogStore((s) => s.closeProjectDialog)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const open = projectDialogOpen
  const createProject = useMutation({
    mutationFn: (input: { name: string; description: string }) => api.post('/projects', input).then((response) => response.data as Project),
    onSuccess: (project) => {
      invalidateProjectMutationResult(queryClient, projectListChangedResult({ orgId: currentOrgID, changedIds: [project.ID] }))
      void initializeProjectGitWorkspace(project, currentOrgID)
      selectProject(project)
      setProjectName('')
      setProjectDescription('')
    },
  })

  function selectProject(project: Project) {
    setCurrent(project)
    setWorkMode('project')
    closeProjectDialog()
    void openProjectWindow({ projectId: project.ID, project, route: ROUTES.project.home })
  }

  function submitProject() {
    const name = projectName.trim()
    if (!name || createProject.isPending) return
    createProject.mutate({ name, description: projectDescription.trim() })
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
        className="w-[560px] max-w-[92vw]"
      >
        <DialogHeader>
          <DialogTitle>{i18n.t('pages.projects.newProject')}</DialogTitle>
          <DialogDescription>
            {i18n.t('pages.projects.emptyHint')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
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
                  onChange={(event) => setProjectName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitProject()
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
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={closeProjectDialog}>{i18n.t('common.cancel')}</Button>
                <Button type="button" onClick={submitProject} disabled={!projectName.trim() || createProject.isPending}>
                  <Plus size={14} />
                  {i18n.t('pages.projects.createProject')}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
