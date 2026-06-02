import { ArrowDown, ArrowUp, CheckCircle2, Play, Plus, Trash2 } from 'lucide-react'

import { ResourceFileImage } from '@/shared/ui/ResourceFileImage'
import {
  keyframeDisplayTitle,
  keyframeFrameRoleLabel,
  keyframeFrameRoleOptions,
  keyframeGenerationStatusLabel,
  keyframeHasRunningJob,
  keyframeOutputResourceId,
  latestKeyframeGenerationJob,
  type ContentWorkbenchEditRecord,
  type KeyframeEditWorkspace,
} from '@/features/content/domain/contentWorkbenchEditModel'
import { firstText } from '@/features/content/domain/contentWorkbenchRecordUtils'
import { contentKeyframeGenerationRecipe } from '@/features/content/presentation/contentSemanticUi'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import type { Job, PublicModel } from '@/types'
import {
  ContentWorkbenchEditorActionGroup,
  ContentWorkbenchEditorField,
  ContentWorkbenchEditorFieldGrid,
  ContentWorkbenchEditorGenerationActions,
  ContentWorkbenchEditorGenerationBar,
  ContentWorkbenchEditorHeader,
  ContentWorkbenchEditorPanel,
  ContentWorkbenchEditorRoot,
  ContentWorkbenchEditorSelectField,
  ContentWorkbenchKeyframeActionButton,
  ContentWorkbenchKeyframeDetail,
  ContentWorkbenchKeyframeEmptyState,
  ContentWorkbenchKeyframeInput,
  ContentWorkbenchKeyframeList,
  ContentWorkbenchKeyframeListItem,
  ContentWorkbenchKeyframeListSection,
  ContentWorkbenchKeyframeModelSelect,
  ContentWorkbenchKeyframeStatusBadge,
  ContentWorkbenchKeyframeTextarea,
  ContentWorkbenchKeyframeThumbnail,
} from '@movscript/ui'

