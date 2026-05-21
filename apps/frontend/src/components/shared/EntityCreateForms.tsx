import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button, Input, Label, Textarea } from '@movscript/ui'
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
    <div className="space-y-4">
      <div>
        <Label className="mb-1 type-label font-medium text-muted-foreground">{t('forms.titleRequired')}</Label>
        <Input
          autoFocus
          placeholder={t('forms.scriptTitle')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canCreate && create.mutate()}
        />
      </div>
      <div>
        <Label className="mb-1 type-label font-medium text-muted-foreground">分类</Label>
        <Input
          placeholder="例如：第一集、广告脚本、口播、拍摄版"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <p className="mt-1 type-label text-muted-foreground">分类是自由标签，不限制固定选项。</p>
      </div>
      <div>
        <Label className="mb-1 type-label font-medium text-muted-foreground">{t('forms.summaryOptional')}</Label>
        <Textarea className="resize-none" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={() => create.mutate()} disabled={!canCreate || create.isPending} className="flex-1">
          {create.isPending ? t('common.creating') : t('common.create')}
        </Button>
        <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  )
}
