import {
  ProjectStandardsDialog,
  ProjectStandardsDialogBody,
  ProjectStandardsDialogContent,
  ProjectStandardsDialogTitle,
  ProjectStandardsMain,
} from '@/features/project-standards/components/ProjectStandardsUi'
import { WorkbenchProjectBody, WorkbenchProjectShell } from '@movscript/ui/business/workbench'
import {
  ProjectStandardsLoadingView,
  ProjectStandardsWorkspaceContent,
} from '@/features/project-standards/components/ProjectStandardsPageParts'
import { ProjectStandardsWorkspaceReviewPanel } from '@/features/project-standards/components/workspaces/ProjectStandardsWorkspaceReviewPanel'
import { useProjectEntryShellProps } from '@/features/project/application/useProjectEntryShellProps'
import { useProjectStandardsController } from '@/features/project-standards/application/useProjectStandardsController'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'

export default function ProjectStandardsPage() {
  const project = useProjectStore((s) => s.current)
  const entryShellProps = useProjectEntryShellProps({
    projectEntryId: 'project_standards',
    projectName: project?.name,
    kicker: '项目规范',
    title: '项目规范',
    description: '集中查看和调整项目会遵守的制作规范，并预览最终注入模型的提示词与风格参考。',
  })

  return (
    <WorkbenchProjectShell {...entryShellProps}>
      <WorkbenchProjectBody padding="none" scroll="auto" tone="muted">
        <ProjectStandardsContent />
      </WorkbenchProjectBody>
    </WorkbenchProjectShell>
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
            filledStandardCount={controller.filledStandardCount}
            missingStandardLabels={controller.missingStandardLabels}
            visibleCustomRules={controller.visibleCustomRules}
            enabledCustomRules={controller.enabledCustomRules}
            styleReferenceIds={controller.styleReferenceIds}
            workspaceCounts={controller.workspaceCounts}
            statusSummary={controller.statusSummary}
            standardGroups={controller.standardGroups}
            project={controller.project}
            ruleForm={controller.ruleForm}
            setRuleForm={controller.setRuleForm}
            savingRule={controller.savingRule}
            onSaveRuleForm={controller.saveRuleForm}
            isFetching={controller.isFetching}
            workspaceArtifactsFetching={controller.workspaceArtifactsFetching}
            onRefreshAll={controller.refreshAll}
            onOpenReviewDialog={() => controller.setReviewDialogOpen(true)}
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
