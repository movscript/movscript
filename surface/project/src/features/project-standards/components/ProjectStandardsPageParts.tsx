import type { Dispatch, SetStateAction } from 'react'
import { Loader2 } from 'lucide-react'
import {
  ProjectStandardsColumn,
  ProjectStandardsContentLayout,
  ProjectStandardsEmptyState,
  ProjectStandardsLoadingState,
  ProjectStandardsSection,
  ProjectStandardsWorkspaceGrid,
} from './ProjectStandardsUi'
import {
  type CoreStandardDef,
  type ProjectPromptRule,
  type ProjectPromptRuleForm,
  type WorkspaceRecord,
} from '../application/projectStandardsModel'
import {
  ProjectStandardsBoardHeader,
  ProjectStandardsPromptPreviewAside,
  ProjectStandardsRuleEditorForm,
  ProjectStandardsStandardGroupSection,
} from './ProjectStandardsWorkspacePanels'
import type { StandardWorkbenchGroup } from '../presentation/projectStandardsBoardModel'
import type { RawResource } from '@movscript/shared'

export function ProjectStandardsLoadingView() {
  return (
    <ProjectStandardsLoadingState>
      <Loader2 size={16} className="animate-spin" />
      加载项目现状…
    </ProjectStandardsLoadingState>
  )
}

export function ProjectStandardsWorkspaceContent({
  visibleCustomRules,
  styleReferenceIds,
  standardGroups,
  project,
  ruleForm,
  setRuleForm,
  savingRule,
  onSaveRuleForm,
  isFetching,
  workspaceArtifactsFetching,
  onRefreshAll,
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
  visibleCustomRules: ProjectPromptRule[]
  styleReferenceIds: number[]
  standardGroups: StandardWorkbenchGroup[]
  project: WorkspaceRecord | null
  ruleForm: ProjectPromptRuleForm | null
  setRuleForm: Dispatch<SetStateAction<ProjectPromptRuleForm | null>>
  savingRule: boolean
  onSaveRuleForm: () => void | Promise<void>
  isFetching: boolean
  workspaceArtifactsFetching: boolean
  onRefreshAll: () => void
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
      <ProjectStandardsWorkspaceGrid>
        <ProjectStandardsColumn>
          <ProjectStandardsBoardHeader
            isFetching={isFetching}
            workspaceArtifactsFetching={workspaceArtifactsFetching}
            onRefreshAll={onRefreshAll}
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
