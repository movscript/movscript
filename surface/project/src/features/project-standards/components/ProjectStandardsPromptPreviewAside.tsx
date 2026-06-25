import {
  Eye,
  ImagePlus,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  ProjectStandardsActionButton,
  ProjectStandardsBadge,
  ProjectStandardsCodeBlock,
  ProjectStandardsDescription,
  ProjectStandardsEmptyText,
  ProjectStandardsIconButton,
  ProjectStandardsImageCard,
  ProjectStandardsImageFrame,
  ProjectStandardsImageGrid,
  ProjectStandardsImageMeta,
  ProjectStandardsInput,
  ProjectStandardsPreviewAside,
  ProjectStandardsPreviewSurface,
  ProjectStandardsSectionHeader,
  ProjectStandardsSurfaceItem,
  ProjectStandardsTinyText,
  ProjectStandardsTitleRow,
} from './ProjectStandardsUi'
import type { ProjectPromptRule } from '../application/projectStandardsModel'
import { ResourceFileImage } from '@movscript/resource-surface/resource-media-components'
import type { RawResource } from '@movscript/shared'

export function ProjectStandardsPromptPreviewAside({
  enabledRuleCount,
  promptPreview,
  styleReferenceInputRef,
  uploadingStyleReferences,
  onUploadStyleReferenceImages,
  projectId,
  styleReferenceIds,
  uploadedStyleReferencesById,
  deletingStyleReferenceId,
  onRemoveStyleReferenceImage,
  styleReferenceRule,
}: {
  enabledRuleCount: number
  promptPreview: string
  styleReferenceInputRef: { current: HTMLInputElement | null }
  uploadingStyleReferences: boolean
  onUploadStyleReferenceImages: (files: FileList | null) => void | Promise<void>
  projectId: number | undefined
  styleReferenceIds: number[]
  uploadedStyleReferencesById: Map<number, RawResource>
  deletingStyleReferenceId: number | null
  onRemoveStyleReferenceImage: (resourceId: number) => void | Promise<void>
  styleReferenceRule: ProjectPromptRule | undefined
}) {
  return (
    <ProjectStandardsPreviewAside>
      <ProjectStandardsSectionHeader>
        <div className="min-w-0">
          <ProjectStandardsTitleRow><Eye size={14} />输出预览</ProjectStandardsTitleRow>
          <ProjectStandardsDescription>这里展示最终会交给模型的提示词片段和风格参考图。</ProjectStandardsDescription>
        </div>
        <ProjectStandardsBadge className="type-tiny">{enabledRuleCount} 条启用</ProjectStandardsBadge>
      </ProjectStandardsSectionHeader>
      <ProjectStandardsPreviewSurface>
        <ProjectStandardsCodeBlock>{promptPreview}</ProjectStandardsCodeBlock>
      </ProjectStandardsPreviewSurface>

      <ProjectStandardsSectionHeader className="project-standards-preview-subheader">
        <div className="min-w-0">
          <ProjectStandardsTitleRow><ImagePlus size={14} />风格图片</ProjectStandardsTitleRow>
          <ProjectStandardsDescription>这些图片会作为项目画风、质感、色彩和光影的参考。</ProjectStandardsDescription>
        </div>
        <div className="flex items-center gap-2">
          <ProjectStandardsInput
            ref={(node) => {
              styleReferenceInputRef.current = node
            }}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => onUploadStyleReferenceImages(event.target.files)}
          />
          <ProjectStandardsActionButton size="sm" className="type-label" onClick={() => styleReferenceInputRef.current?.click()} loading={uploadingStyleReferences} disabled={!projectId}>
            <Upload size={12} />
            上传
          </ProjectStandardsActionButton>
        </div>
      </ProjectStandardsSectionHeader>

      <div className="mt-3">
        {styleReferenceIds.length === 0 ? (
          <ProjectStandardsEmptyText className="type-label">
            尚未设置风格图片。上传后会自动加入提示词预览。
          </ProjectStandardsEmptyText>
        ) : (
          <ProjectStandardsImageGrid>
            {styleReferenceIds.map((id) => {
              const uploaded = uploadedStyleReferencesById.get(id)
              return (
                <ProjectStandardsImageCard key={id}>
                  <ProjectStandardsImageFrame>
                    <ResourceFileImage resourceId={id} alt={uploaded?.name ?? `resource#${id}`} className="h-full w-full object-cover" />
                    <ProjectStandardsIconButton
                      size="icon-sm"
                      variant="ghost"
                      tone="danger"
                      className="project-standards-image-remove"
                      loading={deletingStyleReferenceId === id}
                      onClick={() => { void onRemoveStyleReferenceImage(id) }}
                      title="移除风格图片"
                    >
                      <Trash2 size={14} />
                    </ProjectStandardsIconButton>
                  </ProjectStandardsImageFrame>
                  <ProjectStandardsImageMeta>
                    <p className="min-w-0 truncate type-tiny text-foreground">{uploaded?.name ?? `resource#${id}`}</p>
                    <ProjectStandardsBadge className="shrink-0 type-tiny">#{id}</ProjectStandardsBadge>
                  </ProjectStandardsImageMeta>
                </ProjectStandardsImageCard>
              )
            })}
          </ProjectStandardsImageGrid>
        )}
      </div>

      {styleReferenceRule ? (
        <ProjectStandardsSurfaceItem className="project-standards-style-reference-note">
          <ProjectStandardsTinyText>{styleReferenceRule.value}</ProjectStandardsTinyText>
        </ProjectStandardsSurfaceItem>
      ) : null}
    </ProjectStandardsPreviewAside>
  )
}
