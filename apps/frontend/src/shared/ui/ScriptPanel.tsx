import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ResourceScriptReferencePanel, type ResourceScriptReferenceItem } from '@movscript/ui'
import { api } from '@/shared/infrastructure/api'
import type { Script } from '@/types'
import { BookOpen } from 'lucide-react'

interface Props {
  projectId: number | undefined
}

// ScriptPanel shows the main script(s) as a collapsible side panel.
// Intended to be embedded in work pages so collaborators always have context.
export function ScriptPanel({ projectId }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data: scripts = [] } = useQuery<Script[]>({
    queryKey: ['scripts-main', projectId],
    queryFn: () =>
      api.get(`/projects/${projectId}/scripts`).then((r) =>
        (r.data as Script[]).filter((s) => s.script_type === 'main')
      ),
    enabled: !!projectId && open,
  })

  const items: ResourceScriptReferenceItem[] = scripts.map((script) => ({
    id: String(script.ID),
    title: script.title,
    description: script.description,
    content: script.content,
  }))
  const selectedItemId = selectedId ? String(selectedId) : null

  return (
    <ResourceScriptReferencePanel
      open={open}
      onOpenChange={setOpen}
      icon={BookOpen}
      title={t('domain.scriptTypes.mainAlt')}
      expandLabel={t('shared.scriptPanel.expandMainScript')}
      emptyLabel={t('shared.scriptPanel.noMainScript')}
      emptyContentLabel={t('shared.scriptPanel.emptyContent')}
      items={items}
      selectedId={selectedItemId}
      onSelectedIdChange={(id) => setSelectedId(Number(id))}
    />
  )
}
