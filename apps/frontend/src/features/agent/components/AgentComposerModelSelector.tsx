import { IdentityMark } from '@/features/agent/components/AgentIdentityUi'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@movscript/ui/primitives'
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

  const selectedModel = modelValue ? modelOptions.find((model) => publicModelId(model) === modelValue) : undefined
  const selectedModelId = selectedModel ? agentComposerModelId(selectedModel) : undefined

  return (
    <Select
      value={modelValue === null ? 'auto' : modelValue}
      onValueChange={(value) => onModelChange(value === 'auto' ? null : value)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="ai-agent-model-select h-7 max-w-[180px] min-w-0 type-tiny">
        <span className="ai-agent-model-select__value">
          <span className="ai-agent-model-select__id">{selectedModelId ?? 'Auto model'}</span>
        </span>
      </SelectTrigger>
      <SelectContent align="end" className="ai-agent-model-select__content min-w-64">
        <SelectItem value="auto">
          <span className="ai-agent-model-select__option">
            <span className="ai-agent-model-select__option-copy">
              <span className="ai-agent-model-select__id">Auto model</span>
              <span className="ai-agent-model-select__meta">backend default</span>
            </span>
          </span>
        </SelectItem>
        {modelOptions.map((model) => (
          <SelectItem key={publicModelId(model)} value={publicModelId(model)}>
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
  return publicModelId(model)
}
