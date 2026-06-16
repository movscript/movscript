import type { Dispatch, SetStateAction } from 'react'
import {
  GitBranch,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import {
  ProjectStandardsActionButton,
  ProjectStandardsAppSurface,
  ProjectStandardsBadge,
  ProjectStandardsBodyText,
  ProjectStandardsCheckboxField,
  ProjectStandardsDescription,
  ProjectStandardsField,
  ProjectStandardsFieldActions,
  ProjectStandardsFormGrid,
  ProjectStandardsIconButton,
  ProjectStandardsInput,
  ProjectStandardsMetric,
  ProjectStandardsMetricGrid,
  ProjectStandardsRuleActions,
  ProjectStandardsRuleCard,
  ProjectStandardsRuleCardHeader,
  ProjectStandardsRuleForm,
  ProjectStandardsRuleList,
  ProjectStandardsSection,
  ProjectStandardsSectionHeader,
  ProjectStandardsSelect,
  ProjectStandardsSelectContent,
  ProjectStandardsSelectItem,
  ProjectStandardsSelectTrigger,
  ProjectStandardsSelectValue,
  ProjectStandardsStatusBadge,
  ProjectStandardsSurfaceItem,
  ProjectStandardsTextarea,
  ProjectStandardsTinyText,
  ProjectStandardsTitle,
} from '@/features/project-standards/components/ProjectStandardsUi'
import {
  PROMPT_ROLE_LABELS,
  coreStandardText,
  type CoreStandardDef,
  type ProjectPromptRule,
  type ProjectPromptRuleForm,
  type PromptRole,
  type WorkspaceRecord,
} from '@/features/project-standards/application/projectStandardsModel'
import {
  projectStandardsEnabledRuleRecipe,
  projectStandardsReadyRecipe,
  projectStandardsRequiredRuleRecipe,
} from '@/features/project-standards/presentation/projectStandardsSemanticUi'
import type { StandardWorkbenchGroup } from '@/features/project-standards/presentation/projectStandardsBoardModel'

export { ProjectStandardsPromptPreviewAside } from '@/features/project-standards/components/ProjectStandardsPromptPreviewAside'

export function ProjectStandardsMetricsAndStatus({
  filledStandardCount,
  missingStandardLabels,
  visibleCustomRuleCount,
  enabledCustomRuleCount,
  styleReferenceCount,
  workspaceCount,
  statusSummary,
}: {
  filledStandardCount: number
  missingStandardLabels: string[]
  visibleCustomRuleCount: number
  enabledCustomRuleCount: number
  styleReferenceCount: number
  workspaceCount: number
  statusSummary: string
}) {
  return (
    <>
      <ProjectStandardsMetricGrid>
        <ProjectStandardsMetric label="核心规范" value={`${filledStandardCount}/8`} detail={missingStandardLabels.length > 0 ? `待补充 ${missingStandardLabels.length} 项` : '已覆盖'} tone={missingStandardLabels.length > 0 ? 'warning' : 'success'} compact />
        <ProjectStandardsMetric label="自定义规则" value={visibleCustomRuleCount} detail={`${enabledCustomRuleCount} 条启用`} compact />
        <ProjectStandardsMetric label="风格参考" value={styleReferenceCount} detail="参考图" tone={styleReferenceCount > 0 ? 'success' : 'neutral'} compact />
        <ProjectStandardsMetric label="待审草案" value={workspaceCount} detail="Agent artifact" tone={workspaceCount > 0 ? 'warning' : 'neutral'} compact />
      </ProjectStandardsMetricGrid>
      <ProjectStandardsAppSurface className="project-standards-status-strip">
        <ProjectStandardsTinyText className="text-foreground">{statusSummary}</ProjectStandardsTinyText>
        <ProjectStandardsStatusBadge {...projectStandardsReadyRecipe(missingStandardLabels.length === 0)}>
          {missingStandardLabels.length === 0 ? '核心已覆盖' : '待补核心'}
        </ProjectStandardsStatusBadge>
        <ProjectStandardsTinyText>
          {missingStandardLabels.length > 0 ? `待补充：${missingStandardLabels.join('、')}` : '核心规范已覆盖，预览会随编辑实时更新。'}
        </ProjectStandardsTinyText>
      </ProjectStandardsAppSurface>
    </>
  )
}

export function ProjectStandardsBoardHeader({
  isFetching,
  workspaceArtifactsFetching,
  workspaceCount,
  projectId,
  onRefreshAll,
  onOpenReviewDialog,
  onOpenNewRuleForm,
}: {
  isFetching: boolean
  workspaceArtifactsFetching: boolean
  workspaceCount: number
  projectId: number | undefined
  onRefreshAll: () => void
  onOpenReviewDialog: () => void
  onOpenNewRuleForm: () => void
}) {
  return (
    <ProjectStandardsSection className="project-standards-board-heading">
      <ProjectStandardsSectionHeader>
        <div className="min-w-0">
          <ProjectStandardsTitle>规范工作板</ProjectStandardsTitle>
          <ProjectStandardsDescription>按创作语境查看规范；点击卡片右上角即可编辑，启用的内容会进入右侧预览。</ProjectStandardsDescription>
        </div>
        <div className="project-standards-board-actions">
          <ProjectStandardsActionButton size="sm" variant="outline" className="type-label" onClick={onRefreshAll} loading={isFetching || workspaceArtifactsFetching}>
            刷新
          </ProjectStandardsActionButton>
          <ProjectStandardsActionButton size="sm" variant="outline" className="type-label" onClick={onOpenReviewDialog} disabled={!projectId}>
            <GitBranch size={12} />
            工作区{workspaceCount > 0 ? ` ${workspaceCount}` : ''}
          </ProjectStandardsActionButton>
          <ProjectStandardsActionButton size="sm" className="type-label" onClick={onOpenNewRuleForm}>
            <Plus size={12} />
            新增规范
          </ProjectStandardsActionButton>
        </div>
      </ProjectStandardsSectionHeader>
    </ProjectStandardsSection>
  )
}

export function ProjectStandardsRuleEditorForm({
  ruleForm,
  setRuleForm,
  savingRule,
  onSaveRuleForm,
}: {
  ruleForm: ProjectPromptRuleForm
  setRuleForm: Dispatch<SetStateAction<ProjectPromptRuleForm | null>>
  savingRule: boolean
  onSaveRuleForm: () => void | Promise<void>
}) {
  return (
    <ProjectStandardsRuleForm>
      <ProjectStandardsFormGrid>
        <ProjectStandardsField>
          名称
          <ProjectStandardsInput value={ruleForm.label} onChange={(event) => setRuleForm({ ...ruleForm, label: event.target.value })} className="h-8 type-label" placeholder="角色一致性" />
        </ProjectStandardsField>
        <ProjectStandardsField>
          Key
          <ProjectStandardsInput value={ruleForm.key} onChange={(event) => setRuleForm({ ...ruleForm, key: event.target.value })} className="h-8 font-mono type-label" placeholder="character_consistency" />
        </ProjectStandardsField>
        <ProjectStandardsField>
          分类
          <ProjectStandardsInput value={ruleForm.category} onChange={(event) => setRuleForm({ ...ruleForm, category: event.target.value })} className="h-8 type-label" placeholder="人物 / 审核 / 平台 / 制作" />
        </ProjectStandardsField>
        <ProjectStandardsField>
          提示词角色
          <ProjectStandardsSelect value={ruleForm.prompt_role} onValueChange={(value) => setRuleForm({ ...ruleForm, prompt_role: value as PromptRole })}>
            <ProjectStandardsSelectTrigger className="h-8 type-label"><ProjectStandardsSelectValue /></ProjectStandardsSelectTrigger>
            <ProjectStandardsSelectContent>
              {Object.entries(PROMPT_ROLE_LABELS).map(([value, label]) => <ProjectStandardsSelectItem key={value} value={value}>{label}</ProjectStandardsSelectItem>)}
            </ProjectStandardsSelectContent>
          </ProjectStandardsSelect>
        </ProjectStandardsField>
      </ProjectStandardsFormGrid>
      <ProjectStandardsField className="mt-2">
        规范内容
        <ProjectStandardsTextarea value={ruleForm.value} onChange={(event) => setRuleForm({ ...ruleForm, value: event.target.value })} className="min-h-24 type-label" placeholder="写清楚会进入提示词的项目级规则。" />
      </ProjectStandardsField>
      <ProjectStandardsFieldActions>
        <div className="flex flex-wrap gap-2 type-tiny text-muted-foreground">
          <ProjectStandardsCheckboxField
            controlSize="sm"
            variant="subtle"
            className="type-tiny"
            checked={ruleForm.enabled}
            onCheckedChange={(checked) => setRuleForm({ ...ruleForm, enabled: checked })}
          >
            启用
          </ProjectStandardsCheckboxField>
          <ProjectStandardsCheckboxField
            controlSize="sm"
            variant="subtle"
            className="type-tiny"
            checked={ruleForm.required}
            onCheckedChange={(checked) => setRuleForm({ ...ruleForm, required: checked })}
          >
            标记必选
          </ProjectStandardsCheckboxField>
        </div>
        <div className="flex gap-1.5">
          <ProjectStandardsActionButton size="sm" variant="outline" className="type-label" onClick={() => setRuleForm(null)}>取消</ProjectStandardsActionButton>
          <ProjectStandardsActionButton size="sm" className="type-label" loading={savingRule} onClick={onSaveRuleForm}>
            <Save size={12} />
            保存规范
          </ProjectStandardsActionButton>
        </div>
      </ProjectStandardsFieldActions>
    </ProjectStandardsRuleForm>
  )
}

export function ProjectStandardsStandardGroupSection({
  group,
  project,
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
}: {
  group: StandardWorkbenchGroup
  project: WorkspaceRecord | null
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
}) {
  return (
    <ProjectStandardsSection className="project-standards-standard-group">
      <ProjectStandardsSectionHeader>
        <div className="min-w-0">
          <ProjectStandardsTitle>{group.title}</ProjectStandardsTitle>
          <ProjectStandardsDescription>{group.description}</ProjectStandardsDescription>
        </div>
        <ProjectStandardsBadge variant="outline" className="type-tiny">{group.cards.length} 项</ProjectStandardsBadge>
      </ProjectStandardsSectionHeader>

      <ProjectStandardsRuleList className="project-standards-standard-list">
        {group.cards.map((card) => card.type === 'core' ? (
          <ProjectStandardsCoreCard
            key={card.def.key}
            def={card.def}
            project={project}
            editing={editingCoreKey === card.def.key}
            coreWorkspaceValue={coreWorkspaceValue}
            onCoreWorkspaceValueChange={onCoreWorkspaceValueChange}
            savingCoreKey={savingCoreKey}
            onOpenCoreEditor={onOpenCoreEditor}
            onCancelCoreEditor={onCancelCoreEditor}
            onSaveCoreStandard={onSaveCoreStandard}
          />
        ) : (
          <ProjectStandardsCustomRuleCard
            key={card.rule.id}
            rule={card.rule}
            deletingRuleId={deletingRuleId}
            onToggleRule={onToggleRule}
            onOpenEditRuleForm={onOpenEditRuleForm}
            onDeleteRule={onDeleteRule}
          />
        ))}
      </ProjectStandardsRuleList>
    </ProjectStandardsSection>
  )
}

function ProjectStandardsCoreCard({
  def,
  project,
  editing,
  coreWorkspaceValue,
  onCoreWorkspaceValueChange,
  savingCoreKey,
  onOpenCoreEditor,
  onCancelCoreEditor,
  onSaveCoreStandard,
}: {
  def: CoreStandardDef
  project: WorkspaceRecord | null
  editing: boolean
  coreWorkspaceValue: string
  onCoreWorkspaceValueChange: (value: string) => void
  savingCoreKey: string | null
  onOpenCoreEditor: (key: string) => void
  onCancelCoreEditor: () => void
  onSaveCoreStandard: (def: CoreStandardDef) => void | Promise<void>
}) {
  const value = coreStandardText(project, def.key)

  return (
    <ProjectStandardsSurfaceItem
      key={def.key}
      tone={value ? 'neutral' : 'warning'}
      className="project-standards-standard-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="type-label font-semibold text-foreground">{def.label}</p>
            <ProjectStandardsBadge variant="outline" className="h-5 px-1.5 type-tiny">{def.category}</ProjectStandardsBadge>
            {!value ? (
              <ProjectStandardsStatusBadge {...projectStandardsReadyRecipe(false)}>
                待补充
              </ProjectStandardsStatusBadge>
            ) : null}
          </div>
          <p className="mt-1 type-tiny leading-4 text-muted-foreground">{def.helper}</p>
        </div>
        <ProjectStandardsIconButton size="icon-sm" variant="ghost" onClick={() => editing ? onCancelCoreEditor() : onOpenCoreEditor(def.key)} title={editing ? '收起编辑' : '编辑规范'}>
          {editing ? <X size={14} /> : <Pencil size={14} />}
        </ProjectStandardsIconButton>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          {def.multiline ? (
            <ProjectStandardsTextarea value={coreWorkspaceValue} onChange={(event) => onCoreWorkspaceValueChange(event.target.value)} className="min-h-24 type-label" placeholder={def.helper} />
          ) : (
            <ProjectStandardsInput value={coreWorkspaceValue} onChange={(event) => onCoreWorkspaceValueChange(event.target.value)} className="h-8 type-label" placeholder={def.helper} />
          )}
          <div className="flex justify-end gap-1.5">
            <ProjectStandardsActionButton size="sm" variant="outline" className="type-label" onClick={onCancelCoreEditor}>取消</ProjectStandardsActionButton>
            <ProjectStandardsActionButton size="sm" className="type-label" loading={savingCoreKey === def.key} onClick={() => onSaveCoreStandard(def)}>
              <Save size={12} />
              保存
            </ProjectStandardsActionButton>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap type-label leading-5 text-foreground">{value || '点击编辑补充这条规范。'}</p>
      )}
    </ProjectStandardsSurfaceItem>
  )
}

