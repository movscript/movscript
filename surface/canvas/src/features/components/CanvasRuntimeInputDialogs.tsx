import type { Dispatch, SetStateAction } from 'react'
import type { Node } from '@xyflow/react'
import type { TFunction } from 'i18next'
import {
  CanvasRuntimeInputDialogActionButton,
  CanvasRuntimeInputDialogActions,
  CanvasRuntimeInputDialogBody,
  CanvasRuntimeInputDialogCheckbox,
  CanvasRuntimeInputDialogField,
  CanvasRuntimeInputDialogFieldLabel,
  CanvasRuntimeInputDialogHeader,
  CanvasRuntimeInputDialogInput,
  CanvasRuntimeInputDialogShell,
  CanvasRuntimeInputDialogTextarea,
} from '../ui/CanvasWorkflowUi'

import { portForWorkflowInputNode } from '../runtime/runtimeValues'
import type { CanvasPortDef } from '@movscript/shared'

export function CanvasRuntimeInputDialogs({
  inputNodes,
  inputValues,
  nodeRunDialog,
  nodeRunValues,
  runDialogOpen,
  setInputValues,
  setNodeRunValues,
  onCancelNodeRun,
  onCancelRun,
  onConfirmNodeRun,
  onConfirmRun,
  t,
}: {
  inputNodes: Node[]
  inputValues: Record<string, string>
  nodeRunDialog: { nodeId: string; ports: CanvasPortDef[] } | null
  nodeRunValues: Record<string, string>
  runDialogOpen: boolean
  setInputValues: Dispatch<SetStateAction<Record<string, string>>>
  setNodeRunValues: Dispatch<SetStateAction<Record<string, string>>>
  onCancelNodeRun: () => void
  onCancelRun: () => void
  onConfirmNodeRun: () => void
  onConfirmRun: () => void
  t: TFunction
}) {
  return (
    <>
      {runDialogOpen && (
        <CanvasRuntimeInputDialogShell>
          <CanvasRuntimeInputDialogHeader
            title={t('canvas.workflowInputTitle')}
            description={t('canvas.editor.workflowInputDescription')}
          />
          <CanvasRuntimeInputDialogBody>
            {inputNodes.map((node, index) => {
              const port = portForWorkflowInputNode(node)
              return (
                <CanvasRuntimeInputField
                  key={node.id}
                  autoFocus={index === 0}
                  port={port}
                  value={inputValues[node.id] ?? ''}
                  onChange={(value) => setInputValues((prev) => ({ ...prev, [node.id]: value }))}
                  t={t}
                />
              )
            })}
          </CanvasRuntimeInputDialogBody>
          <CanvasRuntimeInputDialogActions>
            <CanvasRuntimeInputDialogActionButton onClick={onConfirmRun} stretch>
              {t('canvas.startRun')}
            </CanvasRuntimeInputDialogActionButton>
            <CanvasRuntimeInputDialogActionButton
              variant="outline"
              onClick={onCancelRun}
            >
              {t('common.cancel')}
            </CanvasRuntimeInputDialogActionButton>
          </CanvasRuntimeInputDialogActions>
        </CanvasRuntimeInputDialogShell>
      )}

      {nodeRunDialog && (
        <CanvasRuntimeInputDialogShell size="node">
          <CanvasRuntimeInputDialogHeader
            title={t('canvas.editor.nodeRuntimeInputTitle', { defaultValue: 'Runtime inputs' })}
            description={t('canvas.editor.nodeRuntimeInputDescription', { defaultValue: 'Provide values for unconnected input ports before running this node.' })}
          />
          <CanvasRuntimeInputDialogBody>
            {nodeRunDialog.ports.map((port, index) => (
              <CanvasRuntimeInputField
                key={port.id}
                autoFocus={index === 0}
                port={port}
                required={port.required}
                value={nodeRunValues[port.id] ?? ''}
                onChange={(value) => setNodeRunValues((prev) => ({ ...prev, [port.id]: value }))}
                t={t}
              />
            ))}
          </CanvasRuntimeInputDialogBody>
          <CanvasRuntimeInputDialogActions>
            <CanvasRuntimeInputDialogActionButton onClick={onConfirmNodeRun} stretch>
              {t('shared.generation.runNode')}
            </CanvasRuntimeInputDialogActionButton>
            <CanvasRuntimeInputDialogActionButton
              variant="outline"
              onClick={onCancelNodeRun}
            >
              {t('common.cancel')}
            </CanvasRuntimeInputDialogActionButton>
          </CanvasRuntimeInputDialogActions>
        </CanvasRuntimeInputDialogShell>
      )}
    </>
  )
}

function CanvasRuntimeInputField({
  autoFocus,
  onChange,
  port,
  required,
  t,
  value,
}: {
  autoFocus: boolean
  onChange: (value: string) => void
  port: CanvasPortDef
  required?: boolean
  t: TFunction
  value: string
}) {
  const label = port.labelKey ? t(port.labelKey, { defaultValue: port.label ?? port.id }) : (port.label ?? port.id)

  return (
    <CanvasRuntimeInputDialogField>
      <CanvasRuntimeInputDialogFieldLabel label={label} portType={port.type} required={required} />
      {port.type === 'boolean' ? (
        <CanvasRuntimeInputDialogCheckbox
          checked={value === 'true'}
          onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
          inputProps={{ autoFocus }}
        >
          {t('canvas.editor.booleanEnabled', { defaultValue: 'Enabled' })}
        </CanvasRuntimeInputDialogCheckbox>
      ) : port.type === 'number' ? (
        <CanvasRuntimeInputDialogInput
          type="number"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoFocus={autoFocus}
        />
      ) : port.type === 'json' ? (
        <CanvasRuntimeInputDialogTextarea
          rows={5}
          code
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoFocus={autoFocus}
        />
      ) : port.type === 'image' || port.type === 'video' || port.type === 'resource' ? (
        <CanvasRuntimeInputDialogInput
          type="number"
          min={1}
          step={1}
          placeholder={t('canvas.editor.resourceIdPlaceholder', { defaultValue: 'Resource ID' })}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoFocus={autoFocus}
        />
      ) : (
        <CanvasRuntimeInputDialogTextarea
          rows={3}
          placeholder={t('canvas.inputContentPlaceholder')}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoFocus={autoFocus}
        />
      )}
    </CanvasRuntimeInputDialogField>
  )
}
