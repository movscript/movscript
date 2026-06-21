import {
  ProjectStandardsDialog,
  ProjectStandardsDialogBody,
  ProjectStandardsDialogContent,
  ProjectStandardsDialogTitle,
  ProjectStandardsMain,
} from '@/features/project-standards/components/ProjectStandardsUi'
import { WorkbenchProjectBody } from '@movscript/ui/business/workbench'
import {
  ProjectStandardsLoadingView,
  ProjectStandardsWorkspaceContent,
} from '@/features/project-standards/components/ProjectStandardsPageParts'
import { ProjectStandardsWorkspaceReviewPanel } from '@/features/project-standards/components/workspaces/ProjectStandardsWorkspaceReviewPanel'
import { useProjectStandardsController } from '@/features/project-standards/application/useProjectStandardsController'

export default function ProjectStandardsPage() {
  return (
    <div data-testid="project-workbench-shell" data-workbench-id="project_standards" className="ms-stack workbench-project-shell">
      <WorkbenchProjectBody padding="none" scroll="auto" tone="muted">
        <ProjectStandardsContent />
      </WorkbenchProjectBody>
    </div>
  )
}

export function ProjectStandardsContent() {
  const controller = useProjectStandardsController()

  return (
    <>
      <ProjectStandardsMain>
        {controller.isLoading ? (
          <ProjectStandardsLoadingView />
        ) : (
          <ProjectStandardsWorkspaceContent
            visibleCustomRules={controller.visibleCustomRules}
            styleReferenceIds={controller.styleReferenceIds}
            standardGroups={controller.standardGroups}
            project={controller.project}
            ruleForm={controller.ruleForm}
            setRuleForm={controller.setRuleForm}
            savingRule={controller.savingRule}
            onSaveRuleForm={controller.saveRuleForm}
            isFetching={controller.isFetching}
            workspaceArtifactsFetching={controller.workspaceArtifactsFetching}
            onRefreshAll={controller.refreshAll}
            projectId={controller.projectId}
            onOpenNewRuleForm={controller.openNewRuleForm}
            editingCoreKey={controller.editingCoreKey}
            coreWorkspaceValue={controller.coreWorkspaceValue}
            onCoreWorkspaceValueChange={controller.setCoreWorkspaceValue}
            savingCoreKey={controller.savingCoreKey}
            onOpenCoreEditor={controller.openCoreEditor}
            onCancelCoreEditor={() => controller.setEditingCoreKey(null)}
            onSaveCoreStandard={controller.saveCoreStandard}
            deletingRuleId={controller.deletingRuleId}
            onToggleRule={controller.toggleRule}
            onOpenEditRuleForm={controller.openEditRuleForm}
            onDeleteRule={controller.deleteRule}
            enabledRuleCount={controller.enabledRuleCount}
            promptPreview={controller.promptPreview}
            styleReferenceInputRef={controller.styleReferenceInputRef}
            uploadingStyleReferences={controller.uploadingStyleReferences}
            onUploadStyleReferenceImages={controller.uploadStyleReferenceImages}
            uploadedStyleReferencesById={controller.uploadedStyleReferencesById}
            deletingStyleReferenceId={controller.deletingStyleReferenceId}
            onRemoveStyleReferenceImage={controller.removeStyleReferenceImage}
            styleReferenceRule={controller.styleReferenceRule}
          />
        )}
      </ProjectStandardsMain>

      <ProjectStandardsDialog open={controller.reviewDialogOpen} onOpenChange={controller.handleReviewDialogOpenChange}>
        <ProjectStandardsDialogContent>
          <ProjectStandardsDialogTitle className="sr-only">项目规范审阅</ProjectStandardsDialogTitle>
          <ProjectStandardsDialogBody>
            <ProjectStandardsWorkspaceReviewPanel
              loading={controller.workspaceArtifactsLoading}
              workspaceCount={controller.workspaceCounts.workspace}
              workspaces={controller.reviewWorkspaceArtifacts}
              applyingWorkspaceId={controller.applyingWorkspaceId}
              onApplyWorkspace={(workspace) => { void controller.applyWorkspace(workspace) }}
            />
          </ProjectStandardsDialogBody>
        </ProjectStandardsDialogContent>
      </ProjectStandardsDialog>
    </>
  )
}
