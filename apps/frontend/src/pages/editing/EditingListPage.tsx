import { Plus, Scissors } from 'lucide-react'
import { ProjectSurfaceHeader } from '@movscript/ui/layout'
import { Button } from '@movscript/ui/primitives'

import { useEditingListController } from '@/features/editing/application/useEditingListController'
import {
  EditingCreateProjectDialog,
  EditingListEmptyState,
  EditingListError,
  EditingProjectGrid,
} from '@/features/editing/components/EditingListPageParts'

export default function EditingListPage() {
  const controller = useEditingListController()

  return (
    <div className="space-y-5 py-5">
      <ProjectSurfaceHeader
        icon={Scissors}
        title="剪辑"
        actions={(
          <Button type="button" className="gap-2" onClick={controller.openCreateDialog}>
            <Plus size={14} />
            新建剪辑
          </Button>
        )}
      />

      {controller.state.status === 'error' ? (
        <EditingListError message={controller.state.message} />
      ) : null}

      {controller.projects.length === 0 ? (
        <EditingListEmptyState onCreate={controller.openCreateDialog} />
      ) : (
        <EditingProjectGrid
          projects={controller.projects}
          renamingProjectId={controller.renamingProjectId}
          renameTitle={controller.renameTitle}
          onCancelRename={controller.cancelRenameProject}
          onCommitRename={(project) => void controller.commitRenameProject(project)}
          onDelete={(project) => void controller.deleteProject(project)}
          onOpen={(project) => void controller.openEditingProject(project.id, project.title)}
          onRenameTitleChange={controller.setRenameTitle}
          onStartRename={controller.startRenameProject}
        />
      )}

      <EditingCreateProjectDialog
        canvasPresetId={controller.canvasPresetId}
        onCanvasPresetChange={controller.setCanvasPresetId}
        onCreate={() => void controller.createAndOpenProject()}
        onOpenChange={controller.handleCreateDialogOpenChange}
        onProjectTitleChange={controller.setProjectTitle}
        open={controller.showCreateDialog}
        projectTitle={controller.projectTitle}
        state={controller.state}
      />
    </div>
  )
}
