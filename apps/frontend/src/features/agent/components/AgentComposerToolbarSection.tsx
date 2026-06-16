import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { AtSign, Check, ChevronDown, CircleDot, CircleStop, Eye, Hand, Loader2, Mic, Paperclip, Plus, Send, Sparkles } from 'lucide-react'
import {
  AgentComposerAction,
  AgentComposerSubmit,
  AgentComposerToolbar,
} from '@/shared/ui/AgentComposerUi'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@movscript/ui/primitives'
import {
  AGENT_RUN_PROFILE_PRESETS,
  type AgentRunProfilePresetId,
} from '@/features/agent/domain/agentRunProfilePreset'
import { AgentComposerModelSelector } from '@/features/agent/components/AgentComposerModelSelector'
import type { PublicModel } from '@/types'

interface WorkspaceContextOption {
  value: string
  label: string
  meta?: string
}

interface AgentComposerToolbarSectionProps {
  actionMenuDisabled: boolean
  answeringPendingInput: boolean
  buildingSendWorkspace: boolean
  canStopActiveRun: boolean
  canSubmit: boolean
  collaborationMode: 'default' | 'plan'
  composerAttachmentsCount: number
  debugBeforeSend: boolean
  fileRef: RefObject<HTMLInputElement>
  goalModeEnabled: boolean
  loading: boolean
  modelOptions: PublicModel[]
  modelValue?: number | null
  profilePresetId: AgentRunProfilePresetId
  runProfile: { id: AgentRunProfilePresetId; label: string; description: string }
  showApprovalPresetSelector: boolean
  showAttachmentTools: boolean
  showDebugPreview: boolean
  showMentionTools: boolean
  showWorkspaceSelector: boolean
  stoppingActiveRun: boolean
  uploading: boolean
  workspaceProjectLocked: boolean
  workspaceProjectOptions: WorkspaceContextOption[]
  workspaceProjectValue?: string
  workspaceProjectsLoading: boolean
  addMentionTrigger: () => void
  onCollaborationModeChange?: (mode: 'default' | 'plan') => void
  onDebugBeforeSendChange: (next: boolean) => void
  onGoalModeEnabledChange?: (enabled: boolean) => void
  onModelChange?: (modelId: number | null) => void
  onProfilePresetChange: (profilePresetId: AgentRunProfilePresetId) => void
  onStopActiveRun: () => void
  onWorkspaceProjectChange?: (value: string) => void
}

