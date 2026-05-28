import type { NodeProps } from '@xyflow/react'
import { Check, HardDrive, Loader2, LogIn, LogOut, Play, UserCheck, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CanvasParamType } from '@/types'
import {
  CanvasIOActionCard,
  CanvasNodeApprovalActionButton,
  CanvasNodeApprovalActions,
  CanvasNodeApprovalStatus,
  CanvasNodeCard,
  CanvasNodeCardBody,
  CanvasNodeCardHeader,
} from '@movscript/ui'
import {
  ioStateFromStatus,
  nodeStatusLabel,
  paramTypeText,
  portLabelText,
  resourceSinkPorts,
  workflowInputOutputPorts,
  workflowOutputInputPorts,
} from './canvasNodeUiAdapters'
import { CanvasCardPortHandle, SemanticPortRows } from './canvasNodePorts'
import type { NodeDataWithHandlers } from './canvasNodeTypes'

const WORKFLOW_RUNTIME_PARAM_TYPES: CanvasParamType[] = ['text', 'image', 'video', 'audio']

function workflowOutputParamType(type?: CanvasParamType): CanvasParamType {
  return type && WORKFLOW_RUNTIME_PARAM_TYPES.includes(type) ? type : 'image'
}

function updatePositiveOrder(value: string, onUpdate?: (order: number) => void) {
  if (!onUpdate) return
  const nextOrder = Number(value)
  if (!Number.isInteger(nextOrder) || nextOrder < 1) return
  onUpdate(nextOrder)
}

