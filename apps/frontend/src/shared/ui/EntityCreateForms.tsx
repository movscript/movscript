import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AppFeedbackText } from '@movscript/ui/business/app'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
import { ScriptCreateFormShell } from '@/shared/ui/ScriptCreateFormUi'
import { readScriptDocument } from '@/features/resources/application/scriptDocumentReader'
import { SCRIPT_DOCUMENT_ACCEPT, scriptDocumentTitleFromName } from '@/features/resources/domain/scriptDocuments'
import { createWorkspaceScript, type ScriptWorkspaceRepositoryContext } from '@/features/scripts/application/scriptWorkspaceRepository'
import { invalidateScriptMutationResult, scriptCreatedResult } from '@/features/scripts/application/scriptMutationInvalidation'

export interface EntityFormProps {
  projectId: number
  workspaceContext?: ScriptWorkspaceRepositoryContext
  onSuccess: () => void
  onCancel: () => void
}

export function ScriptCreateForm({ projectId, workspaceContext, onSuccess, onCancel }: EntityFormProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [desc, setDesc] = useState('')
  const [body, setBody] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState('')
  const canCreate = !!title.trim()

  async function handleFile(file?: File) {
    if (!file) return
    setFileError('')
    try {
      const text = await readScriptDocument(file)
      setFileName(file.name)
      setBody(text)
      setTitle((current) => current.trim() ? current : scriptDocumentTitleFromName(file.name))
    } catch (error) {
      setFileError(error instanceof Error ? error.message : '读取文档失败')
    }
  }

  const create = useMutation({
    mutationFn: () =>
      createWorkspaceScript(projectId, {
        title,
        description: desc || undefined,
        content: body,
        raw_source: body,
        script_type: category.trim() || 'uncategorized',
      }, workspaceContext),
    onSuccess: (created) => {
      invalidateScriptMutationResult(qc, scriptCreatedResult({ projectId, changedIds: [created.ID] }))
      onSuccess()
    },
  })

  return (
    <ScriptCreateFormShell
      titleLabel={t('forms.titleRequired')}
      titlePlaceholder={t('forms.scriptTitle')}
      title={title}
      onTitleChange={setTitle}
      categoryLabel="分类"
      categoryPlaceholder="例如：第一集、广告脚本、口播、拍摄版"
      categoryHelper="分类是自由标签，不限制固定选项。"
      category={category}
      onCategoryChange={setCategory}
      descriptionLabel={t('forms.summaryOptional')}
      description={desc}
      onDescriptionChange={setDesc}
      bodyLabel={t('details.scriptBody')}
      bodyPlaceholder={t('details.scriptBodyPlaceholder')}
      body={body}
      onBodyChange={setBody}
      uploadAction={(
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept={SCRIPT_DOCUMENT_ACCEPT}
            className="hidden"
            onChange={(event) => {
              void handleFile(event.target.files?.[0])
              event.currentTarget.value = ''
            }}
          />
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={13} />
            上传手记
          </button>
        </>
      )}
      uploadMeta={fileName ? <span className="text-xs text-muted-foreground">{fileName}</span> : null}
      uploadError={fileError ? <AppFeedbackText as="span" className="text-xs">{fileError}</AppFeedbackText> : null}
      createLabel={t('common.create')}
      creatingLabel={t('common.creating')}
      cancelLabel={t('common.cancel')}
      canSubmit={canCreate}
      submitting={create.isPending}
      onSubmit={() => create.mutate()}
      onCancel={onCancel}
    />
  )
}
