import { useMemo, useState, type DragEvent } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus, Search, Workflow } from 'lucide-react'

import { api } from '@/shared/infrastructure/api'
import { canvasKeys } from '@/features/canvas/application/canvasQueryKeys'
import { deriveCanvasReferencePorts } from '@/features/canvas/integrations/workflowReferences'
import { startCanvasWorkflowDrag } from '@/features/canvas/domain/canvasDropTarget'
import type { Canvas } from '@/types'
import {
  CanvasWorkflowReferenceAddButton,
  CanvasWorkflowReferenceBody,
  CanvasWorkflowReferenceChip,
  CanvasWorkflowReferenceChips,
  CanvasWorkflowReferenceList,
  CanvasWorkflowReferencePickerCard,
  CanvasWorkflowReferencePickerCardIcon,
  CanvasWorkflowReferencePickerCardMain,
  CanvasWorkflowReferencePickerCardMeta,
  CanvasWorkflowReferencePickerCardText,
  CanvasWorkflowReferencePickerCardTitle,
  CanvasWorkflowReferencePickerShell,
  CanvasWorkflowReferenceSearch,
  CanvasWorkflowReferenceSearchInput,
  CanvasWorkflowReferenceState,
} from '@/features/canvas/ui/CanvasWorkflowUi'

export function WorkflowReferencePicker({
  projectId,
  currentCanvasId,
  onAddWorkflowReference,
}: {
  projectId?: number
  currentCanvasId?: number
  onAddWorkflowReference: (workflowCanvas: Canvas) => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const { data: canvases = [], isLoading } = useQuery<Canvas[]>({
    queryKey: canvasKeys.referenceWorkflows(projectId),
    queryFn: () => {
      const params: Record<string, string> = { type: 'workflow' }
      if (projectId) params.project_id = String(projectId)
      return api.get('/canvases', { params }).then((r) => r.data as Canvas[])
    },
  })
  const workflowDetails = useQueries({
    queries: canvases
      .filter((canvas) => canvas.ID !== currentCanvasId)
      .map((canvas) => ({
        queryKey: canvasKeys.detail(canvas.ID),
        queryFn: () => api.get(`/canvases/${canvas.ID}`).then((r) => r.data as Canvas),
        enabled: !!canvas.ID,
      })),
  })
  const workflowDetailById = useMemo(() => {
    const map = new Map<number, Canvas>()
    workflowDetails.forEach((query) => {
      if (query.data?.ID) map.set(query.data.ID, query.data)
    })
    return map
  }, [workflowDetails])
  const term = search.trim().toLowerCase()
  const workflows = canvases
    .filter((canvas) => canvas.ID !== currentCanvasId)
    .filter((canvas) => !term || canvas.name.toLowerCase().includes(term) || String(canvas.ID).includes(term))

  function dragWorkflow(event: DragEvent<HTMLDivElement>, canvas: Canvas) {
    startCanvasWorkflowDrag(event.dataTransfer, canvas)
  }

  return (
    <CanvasWorkflowReferencePickerShell>
      <CanvasWorkflowReferenceSearch>
        <Search size={12} />
        <CanvasWorkflowReferenceSearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('canvas.editor.workflowReferences.search', { defaultValue: 'Search workflows' })}
        />
      </CanvasWorkflowReferenceSearch>
      <CanvasWorkflowReferenceBody>
        {isLoading ? (
          <CanvasWorkflowReferenceState>
            <Loader2 size={14} />
            {t('common.loadingShort')}
          </CanvasWorkflowReferenceState>
        ) : workflows.length === 0 ? (
          <CanvasWorkflowReferenceState>
            {t('canvas.editor.workflowReferences.empty', { defaultValue: 'No workflow canvases available.' })}
          </CanvasWorkflowReferenceState>
        ) : (
          <CanvasWorkflowReferenceList>
            {workflows.map((canvas) => {
              const detailedCanvas = workflowDetailById.get(canvas.ID) ?? canvas
              const ports = deriveCanvasReferencePorts(detailedCanvas)
              return (
                <CanvasWorkflowReferencePickerCard
                  key={canvas.ID}
                  draggable
                  onDragStart={(event) => dragWorkflow(event, detailedCanvas)}
                >
                  <CanvasWorkflowReferencePickerCardMain>
                    <CanvasWorkflowReferencePickerCardIcon>
                      <Workflow size={14} />
                    </CanvasWorkflowReferencePickerCardIcon>
                    <CanvasWorkflowReferencePickerCardText>
                      <CanvasWorkflowReferencePickerCardTitle>{canvas.name}</CanvasWorkflowReferencePickerCardTitle>
                      <CanvasWorkflowReferencePickerCardMeta>
                        {t('canvas.editor.workflowReferences.portSummary', { inputs: ports.inputs.length, outputs: ports.outputs.length, defaultValue: `${ports.inputs.length} inputs · ${ports.outputs.length} outputs` })}
                      </CanvasWorkflowReferencePickerCardMeta>
                    </CanvasWorkflowReferencePickerCardText>
                    <CanvasWorkflowReferenceAddButton
                      title={t('canvas.editor.workflowReferences.add', { defaultValue: 'Add workflow reference' })}
                      aria-label={t('canvas.editor.workflowReferences.add', { defaultValue: 'Add workflow reference' })}
                      onClick={() => onAddWorkflowReference(detailedCanvas)}
                    >
                      <Plus size={13} />
                    </CanvasWorkflowReferenceAddButton>
                  </CanvasWorkflowReferencePickerCardMain>
                  <CanvasWorkflowReferenceChips>
                    {ports.inputs.slice(0, 3).map((port) => <CanvasWorkflowReferenceChip key={`in-${port.id}`}>in:{port.label ?? port.id}</CanvasWorkflowReferenceChip>)}
                    {ports.outputs.slice(0, 2).map((port) => <CanvasWorkflowReferenceChip key={`out-${port.id}`}>out:{port.label ?? port.id}</CanvasWorkflowReferenceChip>)}
                  </CanvasWorkflowReferenceChips>
                </CanvasWorkflowReferencePickerCard>
              )
            })}
          </CanvasWorkflowReferenceList>
        )}
      </CanvasWorkflowReferenceBody>
    </CanvasWorkflowReferencePickerShell>
  )
}