export function AgentComposerToolbarSection({
  actionMenuDisabled,
  answeringPendingInput,
  buildingSendWorkspace,
  canStopActiveRun,
  canSubmit,
  collaborationMode,
  composerAttachmentsCount,
  debugBeforeSend,
  fileRef,
  goalModeEnabled,
  loading,
  modelOptions,
  modelValue,
  profilePresetId,
  runProfile,
  showApprovalPresetSelector,
  showAttachmentTools,
  showDebugPreview,
  showMentionTools,
  showWorkspaceSelector,
  stoppingActiveRun,
  uploading,
  workspaceProjectLocked,
  workspaceProjectOptions,
  workspaceProjectValue,
  workspaceProjectsLoading,
  addMentionTrigger,
  onCollaborationModeChange,
  onDebugBeforeSendChange,
  onGoalModeEnabledChange,
  onModelChange,
  onProfilePresetChange,
  onStopActiveRun,
  onWorkspaceProjectChange,
}: AgentComposerToolbarSectionProps) {
  const { t } = useTranslation()
  const workspaceSelectorDisabled = answeringPendingInput || buildingSendWorkspace || loading
  const selectedWorkspaceProjectOption = showWorkspaceSelector
    ? workspaceProjectOptions.find((option) => option.value === workspaceProjectValue)
    : undefined
  const selectedWorkspaceProjectLabel = selectedWorkspaceProjectOption
    ? selectedWorkspaceProjectOption.label
    : workspaceProjectValue
  const selectedWorkspaceProjectTitle = selectedWorkspaceProjectOption
    ? [selectedWorkspaceProjectOption.label, selectedWorkspaceProjectOption.meta].filter(Boolean).join(' / ')
    : workspaceProjectValue
  const runProfileDisplayLabel = runProfile.id === 'default' ? '默认权限' : runProfile.label

  return (
    <AgentComposerToolbar>
      <div className="ms-agent-composer__toolstrip flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {showAttachmentTools || showMentionTools || onCollaborationModeChange || onGoalModeEnabledChange ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <AgentComposerAction
                disabled={actionMenuDisabled}
                aria-label="Composer actions"
                title="Composer actions"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
              </AgentComposerAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="min-w-72">
              <DropdownMenuLabel>Input Controls</DropdownMenuLabel>
              {showAttachmentTools ? (
                <DropdownMenuItem
                  onSelect={() => fileRef.current?.click()}
                  disabled={uploading || loading || buildingSendWorkspace}
                  className="gap-2"
                >
                  <Paperclip size={14} />
                  <span>{t('agents.chat.uploadAttachment')}</span>
                </DropdownMenuItem>
              ) : null}
              {showMentionTools ? (
                <DropdownMenuItem
                  onSelect={addMentionTrigger}
                  disabled={buildingSendWorkspace}
                  className="gap-2"
                >
                  <AtSign size={14} />
                  <span>{t('shared.genInput.mention')}</span>
                </DropdownMenuItem>
              ) : null}
              {(showAttachmentTools || showMentionTools) && (onCollaborationModeChange || onGoalModeEnabledChange) ? <DropdownMenuSeparator /> : null}
              {onCollaborationModeChange ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    onCollaborationModeChange(collaborationMode === 'plan' ? 'default' : 'plan')
                  }}
                  className="gap-2"
                >
                  <span className="flex w-4 justify-center">{collaborationMode === 'plan' ? <Check size={14} /> : null}</span>
                  <Sparkles size={14} />
                  <span>计划模式</span>
                </DropdownMenuItem>
              ) : null}
              {onGoalModeEnabledChange ? (
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    onGoalModeEnabledChange(!goalModeEnabled)
                  }}
                  className="gap-2"
                >
                  <span className="flex w-4 justify-center">{goalModeEnabled ? <Check size={14} /> : null}</span>
                  <CircleDot size={14} />
                  <span>追求目标</span>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {showApprovalPresetSelector && !answeringPendingInput ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ms-control ms-agent-composer__approval-trigger"
                disabled={loading || buildingSendWorkspace || uploading}
                aria-label={`Run profile: ${runProfile.label}`}
                title={`Run profile: ${runProfile.label}`}
              >
                <Hand size={15} />
                <span>{runProfileDisplayLabel}</span>
                <ChevronDown size={12} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="min-w-64">
              <DropdownMenuLabel>Run Profile</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {AGENT_RUN_PROFILE_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onSelect={() => onProfilePresetChange(preset.id)}
                  className="items-start gap-2"
                >
                  <span className="mt-0.5 flex w-3 justify-center text-muted-foreground">
                    {preset.id === profilePresetId ? <Check size={12} /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block type-tiny font-medium text-foreground">{preset.id === 'default' ? '默认权限' : preset.label}</span>
                    <span className="block whitespace-normal type-tiny text-muted-foreground">{preset.description}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {(showApprovalPresetSelector && !answeringPendingInput) || collaborationMode === 'plan' || goalModeEnabled ? (
          <span className="ms-agent-composer__toolbar-divider" aria-hidden="true" />
        ) : null}
        {collaborationMode === 'plan' ? (
          <span
            className="ms-control ms-agent-composer__goal-trigger"
            data-active="true"
            aria-label="计划模式已开启"
            title="计划模式已开启"
          >
            <Sparkles size={15} />
            <span>计划</span>
          </span>
        ) : null}
        {goalModeEnabled ? (
          <span
            className="ms-control ms-agent-composer__goal-trigger"
            data-active="true"
            aria-label="目标模式已开启"
            title="目标模式已开启"
          >
            <CircleDot size={15} />
            <span>目标</span>
          </span>
        ) : null}
        {showWorkspaceSelector && workspaceProjectLocked ? (
          <span
            className="ms-agent-composer__workspace-select h-7 max-w-[128px] min-w-0 truncate px-2 type-tiny"
            title={selectedWorkspaceProjectTitle || '选择范围'}
          >
            {selectedWorkspaceProjectLabel || '选择范围'}
          </span>
        ) : showWorkspaceSelector ? (
          <Select
            value={workspaceProjectValue}
            onValueChange={onWorkspaceProjectChange}
            disabled={workspaceSelectorDisabled || workspaceProjectsLoading}
          >
            <SelectTrigger
              size="sm"
              className="ms-agent-composer__workspace-select h-7 max-w-[128px] min-w-0 type-tiny"
              title={selectedWorkspaceProjectTitle || (workspaceProjectsLoading ? '读取项目...' : '选择范围')}
            >
              <span className="min-w-0 truncate">
                {workspaceProjectsLoading ? '读取项目...' : selectedWorkspaceProjectLabel || '选择范围'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {workspaceProjectOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{option.label}</span>
                    {option.meta ? <span className="truncate text-muted-foreground">{option.meta}</span> : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {composerAttachmentsCount > 0 && (
          <Badge className="max-w-24 truncate type-tiny">
            {t('agents.chat.attachmentsCount', { count: composerAttachmentsCount })}
          </Badge>
        )}
        {showDebugPreview ? (
          <Button
            type="button"
            size="sm"
            variant={debugBeforeSend ? 'soft' : 'ghost'}
            onClick={() => onDebugBeforeSendChange(!debugBeforeSend)}
            disabled={answeringPendingInput}
            className="ms-agent-composer__debug-action agent-composer-debug-action px-2 type-tiny"
            title={t('agents.chat.previewPayload')}
          >
            <Eye size={12} />
            {t('agents.chat.debugPreview')}
          </Button>
        ) : null}
        {canStopActiveRun && (
          <AgentComposerAction
            onClick={onStopActiveRun}
            disabled={stoppingActiveRun}
            aria-label={t('agents.chat.stop')}
            title={t('agents.chat.stop')}
          >
            {stoppingActiveRun ? <Loader2 size={14} className="animate-spin" /> : <CircleStop size={14} />}
          </AgentComposerAction>
        )}
      </div>
      <div className="ms-agent-composer__submit-group">
        <AgentComposerModelSelector
          modelOptions={modelOptions}
          modelValue={modelValue}
          onModelChange={onModelChange}
          disabled={loading || buildingSendWorkspace || answeringPendingInput}
        />
        <button
          type="button"
          className="ms-control ms-agent-composer__voice-action"
          disabled
          aria-label="语音输入"
          title="语音输入"
        >
          <Mic size={15} />
        </button>
        <AgentComposerSubmit
          type="submit"
          running={loading || buildingSendWorkspace}
          disabled={!canSubmit}
          label={answeringPendingInput ? '回答' : debugBeforeSend ? t('agents.chat.preview') : t('common.send')}
        >
          {stoppingActiveRun
            ? <Loader2 size={14} className="animate-spin" />
            : buildingSendWorkspace
              ? <Loader2 size={14} className="animate-spin" />
              : debugBeforeSend && !loading ? <Eye size={14} /> : <Send size={14} />}
        </AgentComposerSubmit>
      </div>
    </AgentComposerToolbar>
  )
}
