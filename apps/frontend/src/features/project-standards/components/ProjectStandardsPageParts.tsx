import type { Dispatch, SetStateAction } from 'react'
import { Loader2 } from 'lucide-react'
import {
  ProjectStandardsColumn,
  ProjectStandardsContentLayout,
  ProjectStandardsEmptyState,
  ProjectStandardsLoadingState,
  ProjectStandardsSection,
  ProjectStandardsWorkspaceGrid,
} from '@/features/project-standards/components/ProjectStandardsUi'
import {
  type CoreStandardDef,
  type ProjectPromptRule,
  type ProjectPromptRuleForm,
  type WorkspaceRecord,
} from '@/features/project-standards/application/projectStandardsModel'
import {
  ProjectStandardsBoardHeader,
  ProjectStandardsMetricsAndStatus,
  ProjectStandardsPromptPreviewAside,
  ProjectStandardsRuleEditorForm,
  ProjectStandardsStandardGroupSection,
} from '@/features/project-standards/components/ProjectStandardsWorkspacePanels'
import type { StandardWorkbenchGroup } from '@/features/project-standards/presentation/projectStandardsBoardModel'
import type { RawResource } from '@/types'

type WorkspaceCounts = {
  workspace: number
  applied: number
}

export function ProjectStandardsLoadingView() {
  return (
    <ProjectStandardsLoadingState>
      <Loader2 size={16} className="animate-spin" />
      加载项目现状…
    </ProjectStandardsLoadingState>
  )
}

export function ProjectStandardsWorkspaceContent({
  filledStandardCount,
  missingStandardLabels,
  visibleCustomRules,
  enabledCustomRules,
  styleReferenceIds,
  workspaceCounts,
  statusSummary,
  standardGroups,
  project,
  ruleForm,
  setRuleForm,
  savingRule,
  onSaveRuleForm,
  isFetching,
  workspaceArtifactsFetching,
  onRefreshAll,
  onOpenReviewDialog,
  projectId,
  onOpenNewRuleForm,
  editingCoreKey,
  coreWorkspaceValue,
  onCoreWorkspaceValueChange,
  savingCoreKey,
  onOpenCoreEditor,
  onCancelCoreEditor,
  onSaveCoreStandard,
  deletingRuleId,
  onToggleRule,
  onOpenEditRuleForm,
  onDeleteRule,
  enabledRuleCount,
  promptPreview,
  styleReferenceInputRef,
  uploadingStyleReferences,
  onUploadStyleReferenceImages,
  uploadedStyleReferencesById,
  deletingStyleReferenceId,
  onRemoveStyleReferenceImage,
  styleReferenceRule,
}: {
  filledStandardCount: number
  missingStandardLabels: string[]
  visibleCustomRules: ProjectPromptRule[]
  enabledCustomRules: ProjectPromptRule[]
  styleReferenceIds: number[]
  workspaceCounts: WorkspaceCounts
  statusSummary: string
  standardGroups: StandardWorkbenchGroup[]
  project: WorkspaceRecord | null
  ruleForm: ProjectPromptRuleForm | null
  setRuleForm: Dispatch<SetStateAction<ProjectPromptRuleForm | null>>
  savingRule: boolean
  onSaveRuleForm: () => void | Promise<void>
  isFetching: boolean
  workspaceArtifactsFetching: boolean
  onRefreshAll: () => void
  onOpenReviewDialog: () => void
  projectId: number | undefined
  onOpenNewRuleForm: () => void
  editingCoreKey: string | null
  coreWorkspaceValue: string
  onCoreWorkspaceValueChange: (value: string) => void
  savingCoreKey: string | null
  onOpenCoreEditor: (key: string) => void
  onCancelCoreEditor: () => void
  onSaveCoreStandard: (def: CoreStandardDef) => void | Promise<void>
  deletingRuleId: string | null
  onToggleRule: (rule: ProjectPromptRule) => void | Promise<void>
  onOpenEditRuleForm: (rule: ProjectPromptRule) => void
  onDeleteRule: (rule: ProjectPromptRule) => void | Promise<void>
  enabledRuleCount: number
  promptPreview: string
  styleReferenceInputRef: { current: HTMLInputElement | null }
  uploadingStyleReferences: boolean
  onUploadStyleReferenceImages: (files: FileList | null) => void | Promise<void>
  uploadedStyleReferencesById: Map<number, RawResource>
  deletingStyleReferenceId: number | null
  onRemoveStyleReferenceImage: (resourceId: number) => void | Promise<void>
  styleReferenceRule: ProjectPromptRule | undefined
}) {
  return (
    <ProjectStandardsContentLayout>
      <ProjectStandardsMetricsAndStatus
        filledStandardCount={filledStandardCount}
        missingStandardLabels={missingStandardLabels}
        visibleCustomRuleCount={visibleCustomRules.length}
        enabledCustomRuleCount={enabledCustomRules.length}
        styleReferenceCount={styleReferenceIds.length}
        workspaceCount={workspaceCounts.workspace}
        statusSummary={statusSummary}
      />

      <ProjectStandardsWorkspaceGrid>
        <ProjectStandardsColumn>
          <ProjectStandardsBoardHeader
            isFetching={isFetching}
            workspaceArtifactsFetching={workspaceArtifactsFetching}
            workspaceCount={workspaceCounts.workspace}
            projectId={projectId}
            onRefreshAll={onRefreshAll}
            onOpenReviewDialog={onOpenReviewDialog}
            onOpenNewRuleForm={onOpenNewRuleForm}
          />

          {ruleForm ? (
            <ProjectStandardsRuleEditorForm
              ruleForm={ruleForm}
              setRuleForm={setRuleForm}
              savingRule={savingRule}
              onSaveRuleForm={onSaveRuleForm}
            />
          ) : null}

          {standardGroups.map((group) => (
            <ProjectStandardsStandardGroupSection
              key={group.id}
              group={group}
              project={project}
              editingCoreKey={editingCoreKey}
              coreWorkspaceValue={coreWorkspaceValue}
              onCoreWorkspaceValueChange={onCoreWorkspaceValueChange}
              savingCoreKey={savingCoreKey}
              onOpenCoreEditor={onOpenCoreEditor}
              onCancelCoreEditor={onCancelCoreEditor}
              onSaveCoreStandard={onSaveCoreStandard}
              deletingRuleId={deletingRuleId}
              onToggleRule={onToggleRule}
              onOpenEditRuleForm={onOpenEditRuleForm}
              onDeleteRule={onDeleteRule}
            />
          ))}

          {visibleCustomRules.length === 0 ? (
            <ProjectStandardsSection className="project-standards-standard-group">
              <ProjectStandardsEmptyState compact title="暂无自定义规范" description="常见的平台禁忌、角色一致性和审核口径，可以从这里补充。" />
            </ProjectStandardsSection>
          ) : null}
        </ProjectStandardsColumn>

        <ProjectStandardsPromptPreviewAside
          enabledRuleCount={enabledRuleCount}
          promptPreview={promptPreview}
          styleReferenceInputRef={styleReferenceInputRef}
          uploadingStyleReferences={uploadingStyleReferences}
          onUploadStyleReferenceImages={onUploadStyleReferenceImages}
          projectId={projectId}
          styleReferenceIds={styleReferenceIds}
          uploadedStyleReferencesById={uploadedStyleReferencesById}
          deletingStyleReferenceId={deletingStyleReferenceId}
          onRemoveStyleReferenceImage={onRemoveStyleReferenceImage}
          styleReferenceRule={styleReferenceRule}
        />
      </ProjectStandardsWorkspaceGrid>
    </ProjectStandardsContentLayout>
  )
}
