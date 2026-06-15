import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  FileText,
  GitBranch,
  PanelRightClose,
  Pencil,
  Plus,
  ScrollText,
  X,
} from 'lucide-react'
import type { Script } from '@/types'
import type { ScriptVersion } from '@/shared/infrastructure/api/scriptVersions'
import { Badge, Button, StatusBadge } from '@movscript/ui/primitives'
import {
  ScriptLibraryEmptyState,
  ScriptLibraryGroup,
  ScriptLibraryItem,
  ScriptLibraryRail,
  ScriptVersionCard,
} from '@movscript/ui/business/scripts'
import {
  ScriptAgentAssistPanel,
  ScriptBlockCard,
  ScriptBlockGrid,
  ScriptBlockSelectField,
  ScriptCollaborationStack,
  ScriptEditorFieldLabel,
  ScriptEditorInput,
  ScriptMetricBox,
  ScriptProductionNotice,
  ScriptProductionPanel,
  ScriptReadinessPanel,
  ScriptReadinessRow,
  ScriptVersionEmptyState,
  ScriptVersionBlockShell,
  ScriptVersionHistoryPanel,
  ScriptVersionLineEditor,
  ScriptWorkflowPanel,
  ScriptWorkflowStep,
  ScriptWorkspaceStat,
} from '@/features/scripts/components/ScriptsPageUi'
import {
  categoryLabel,
  formatDate,
  scriptEditorLines,
  scriptLibraryItemMeta,
  scriptVersionSourceText,
} from '@/features/scripts/presentation/scriptDisplayModel'
import {
  scriptLibraryStatusRecipe,
  scriptReadinessItemRecipe,
  scriptReadinessRecipe,
  scriptStageRecipe,
  scriptVersionStatusRecipe,
} from '@/features/scripts/presentation/scriptsSemanticUi'

export type ScriptDetailTab = 'edit' | 'versions'

type ScriptGroup = {
  category: string
  scripts: Script[]
}

