import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AudioLines, FileText, Image as ImageIcon, Video } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'
import { ResourceLibraryView } from '@movscript/resource-surface/pages'
import type { InputSlotDef } from '@/shared/ui/GenInputCard'
import { ToolDialog } from './ToolDialog'
import {
  toolOperationById,
  toolOperationsForOutputKind,
  toolOutputKindDefaults,
  toolOutputKinds,
  type ToolOperationDef,
  type ToolOperationId,
  type ToolOutputKind,
} from '@/features/tools/application/toolOperationConfig'

interface UnifiedToolPageProps {
  initialOutputKind?: ToolOutputKind
  initialOperation?: ToolOperationId
  resourcePane?: ReactNode
}

const outputKindIcons = {
  image: ImageIcon,
  video: Video,
  audio: AudioLines,
  text: FileText,
} as const

const outputKindLabels: Record<ToolOutputKind, { key: string; fallback: string }> = {
  image: { key: 'tools.outputs.image', fallback: '图片' },
  video: { key: 'tools.outputs.video', fallback: '视频' },
  audio: { key: 'tools.outputs.audio', fallback: '音频' },
  text: { key: 'tools.outputs.text', fallback: '文本' },
}

export default function UnifiedToolPage({
  initialOutputKind,
  initialOperation,
  resourcePane,
}: UnifiedToolPageProps) {
  const { t } = useTranslation()
  const initial = useMemo(() => {
    if (initialOperation) return toolOperationById(initialOperation)
    const outputKind = initialOutputKind ?? 'image'
    return toolOperationById(toolOutputKindDefaults[outputKind])
  }, [initialOperation, initialOutputKind])
  const [outputKind, setOutputKind] = useState<ToolOutputKind>(initial.outputKind)
  const [operationId, setOperationId] = useState<ToolOperationId>(initial.id)
  const operations = toolOperationsForOutputKind(outputKind)
  const operation = operations.find((item) => item.id === operationId) ?? toolOperationById(toolOutputKindDefaults[outputKind])

  function selectOutputKind(nextOutputKind: ToolOutputKind) {
    setOutputKind(nextOutputKind)
    setOperationId(toolOutputKindDefaults[nextOutputKind])
  }

  const inputSlots = inputSlotsForOperation(operation, t)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {toolOutputKinds.map((kind) => {
            const Icon = outputKindIcons[kind]
            const label = t(outputKindLabels[kind].key, { defaultValue: outputKindLabels[kind].fallback })
            return (
              <Button
                key={kind}
                type="button"
                size="sm"
                variant={kind === outputKind ? 'soft' : 'outline'}
                aria-pressed={kind === outputKind}
                onClick={() => selectOutputKind(kind)}
              >
                <Icon size={14} />
                <span>{label}</span>
              </Button>
            )
          })}
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {operations.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={item.id === operation.id ? 'soft' : 'ghost'}
              aria-pressed={item.id === operation.id}
              onClick={() => setOperationId(item.id)}
            >
              {t(item.titleKey, { defaultValue: item.titleDefault })}
            </Button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ToolDialog
          key={operation.id}
          nodeType={operation.sourceKey}
          capability={operation.capability}
          modelQueryCapabilities={operation.modelQueryCapabilities}
          modelOperation={operation.modelOperation}
          jobType={operation.jobType}
          toolName={t(operation.titleKey, { defaultValue: operation.titleDefault })}
          toolDescription={t(operation.descriptionKey, { defaultValue: operation.descriptionDefault })}
          inputType={operation.inputType}
          inputSlots={inputSlots}
          outputType={operation.outputType}
          promptRequired={operation.promptRequired}
          submitPromptFallback={operation.submitPromptFallbackKey
            ? t(operation.submitPromptFallbackKey, { defaultValue: operation.submitPromptFallbackDefault })
            : undefined}
          promptPlaceholder={t(operation.promptPlaceholderKey, { defaultValue: operation.promptPlaceholderDefault })}
          layout={operation.layout}
          resourcePane={operation.useResourceWorkbench ? resourcePane ?? <ResourceLibraryView variant="pane" /> : undefined}
          showHistory
        />
      </div>
    </div>
  )
}

function inputSlotsForOperation(
  operation: ToolOperationDef,
  t: (key: string, options?: Record<string, unknown>) => string,
): InputSlotDef[] {
  return operation.inputSlots.map((slot) => ({
    key: slot.key,
    label: t(slot.labelKey, { defaultValue: slot.labelDefault }),
    type: slot.type,
    required: slot.required,
    maxCount: slot.maxCount,
  }))
}
