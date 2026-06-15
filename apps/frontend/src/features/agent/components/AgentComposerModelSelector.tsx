import { IdentityMark } from '@/features/agent/components/AgentIdentityUi'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@movscript/ui/primitives'
import type { PublicModel } from '@/types'

export interface AgentComposerModelSelectorProps {
  disabled?: boolean
  modelOptions: PublicModel[]
  modelValue?: number | null
  onModelChange?: (modelId: number | null) => void
}

export function AgentComposerModelSelector({
  disabled,
  modelOptions,
  modelValue,
  onModelChange,
}: AgentComposerModelSelectorProps) {
  if (modelOptions.length === 0 || modelValue === undefined || !onModelChange) return null

  const selectedModel = modelOptions.find((model) => model.id === modelValue) ?? modelOptions[0]
  const selectedModelId = selectedModel ? agentComposerModelId(selectedModel) : undefined

  return (
    <Select
      value={modelValue === null ? 'auto' : String(modelValue)}
      onValueChange={(value) => onModelChange(value === 'auto' ? null : Number(value))}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="ai-agent-model-select h-7 max-w-[180px] min-w-0 type-tiny">
        <span className="ai-agent-model-select__value">
          <span className="ai-agent-model-select__id">{selectedModelId ?? 'Auto model'}</span>
        </span>
      </SelectTrigger>
      <SelectContent align="end" className="min-w-64">
        <SelectItem value="auto">
          <span className="ai-agent-model-select__option">
            {selectedModelId ? <IdentityMark kind="model" id={selectedModelId} /> : null}
            <span className="ai-agent-model-select__option-copy">
              <span className="ai-agent-model-select__id">Auto model</span>
              <span className="ai-agent-model-select__meta">{selectedModelId ?? 'backend default'}</span>
            </span>
          </span>
        </SelectItem>
        {modelOptions.map((model) => (
          <SelectItem key={model.id} value={String(model.id)}>
            <span className="ai-agent-model-select__option">
              <IdentityMark kind="model" id={agentComposerModelId(model)} />
              <span className="ai-agent-model-select__option-copy">
                <span className="ai-agent-model-select__id">{agentComposerModelId(model)}</span>
                {model.provider_name ? <span className="ai-agent-model-select__meta">{model.provider_name}</span> : null}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function agentComposerModelId(model: PublicModel): string {
  return model.model_id?.trim() || model.logical_model_id?.trim() || model.model_def_id?.trim() || `model_config:${model.id}`
}
