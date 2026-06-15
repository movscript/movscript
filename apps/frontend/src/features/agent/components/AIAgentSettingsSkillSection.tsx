import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Save } from 'lucide-react'
import {
  AgentSettingsActionButton,
  AgentSettingsActionRow,
  AgentSettingsCallout,
  AgentSettingsFieldLabel,
  AgentSettingsFormField,
  AgentSettingsFormGrid,
  AgentSettingsIcon,
  AgentSettingsInlineNote,
  AgentSettingsInput,
  AgentSettingsIssueList,
  AgentSettingsKeyValue,
  AgentSettingsSelectTrigger,
  AgentSettingsStack,
  AgentSettingsStateMessage,
} from '@movscript/ui/business/agent'
import { AppInlineError } from '@movscript/ui/business/app'
import { Select, SelectContent, SelectItem, SelectValue } from '@movscript/ui/primitives'
import type { SkillConfigWorkspace } from '@movscript/core/agent'
import { AgentSettingsConfigFileEditorSection } from '@/features/agent/components/AgentSettingsConfigFileUi'
import type { ProviderCatalogSkill } from '@/shared/infrastructure/providerSessionClient'
import type { SkillConfigIssue } from '@/features/agent/application/agentSettingsReadiness'
import { SKILL_SOURCE_FILTERS, type SkillSourceFilter } from '@/features/agent/presentation/agentSettingsSkillModel'
import { SkillRow } from '@/features/agent/components/AIAgentSettingsPageParts'

export function AIAgentSettingsSkillSection({
  workspaceSkillIds,
  currentConfigFileName,
  skillSearch,
  setSkillSearch,
  skillSourceFilter,
  setSkillSourceFilter,
  filteredSkills,
  totalSkills,
  skillConfigIssues,
  selectedConfigFileEditable,
  hasSkillConfigSelectionChange,
  skillConfigSaving,
  onSave,
  onReset,
  hasSkillConfigChange,
  skillConfigSaveError,
  skillWorkspaceById,
  onWorkspaceChange,
}: {
  workspaceSkillIds: string[]
  currentConfigFileName: string
  skillSearch: string
  setSkillSearch: Dispatch<SetStateAction<string>>
  skillSourceFilter: SkillSourceFilter
  setSkillSourceFilter: Dispatch<SetStateAction<SkillSourceFilter>>
  filteredSkills: ProviderCatalogSkill[]
  totalSkills: number
  skillConfigIssues: SkillConfigIssue[]
  selectedConfigFileEditable: boolean
  hasSkillConfigSelectionChange: boolean
  skillConfigSaving: boolean
  onSave: () => void | Promise<void>
  onReset: () => void
  hasSkillConfigChange: boolean
  skillConfigSaveError: string | null
  skillWorkspaceById: Map<string, SkillConfigWorkspace>
  onWorkspaceChange: (id: string, enabled: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <AgentSettingsConfigFileEditorSection
      title={t('agents.settings.skillsPanel')}
      description={t('agents.settings.skillConfigEditHelp')}
      id="agent-settings-skills"
    >
      <AgentSettingsFormGrid columns="three">
        <AgentSettingsKeyValue label={t('agents.settings.configFileFields.skills')} value={workspaceSkillIds.length} />
        <AgentSettingsKeyValue label={t('agents.settings.skillConfigSelected')} value={workspaceSkillIds.length} />
        <AgentSettingsKeyValue label={t('agents.settings.configFileFields.current')} value={currentConfigFileName} />
      </AgentSettingsFormGrid>
      <AgentSettingsFormGrid columns="two" data-testid="agent-settings-skill-filters">
        <AgentSettingsFormField>
          <AgentSettingsFieldLabel>{t('agents.settings.skillFilters.search')}</AgentSettingsFieldLabel>
          <AgentSettingsInput
            value={skillSearch}
            onChange={(event) => setSkillSearch(event.target.value)}
            placeholder={t('agents.settings.toolPermissionsSearchPlaceholder')}
            data-testid="agent-settings-skill-search"
          />
        </AgentSettingsFormField>
        <AgentSettingsFormField>
          <AgentSettingsFieldLabel>{t('agents.settings.skillFilters.source')}</AgentSettingsFieldLabel>
          <Select value={skillSourceFilter} onValueChange={(value) => setSkillSourceFilter(value as SkillSourceFilter)}>
            <AgentSettingsSelectTrigger data-testid="agent-settings-skill-source-filter">
              <SelectValue />
            </AgentSettingsSelectTrigger>
            <SelectContent>
              {SKILL_SOURCE_FILTERS.map((filter) => (
                <SelectItem key={filter} value={filter}>{t(`agents.settings.skillSourceFilters.${filter}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </AgentSettingsFormField>
      </AgentSettingsFormGrid>
      <AgentSettingsInlineNote>
        {t('agents.settings.skillFilterResult', { count: filteredSkills.length, total: totalSkills })}
      </AgentSettingsInlineNote>
      {skillConfigIssues.length > 0 && (
        <AgentSettingsCallout tone="warning" compact data-testid="agent-settings-skill-config-issues">
          <AgentSettingsIssueList
            items={skillConfigIssues.map((issue) => (
              issue.type === 'dependency'
                ? t('agents.settings.skillConfigIssueDependency', { skillId: issue.skillId, dependencyId: issue.relatedSkillId })
                : t('agents.settings.skillConfigIssueConflict', { skillId: issue.skillId, conflictId: issue.relatedSkillId })
            ))}
          />
        </AgentSettingsCallout>
      )}
      <AgentSettingsActionRow>
        <AgentSettingsActionButton
          onClick={onSave}
          disabled={!selectedConfigFileEditable || !hasSkillConfigSelectionChange || skillConfigSaving || skillConfigIssues.length > 0}
          data-testid="agent-settings-save-skill-config"
        >
          {skillConfigSaving ? <AgentSettingsIcon icon={Loader2} size={14} spinning /> : <Save size={14} />}
          {hasSkillConfigSelectionChange ? t('agents.settings.saveSkillConfig') : t('agents.settings.skillConfigSaved')}
        </AgentSettingsActionButton>
        <AgentSettingsActionButton variant="outline" onClick={onReset} disabled={!selectedConfigFileEditable || !hasSkillConfigChange || skillConfigSaving}>
          {t('agents.settings.resetSkillConfig')}
        </AgentSettingsActionButton>
      </AgentSettingsActionRow>
      {skillConfigSaveError && <AppInlineError>{skillConfigSaveError}</AppInlineError>}
      {filteredSkills.length === 0 ? (
        <AgentSettingsStateMessage text={t('agents.settings.noSkills')} />
      ) : (
        <AgentSettingsStack data-testid="agent-settings-config-file-skill-activation">
          {filteredSkills.map((skill) => (
            <SkillRow
              key={skill.id}
              skill={skill}
              workspace={skillWorkspaceById.get(skill.id)}
              readOnly={!selectedConfigFileEditable}
              onWorkspaceChange={onWorkspaceChange}
            />
          ))}
        </AgentSettingsStack>
      )}
    </AgentSettingsConfigFileEditorSection>
  )
}