export function InputNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const port = workflowInputOutputPorts(data)[0]
  const hasValue = !!data.inputValue
  const isRunning = status === 'pending' || status === 'running'
  const state = ioStateFromStatus(status, hasValue)
  const order = data.paramOrder
  const title = data.paramName || data.label || (order ? `${t('canvas.nodeLabels.input')} ${order}` : t('canvas.nodeLabels.input'))
  return (
    <CanvasIOActionCard
      tone="sky"
      icon={LogIn}
      title={title}
      subtitle={`${order ? `#${order} · ` : ''}${t('canvas.nodeLabels.input')} · ${paramTypeText(port.type, t)}`}
      status={nodeStatusLabel(status)}
      selected={selected}
      port={{
        id: port.id,
        label: portLabelText(port, t),
        type: 'source',
        side: 'right',
        dataType: paramTypeText(port.type, t),
        required: port.required,
      }}
      metaItems={[
        { id: 'type', label: t('canvas.nodePanel.paramType'), value: paramTypeText(data.paramType ?? 'text', t) },
      ]}
      editableFields={{
        nameLabel: t('canvas.nodePanel.paramName'),
        nameValue: data.paramName ?? 'input',
        namePlaceholder: 'input',
        orderLabel: t('canvas.nodePanel.paramOrder', { defaultValue: 'Order' }),
        orderValue: order,
        typeLabel: t('canvas.nodePanel.paramType'),
        typeValue: data.paramType ?? 'text',
        typeOptions: WORKFLOW_RUNTIME_PARAM_TYPES.map((type) => ({ value: type, label: paramTypeText(type, t) })),
        onNameChange: (event) => data.onUpdateParamName?.(event.target.value),
        onOrderChange: (event) => updatePositiveOrder(event.target.value, data.onUpdateParamOrder),
        onTypeChange: (event) => data.onUpdateParamType?.(event.target.value as CanvasParamType),
      }}
      state={state}
      stateLabel={hasValue ? t('canvas.generated') : t('canvas.fillAtRuntime')}
      bodyLabel={t('canvas.nodeLabels.input')}
      bodyValue={data.inputValue}
      emptyLabel={t('canvas.fillAtRuntime')}
      primaryAction={data.onRun ? { id: 'run', label: isRunning ? t('canvas.running') : t('shared.generation.runNode'), icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
      renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
    />
  )
}

export function OutputNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const port = workflowOutputInputPorts(data)[0]
  const hasOutput = !!data.resource || status === 'done'
  const isRunning = status === 'pending' || status === 'running'
  const state = ioStateFromStatus(status, hasOutput)
  const order = data.paramOrder
  const outputType = workflowOutputParamType(data.paramType)
  const title = data.paramName || data.label || (order ? `${t('canvas.nodeLabels.output')} ${order}` : t('canvas.nodeLabels.output'))
  return (
    <CanvasIOActionCard
      tone="emerald"
      icon={LogOut}
      title={title}
      subtitle={`${order ? `#${order} · ` : ''}${t('canvas.nodeLabels.output')} · ${paramTypeText(port.type, t)}`}
      status={nodeStatusLabel(status)}
      selected={selected}
      port={{
        id: port.id,
        label: portLabelText(port, t),
        type: 'target',
        side: 'left',
        dataType: paramTypeText(port.type, t),
        required: port.required,
      }}
      metaItems={[
        { id: 'type', label: t('canvas.nodePanel.paramType'), value: paramTypeText(outputType, t) },
      ]}
      editableFields={{
        nameLabel: t('canvas.nodePanel.paramName'),
        nameValue: data.paramName ?? 'output',
        namePlaceholder: 'output',
        orderLabel: t('canvas.nodePanel.paramOrder', { defaultValue: 'Order' }),
        orderValue: order,
        typeLabel: t('canvas.nodePanel.paramType'),
        typeValue: outputType,
        typeOptions: WORKFLOW_RUNTIME_PARAM_TYPES.map((type) => ({ value: type, label: paramTypeText(type, t) })),
        onNameChange: (event) => data.onUpdateParamName?.(event.target.value),
        onOrderChange: (event) => updatePositiveOrder(event.target.value, data.onUpdateParamOrder),
        onTypeChange: (event) => data.onUpdateParamType?.(event.target.value as CanvasParamType),
      }}
      state={state}
      stateLabel={hasOutput ? t('canvas.generated') : t('canvas.waitingUpstream')}
      bodyLabel={t('canvas.nodeLabels.output')}
      bodyValue={data.resource?.name}
      emptyLabel={t('canvas.waitingUpstream')}
      primaryAction={data.onRun ? { id: 'run', label: isRunning ? t('canvas.running') : t('shared.generation.runNode'), icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
      renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
    />
  )
}

export function ResourceSinkNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const port = resourceSinkPorts().inputs[0]
  const hasOutput = !!data.resource || status === 'done'
  const isRunning = status === 'pending' || status === 'running'
  const state = ioStateFromStatus(status, hasOutput)
  return (
    <CanvasIOActionCard
      tone="amber"
      icon={HardDrive}
      title={data.label || t('canvas.nodeLabels.resource_sink')}
      subtitle={`${t('canvas.nodeLabels.resource_sink')} · ${paramTypeText(port.type, t)}`}
      status={nodeStatusLabel(status)}
      selected={selected}
      port={{
        id: port.id,
        label: portLabelText(port, t),
        type: 'target',
        side: 'left',
        dataType: paramTypeText(port.type, t),
        required: port.required,
      }}
      metaItems={[
        { id: 'filename', label: t('canvas.nodePanel.paramName'), value: data.paramName || t('canvas.nodePanel.randomFileName') },
        { id: 'target', label: t('canvas.nodeLabels.resource_sink'), value: t('canvas.resourceSaved') },
      ]}
      state={state}
      stateLabel={hasOutput ? t('canvas.resourceSaved') : t('canvas.waitingUpstream')}
      bodyLabel={t('canvas.nodeLabels.resource_sink')}
      bodyValue={data.resource?.name ?? (hasOutput ? data.paramName : undefined)}
      emptyLabel={t('canvas.waitingUpstream')}
      primaryAction={data.onRun ? { id: 'run', label: isRunning ? t('canvas.running') : t('canvas.nodePanel.saveResource'), icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
      renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
    />
  )
}

export function ApprovalNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const approvalStatus = data.approvalStatus ?? 'waiting'
  return (
    <CanvasNodeCard selected={selected}>
      <CanvasNodeCardHeader
        icon={<UserCheck size={12} />}
        label={data.label || t('canvas.nodeLabels.approval')}
        tone="warning"
        actions={approvalStatus === 'waiting' ? (
          <CanvasNodeApprovalStatus tone="warning" compact>{t('canvas.approval.waiting')}</CanvasNodeApprovalStatus>
        ) : undefined}
      />
      <SemanticPortRows nodeType="approval" />
      <CanvasNodeCardBody>
        {approvalStatus === 'approved' && (
          <CanvasNodeApprovalStatus tone="success" icon={<Check size={10} />}>{t('canvas.approval.approved')}</CanvasNodeApprovalStatus>
        )}
        {approvalStatus === 'rejected' && (
          <CanvasNodeApprovalStatus tone="danger" icon={<X size={10} />}>{t('canvas.approval.rejected')}</CanvasNodeApprovalStatus>
        )}
        {approvalStatus === 'waiting' && (
          <CanvasNodeApprovalActions>
            <CanvasNodeApprovalActionButton
              actionTone="success"
              onMouseDown={e => { e.stopPropagation(); data.onApprove?.() }}
            >
              <Check size={10} /> {t('canvas.approval.approve')}
            </CanvasNodeApprovalActionButton>
            <CanvasNodeApprovalActionButton
              actionTone="danger"
              onMouseDown={e => { e.stopPropagation(); data.onReject?.() }}
            >
              <X size={10} /> {t('canvas.approval.reject')}
            </CanvasNodeApprovalActionButton>
          </CanvasNodeApprovalActions>
        )}
      </CanvasNodeCardBody>
    </CanvasNodeCard>
  )
}
