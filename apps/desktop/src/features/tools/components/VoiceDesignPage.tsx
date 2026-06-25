import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'

export default function VoiceDesignPage() {
  const { t } = useTranslation()

  return (
    <ToolDialog
      nodeType="voice_design"
      capability="voice_design"
      jobType="voice_design"
      toolName={t('tools.defs.voiceDesign.name')}
      toolDescription={t('tools.defs.voiceDesign.description')}
      inputType="none"
      outputType="text"
      submitPromptFallback={t('tools.defs.voiceDesign.submitPromptFallback')}
      promptPlaceholder={t('tools.defs.voiceDesign.promptPlaceholder')}
    />
  )
}