export function ScriptsLibraryPanel({
  scripts,
  scriptGroups,
  scriptVersionCounts,
  totalBodyLength,
  versionedScriptCount,
  isLoading,
  selectedId,
  editingScriptTypeId,
  scriptTypeWorkspace,
  updateScriptCategoryPending,
  onCollapseDetail,
  onShowCreate,
  onBeginScriptTypeEdit,
  onCancelScriptTypeEdit,
  onSaveScriptType,
  onScriptTypeWorkspaceChange,
  onSelectScript,
}: {
  scripts: Script[]
  scriptGroups: ScriptGroup[]
  scriptVersionCounts: Map<number, number>
  totalBodyLength: number
  versionedScriptCount: number
  isLoading: boolean
  selectedId: number | null
  editingScriptTypeId: number | null
  scriptTypeWorkspace: string
  updateScriptCategoryPending: boolean
  onCollapseDetail: () => void
  onShowCreate: () => void
  onBeginScriptTypeEdit: (script: Script) => void
  onCancelScriptTypeEdit: () => void
  onSaveScriptType: (script: Script) => void
  onScriptTypeWorkspaceChange: (value: string) => void
  onSelectScript: (scriptId: number | null) => void
}) {
  const { t } = useTranslation()

  return (
    <ScriptLibraryRail
      className="script-workbench-rail"
      icon={<ScrollText size={14} />}
      title="剧本编辑"
      action={(
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="隐藏剧本正文"
            aria-label="隐藏剧本正文"
            onClick={onCollapseDetail}
          >
            <PanelRightClose size={14} />
          </Button>
          <Button size="icon-sm" onClick={onShowCreate} aria-label="新建剧本">
            <Plus size={14} />
          </Button>
        </>
      )}
    >
      <div className="script-workbench-status-strip">
        <ScriptWorkspaceStat icon={FileText} label="稿件" value={scripts.length} />
        <ScriptWorkspaceStat icon={GitBranch} label="有版本" value={versionedScriptCount} />
        <ScriptMetricBox icon={ScrollText} label="正文" value={`${totalBodyLength} 字`} />
      </div>
      {isLoading ? (
        <p className="px-2 py-4 type-label text-muted-foreground">{t('common.loadingShort')}</p>
      ) : scripts.length === 0 ? (
        <ScriptLibraryEmptyState
          icon={<FileText size={24} />}
          title={t('pages.scripts.empty')}
          action={(
            <Button variant="ghost" size="xs" onClick={onShowCreate}>
              {t('pages.scripts.createOne')}
            </Button>
          )}
        />
      ) : (
        <>
          {scriptGroups.map((group) => (
            <ScriptLibraryGroup key={group.category} label={group.category} count={group.scripts.length}>
              {group.scripts.map((script) => {
                const bodyLength = String(script.content || script.raw_source || '').trim().length
                const hasVersions = (scriptVersionCounts.get(script.ID) ?? 0) > 0
                const scriptTypeLabel = categoryLabel(script.script_type)
                const isEditingType = editingScriptTypeId === script.ID
                const editState = bodyLength > 0 ? '有正文' : '空稿'
                return (
                  <ScriptLibraryItem
                    key={script.ID}
                    active={selectedId === script.ID}
                    statusProps={scriptLibraryStatusRecipe(hasVersions, bodyLength)}
                    title={script.title}
                    meta={scriptLibraryItemMeta({ bodyLength, scriptTypeLabel })}
                    statusLabel={editState}
                    editor={isEditingType ? (
                      <div className="script-library-item__tag-editor" onClick={(event) => event.stopPropagation()}>
                        <ScriptEditorFieldLabel htmlFor={`script-library-category-${script.ID}`} className="sr-only">分类标签</ScriptEditorFieldLabel>
                        <ScriptEditorInput
                          id={`script-library-category-${script.ID}`}
                          placeholder="未分类"
                          value={scriptTypeWorkspace}
                          autoFocus
                          onChange={(event) => onScriptTypeWorkspaceChange(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              onSaveScriptType(script)
                            }
                            if (event.key === 'Escape') {
                              onCancelScriptTypeEdit()
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="icon-sm"
                          aria-label="保存分类标签"
                          disabled={updateScriptCategoryPending}
                          onClick={() => onSaveScriptType(script)}
                        >
                          <Check size={13} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="取消编辑分类标签"
                          onClick={onCancelScriptTypeEdit}
                        >
                          <X size={13} />
                        </Button>
                      </div>
                    ) : null}
                    action={!isEditingType ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="script-library-item__tag-button"
                        aria-label={`编辑分类标签：${scriptTypeLabel}`}
                        title={`编辑分类标签：${scriptTypeLabel}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onBeginScriptTypeEdit(script)
                        }}
                      >
                        <Pencil size={11} />
                      </Button>
                    ) : null}
                    onSelect={() => onSelectScript(selectedId === script.ID ? null : script.ID)}
                  />
                )
              })}
            </ScriptLibraryGroup>
          ))}
        </>
      )}
    </ScriptLibraryRail>
  )
}

export function ScriptTypeBadge({ script }: { script: Script }) {
  return <Badge>{categoryLabel(script.script_type)}</Badge>
}

export function VersionStatusBadge({ saved }: { saved: boolean }) {
  return <StatusBadge {...scriptVersionStatusRecipe(saved)}>{saved ? '已同步' : '草稿'}</StatusBadge>
}

export function ScriptStageBadge({ versionCount }: { versionCount: number }) {
  return <StatusBadge {...scriptStageRecipe(versionCount)}>{versionCount > 0 ? '已版本化' : '未版本化'}</StatusBadge>
}

export function ScriptVersionManagementPanel({
  selected,
  detailTab,
  workspaceBodyLength,
  hasWorkspaceBody,
  versionsForSelected,
  latestVersion,
  isCurrentVersionSaved,
  readinessScore,
  createVersionPending,
  expandedVersionId,
  versionEditorScrollTop,
  onCreateVersion,
  onDetailTabChange,
  onExpandedVersionChange,
  onVersionEditorScrollTopChange,
}: {
  selected: Script
  detailTab: ScriptDetailTab
  workspaceBodyLength: number
  hasWorkspaceBody: boolean
  versionsForSelected: ScriptVersion[]
  latestVersion: ScriptVersion | null
  isCurrentVersionSaved: boolean
  readinessScore: number
  createVersionPending: boolean
  expandedVersionId: number | null
  versionEditorScrollTop: number
  onCreateVersion: () => void
  onDetailTabChange: Dispatch<SetStateAction<ScriptDetailTab>>
  onExpandedVersionChange: Dispatch<SetStateAction<number | null>>
  onVersionEditorScrollTopChange: (value: number) => void
}) {
  return (
    <>
      <ScriptProductionPanel
        title="交付状态"
        description="整理当前正文、版本轨迹和协作入口。"
      >
        <ScriptBlockGrid>
          <ScriptBlockCard
            title="正文快照"
            range={`${workspaceBodyLength} 字`}
            description={hasWorkspaceBody ? '当前正文可保存为版本。' : '正文为空，先补充内容。'}
            usage={<VersionStatusBadge saved={isCurrentVersionSaved} />}
            fields={(
              <ScriptBlockSelectField
                id={`script-version-target-${selected.ID}`}
                label="当前视图"
                value={detailTab}
                onChange={(event) => onDetailTabChange(event.target.value as ScriptDetailTab)}
                helper="切换正文或版本管理"
              >
                <option value="edit">正文</option>
                <option value="versions">版本管理</option>
              </ScriptBlockSelectField>
            )}
            actions={(
              <Button variant="outline" size="sm" onClick={() => onDetailTabChange('edit')}>
                编辑正文
              </Button>
            )}
          />
          <ScriptBlockCard
            title="版本轨迹"
            range={`${versionsForSelected.length} 个版本`}
            description={latestVersion ? `最近保存于 ${formatDate(latestVersion.UpdatedAt)}` : '还没有可回看的版本。'}
            usage={<ScriptStageBadge versionCount={versionsForSelected.length} />}
            actions={(
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={createVersionPending || !hasWorkspaceBody || isCurrentVersionSaved}
                onClick={onCreateVersion}
              >
                <Plus size={14} />
                {createVersionPending ? '保存中' : '保存为版本'}
              </Button>
            )}
          />
        </ScriptBlockGrid>
        <ScriptProductionNotice title="将使用最新版本">
          <ScriptCollaborationStack>
            <ScriptMetricBox icon={GitBranch} label="最近版本" value={latestVersion ? `v${latestVersion.version_number || latestVersion.ID}` : '未保存'} />
            <ScriptMetricBox icon={Check} label="保存状态" value={isCurrentVersionSaved ? '同步' : '草稿'} />
          </ScriptCollaborationStack>
        </ScriptProductionNotice>
      </ScriptProductionPanel>

      <ScriptReadinessPanel
        title="发布准备度"
        value={readinessScore}
        status={<StatusBadge {...scriptReadinessRecipe(readinessScore)}>{readinessScore}%</StatusBadge>}
        rows={(
          <>
            <ScriptReadinessRow
              label="标题"
              done={Boolean(selected.title?.trim())}
              status={<StatusBadge {...scriptReadinessItemRecipe(Boolean(selected.title?.trim()))}>{selected.title?.trim() ? '已填写' : '缺少'}</StatusBadge>}
            />
            <ScriptReadinessRow
              label="正文"
              done={hasWorkspaceBody}
              status={<StatusBadge {...scriptReadinessItemRecipe(hasWorkspaceBody)}>{hasWorkspaceBody ? '已填写' : '缺少'}</StatusBadge>}
            />
            <ScriptReadinessRow
              label="版本"
              done={versionsForSelected.length > 0}
              status={<StatusBadge {...scriptReadinessItemRecipe(versionsForSelected.length > 0)}>{versionsForSelected.length > 0 ? '已保存' : '缺少'}</StatusBadge>}
            />
          </>
        )}
        actions={(
          <Button variant="outline" size="sm" onClick={() => onDetailTabChange('edit')}>
            回到正文
          </Button>
        )}
      />

      <ScriptWorkflowPanel title="创作流程">
        <ScriptWorkflowStep index="01" title="完善正文" active={false} />
        <ScriptWorkflowStep index="02" title="保存版本" active={detailTab === 'versions' && !isCurrentVersionSaved} />
        <ScriptWorkflowStep index="03" title="回看版本" active={versionsForSelected.length > 0} />
      </ScriptWorkflowPanel>

      <ScriptAgentAssistPanel
        icon={ScrollText}
        title="AI 协作建议"
        description="保留当前正文状态后，可以把版本交给后续分镜、角色或资源工作台继续拆解。"
        primaryAction={(
          <Button
            variant="outline"
            size="sm"
            disabled={createVersionPending || !hasWorkspaceBody || isCurrentVersionSaved}
            onClick={onCreateVersion}
          >
            保存为版本
          </Button>
        )}
        secondaryActions={(
          <>
            <Button variant="ghost" size="sm" onClick={() => onDetailTabChange('edit')}>编辑正文</Button>
            <Button variant="ghost" size="sm" onClick={() => onExpandedVersionChange(latestVersion?.ID ?? null)} disabled={!latestVersion}>查看最近版本</Button>
          </>
        )}
      />

      <ScriptVersionHistoryPanel
        title="版本管理"
        description="保存当前正文为一个可回看的版本。"
        action={(
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={createVersionPending || !hasWorkspaceBody || isCurrentVersionSaved}
            onClick={onCreateVersion}
          >
            <Plus size={14} />
            {createVersionPending ? '保存中' : '保存为版本'}
          </Button>
        )}
      >
        {versionsForSelected.length === 0 ? (
          <ScriptVersionEmptyState
            icon={GitBranch}
            title="暂无版本"
            detail="正文保存后，可以在这里创建第一个版本。"
            action={<Button variant="outline" size="sm" onClick={() => onDetailTabChange('edit')}>回到正文</Button>}
          />
        ) : (
          <>
            {versionsForSelected.map((version) => {
              const isExpanded = expandedVersionId === version.ID
              const content = scriptVersionSourceText(version)
              const contentLength = content.trim().length
              const lines = scriptEditorLines(content)
              return (
                <ScriptVersionCard
                  key={version.ID}
                  versionLabel={`v${version.version_number || version.ID}`}
                  title={version.title}
                  meta={`${contentLength} 字 · ${formatDate(version.UpdatedAt)}`}
                  toggleLabel={contentLength > 0 ? (isExpanded ? '收起' : '查看') : undefined}
                  onToggle={contentLength > 0 ? () => onExpandedVersionChange(isExpanded ? null : version.ID) : undefined}
                >
                  {isExpanded && contentLength > 0 ? (
                    <ScriptVersionBlockShell
                      toolbar={(
                        <>
                          <VersionStatusBadge saved={isCurrentVersionSaved && latestVersion?.ID === version.ID} />
                          <Badge variant="outline">{lines.length} 行</Badge>
                        </>
                      )}
                    >
                      <ScriptVersionLineEditor
                        value={content}
                        lines={lines}
                        scrollTop={versionEditorScrollTop}
                        onScroll={(event) => onVersionEditorScrollTopChange(event.currentTarget.scrollTop)}
                      />
                    </ScriptVersionBlockShell>
                  ) : null}
                </ScriptVersionCard>
              )
            })}
          </>
        )}
      </ScriptVersionHistoryPanel>
    </>
  )
}
