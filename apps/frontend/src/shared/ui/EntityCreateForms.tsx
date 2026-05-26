import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import { ScriptCreateFormShell } from '@movscript/ui'
import { useTranslation } from 'react-i18next'

export interface EntityFormProps {
  projectId: number
  onSuccess: () => void
  onCancel: () => void
}

export function ScriptCreateForm({ projectId, onSuccess, onCancel }: EntityFormProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [desc, setDesc] = useState('')
  const canCreate = !!title.trim()

  const create = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/scripts`, {
        title,
        description: desc || undefined,
        script_type: category.trim() || 'uncategorized',
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scripts', projectId] })
      qc.invalidateQueries({ queryKey: ['artifact-refs', projectId] })
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
