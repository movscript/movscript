import { NativeSelect } from '@movscript/ui/primitives'
import type { PublicModel } from '@/types'
import { publicModelId } from '@/shared/domain/modelDisplay'

export interface AgentComposerModelSelectorProps {
  disabled?: boolean
  modelOptions: PublicModel[]
  modelValue?: string | null
  onModelChange?: (modelId: string | null) => void
}

export function AgentComposerModelSelector({
  disabled,
  modelOptions,
  modelValue,
  onModelChange,
}: AgentComposerModelSelectorProps) {
  if (modelOptions.length === 0 || modelValue === undefined || !onModelChange) return null

  return (
    <NativeSelect
      controlSize="sm"
      value={modelValue === null ? 'auto' : modelValue}
      onChange={(event) => onModelChange(event.currentTarget.value === 'auto' ? null : event.currentTarget.value)}
      disabled={disabled}
      className="ai-agent-model-select h-7 max-w-[180px] min-w-0 type-tiny"
    >
      <option value="auto">Auto model - backend default</option>
      {modelOptions.map((model) => (
        <option key={publicModelId(model)} value={publicModelId(model)}>
          {agentComposerModelOptionLabel(model)}
        </option>
      ))}
    </NativeSelect>
  )
}

function agentComposerModelId(model: PublicModel): string {
  return publicModelId(model)
}

function agentComposerModelOptionLabel(model: PublicModel): string {
  const modelId = agentComposerModelId(model)
  return model.provider_name ? `${modelId} - ${model.provider_name}` : modelId
}