export function ContentWorkbenchKeyframeEditor({
  compact = false,
  keyframes,
  selectedKeyframe,
  keyframeWorkspace,
  jobs,
  unit,
  requiresKeyframe,
  imageModels,
  keyframeModelId,
  hasSelectedModel,
  unfinishedKeyframes,
  reorderPending,
  deletePending,
  savePending,
  generatePending,
  keyframeUnchanged,
  onCreateKeyframe,
  onSelectKeyframe,
  onMoveKeyframe,
  onDeleteKeyframe,
  onSaveKeyframe,
  onWorkspaceChange,
  onModelChange,
  onGenerateKeyframes,
}: {
  compact?: boolean
  keyframes: ContentWorkbenchEditRecord[]
  selectedKeyframe: ContentWorkbenchEditRecord | null
  keyframeWorkspace: KeyframeEditWorkspace
  jobs: Job[]
  unit: ContentWorkbenchEditRecord
  requiresKeyframe: boolean
  imageModels: PublicModel[]
  keyframeModelId: string
  hasSelectedModel: boolean
  unfinishedKeyframes: ContentWorkbenchEditRecord[]
  reorderPending: boolean
  deletePending: boolean
  savePending: boolean
  generatePending: boolean
  keyframeUnchanged: boolean
  onCreateKeyframe?: () => void
  onSelectKeyframe: (keyframeId: number) => void
  onMoveKeyframe: (keyframe: ContentWorkbenchEditRecord, direction: 'up' | 'down') => void
  onDeleteKeyframe: (keyframe: ContentWorkbenchEditRecord) => void
  onSaveKeyframe: () => void
  onWorkspaceChange: (key: keyof KeyframeEditWorkspace, value: string) => void
  onModelChange: (modelId: string) => void
  onGenerateKeyframes: (targets: ContentWorkbenchEditRecord[]) => void
}) {
  return (
    <ContentWorkbenchEditorRoot compact={compact} data-testid="content-workbench-keyframe-editor">
      <ContentWorkbenchKeyframeListSection
        description={keyframes.length > 0 ? `${keyframes.length} 帧按顺序生成` : requiresKeyframe ? '建议先补首帧、尾帧。' : '可选画面输入'}
        action={onCreateKeyframe ? (
          <ContentWorkbenchKeyframeActionButton size="sm" variant="outline" onClick={onCreateKeyframe}>
            <Plus size={14} />
            添加
          </ContentWorkbenchKeyframeActionButton>
        ) : null}
      >
        <ContentWorkbenchKeyframeList>
          {keyframes.length > 0 ? keyframes.map((keyframe, index) => {
            const active = selectedKeyframe?.ID === keyframe.ID
            const latestJob = latestKeyframeGenerationJob(jobs, keyframe)
            const outputResourceId = keyframeOutputResourceId(keyframe, jobs)
            const running = keyframeHasRunningJob(keyframe, jobs)
            return (
              <ContentWorkbenchKeyframeListItem
                key={keyframe.ID}
                active={active}
                onClick={() => onSelectKeyframe(keyframe.ID)}
                thumbnail={(
                  <ContentWorkbenchKeyframeThumbnail
                    fallback={String(index + 1).padStart(2, '0')}
                    media={outputResourceId > 0 ? (
                      <ResourceFileImage resourceId={outputResourceId} alt={recordTitle(keyframe)} />
                    ) : undefined}
                  />
                )}
                title={keyframeDisplayTitle(keyframe)}
                detail={firstText(keyframe.prompt, keyframe.description, '暂无提示词')}
                status={(
                  <ContentWorkbenchKeyframeStatusBadge {...contentKeyframeGenerationRecipe({ running, hasOutput: outputResourceId > 0, failed: latestJob?.status === 'failed' })}>
                    {running ? '生成中' : outputResourceId > 0 ? '有结果' : latestJob?.status === 'failed' ? '失败' : '待生成'}
                  </ContentWorkbenchKeyframeStatusBadge>
                )}
              />
            )
          }) : (
            <ContentWorkbenchKeyframeEmptyState>
              当前制作项还没有关键帧。先添加首帧或尾帧，再逐帧生成。
            </ContentWorkbenchKeyframeEmptyState>
          )}
        </ContentWorkbenchKeyframeList>
      </ContentWorkbenchKeyframeListSection>

      <ContentWorkbenchEditorPanel>
        {selectedKeyframe ? (
          <ContentWorkbenchKeyframeDetail>
            <ContentWorkbenchEditorHeader
              label="当前关键帧"
              meta={keyframeGenerationStatusLabel(selectedKeyframe, jobs)}
              actions={(
                <ContentWorkbenchEditorActionGroup>
                  <ContentWorkbenchKeyframeActionButton
                    size="icon-sm"
                    variant="outline"
                    title="上移关键帧"
                    aria-label="上移关键帧"
                    disabled={reorderPending || keyframes[0]?.ID === selectedKeyframe.ID}
                    onClick={() => onMoveKeyframe(selectedKeyframe, 'up')}
                  >
                    <ArrowUp size={14} />
                  </ContentWorkbenchKeyframeActionButton>
                  <ContentWorkbenchKeyframeActionButton
                    size="icon-sm"
                    variant="outline"
                    title="下移关键帧"
                    aria-label="下移关键帧"
                    disabled={reorderPending || keyframes[keyframes.length - 1]?.ID === selectedKeyframe.ID}
                    onClick={() => onMoveKeyframe(selectedKeyframe, 'down')}
                  >
                    <ArrowDown size={14} />
                  </ContentWorkbenchKeyframeActionButton>
                  <ContentWorkbenchKeyframeActionButton
                    size="sm"
                    variant="outline"
                    tone="danger"
                    disabled={deletePending || savePending}
                    loading={deletePending}
                    onClick={() => onDeleteKeyframe(selectedKeyframe)}
                    data-testid="content-workbench-keyframe-delete"
                  >
                    <Trash2 size={14} />
                    删除
                  </ContentWorkbenchKeyframeActionButton>
                  <ContentWorkbenchKeyframeActionButton
                    size="sm"
                    disabled={keyframeUnchanged || savePending || deletePending}
                    loading={savePending}
                    onClick={onSaveKeyframe}
                    data-testid="content-workbench-keyframe-save"
                  >
                    <CheckCircle2 size={14} />
                    保存
                  </ContentWorkbenchKeyframeActionButton>
                </ContentWorkbenchEditorActionGroup>
              )}
            />

            <ContentWorkbenchEditorFieldGrid variant="keyframe-meta">
              <ContentWorkbenchEditorSelectField label="分类" value={keyframeWorkspace.frame_role} options={keyframeFrameRoleOptions} onChange={(value) => onWorkspaceChange('frame_role', value)} />
              <ContentWorkbenchEditorField label="标题（可选）" htmlFor={`keyframe-title-${selectedKeyframe.ID}`}>
                <ContentWorkbenchKeyframeInput id={`keyframe-title-${selectedKeyframe.ID}`} value={keyframeWorkspace.title} placeholder={`${keyframeFrameRoleLabel(keyframeWorkspace.frame_role)} · ${recordTitle(unit)}`} onChange={(event) => onWorkspaceChange('title', event.target.value)} />
              </ContentWorkbenchEditorField>
              <ContentWorkbenchEditorField label="顺序" htmlFor={`keyframe-order-${selectedKeyframe.ID}`}>
                <ContentWorkbenchKeyframeInput id={`keyframe-order-${selectedKeyframe.ID}`} type="number" min="1" value={keyframeWorkspace.order} onChange={(event) => onWorkspaceChange('order', event.target.value)} />
              </ContentWorkbenchEditorField>
            </ContentWorkbenchEditorFieldGrid>

            <ContentWorkbenchEditorFieldGrid compact={compact}>
              <ContentWorkbenchEditorField label="画面描述" htmlFor={`keyframe-description-${selectedKeyframe.ID}`}>
                <ContentWorkbenchKeyframeTextarea
                  id={`keyframe-description-${selectedKeyframe.ID}`}
                  value={keyframeWorkspace.description}
                  placeholder="描述这一帧的叙事状态、人物动作、空间关系和画面重点。"
                  onChange={(event) => onWorkspaceChange('description', event.target.value)}
                />
              </ContentWorkbenchEditorField>
              <ContentWorkbenchEditorField label="生成提示词" htmlFor={`keyframe-prompt-${selectedKeyframe.ID}`}>
                <ContentWorkbenchKeyframeTextarea
                  id={`keyframe-prompt-${selectedKeyframe.ID}`}
                  value={keyframeWorkspace.prompt}
                  placeholder="写给图像模型的关键帧提示词，包含风格、构图、角色一致性和负向约束。"
                  onChange={(event) => onWorkspaceChange('prompt', event.target.value)}
                />
              </ContentWorkbenchEditorField>
            </ContentWorkbenchEditorFieldGrid>

            <ContentWorkbenchEditorGenerationBar>
              <ContentWorkbenchEditorField label="图像模型" htmlFor={`keyframe-model-${selectedKeyframe.ID}`}>
                <ContentWorkbenchKeyframeModelSelect
                  id={`keyframe-model-${selectedKeyframe.ID}`}
                  value={keyframeModelId}
                  onChange={(event) => onModelChange(event.target.value)}
                  disabled={imageModels.length === 0}
                >
                  {imageModels.length > 0 ? imageModels.map((model) => (
                    <option key={publicModelId(model)} value={publicModelId(model)}>{publicModelLabel(model)}</option>
                  )) : <option value="">没有可用图像模型</option>}
                </ContentWorkbenchKeyframeModelSelect>
              </ContentWorkbenchEditorField>
              <ContentWorkbenchEditorGenerationActions>
                <ContentWorkbenchKeyframeActionButton
                  size="sm"
                  variant="outline"
                  disabled={unfinishedKeyframes.length === 0 || generatePending || !hasSelectedModel}
                  loading={generatePending && unfinishedKeyframes.length > 1}
                  onClick={() => onGenerateKeyframes(unfinishedKeyframes)}
                  data-testid="content-workbench-keyframe-generate-missing"
                >
                  <Play size={14} />
                  生成未完成
                </ContentWorkbenchKeyframeActionButton>
                <ContentWorkbenchKeyframeActionButton
                  size="sm"
                  disabled={generatePending || !hasSelectedModel}
                  loading={generatePending}
                  onClick={() => onGenerateKeyframes([selectedKeyframe])}
                  data-testid="content-workbench-keyframe-generate-one"
                >
                  <Play size={14} />
                  生成当前帧
                </ContentWorkbenchKeyframeActionButton>
              </ContentWorkbenchEditorGenerationActions>
            </ContentWorkbenchEditorGenerationBar>
          </ContentWorkbenchKeyframeDetail>
        ) : (
          <ContentWorkbenchKeyframeEmptyState>
            选择一个关键帧后，可以编辑提示词、删除、排序或逐帧生成。
          </ContentWorkbenchKeyframeEmptyState>
        )}
      </ContentWorkbenchEditorPanel>
    </ContentWorkbenchEditorRoot>
  )
}

function recordTitle(record: ContentWorkbenchEditRecord) {
  return firstText(record.title, record.name, `${record.kind || '记录'} #${record.ID}`)
}