function ProjectStandardsCustomRuleCard({
  rule,
  deletingRuleId,
  onToggleRule,
  onOpenEditRuleForm,
  onDeleteRule,
}: {
  rule: ProjectPromptRule
  deletingRuleId: string | null
  onToggleRule: (rule: ProjectPromptRule) => void | Promise<void>
  onOpenEditRuleForm: (rule: ProjectPromptRule) => void
  onDeleteRule: (rule: ProjectPromptRule) => void | Promise<void>
}) {
  return (
    <ProjectStandardsRuleCard disabled={!rule.enabled} className="project-standards-standard-card">
      <ProjectStandardsRuleCardHeader>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="type-label font-semibold text-foreground">{rule.label}</p>
            <ProjectStandardsBadge variant="outline" className="h-5 px-1.5 type-tiny">{rule.category}</ProjectStandardsBadge>
            <ProjectStandardsBadge className="h-5 px-1.5 type-tiny">{PROMPT_ROLE_LABELS[rule.prompt_role]}</ProjectStandardsBadge>
            <ProjectStandardsStatusBadge {...projectStandardsEnabledRuleRecipe(rule.enabled)}>
              {rule.enabled ? '已进入预览' : '未进入预览'}
            </ProjectStandardsStatusBadge>
            {rule.required ? (
              <ProjectStandardsStatusBadge {...projectStandardsRequiredRuleRecipe()}>
                必填
              </ProjectStandardsStatusBadge>
            ) : null}
          </div>
          <ProjectStandardsBodyText className="mt-2">{rule.value || '未填写'}</ProjectStandardsBodyText>
        </div>
        <ProjectStandardsRuleActions>
          <ProjectStandardsActionButton size="sm" variant="outline" className="px-2 type-tiny" onClick={() => onToggleRule(rule)}>{rule.enabled ? '停用' : '启用'}</ProjectStandardsActionButton>
          <ProjectStandardsIconButton size="icon-sm" variant="ghost" onClick={() => onOpenEditRuleForm(rule)} title="编辑规范"><Pencil size={14} /></ProjectStandardsIconButton>
          <ProjectStandardsIconButton size="icon-sm" variant="ghost" tone="danger" loading={deletingRuleId === rule.id} onClick={() => onDeleteRule(rule)} title="删除规范"><Trash2 size={14} /></ProjectStandardsIconButton>
        </ProjectStandardsRuleActions>
      </ProjectStandardsRuleCardHeader>
    </ProjectStandardsRuleCard>
  )
}
