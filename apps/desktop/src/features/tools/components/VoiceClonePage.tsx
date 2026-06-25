import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'

export default function VoiceClonePage() {
  const { t } = useTranslation()

  return (
    <ToolDialog
      nodeType="voice_clone"
      capability="voice_clone"
      jobType="voice_clone"
      toolName={t('tools.defs.voiceClone.name')}
      toolDescription={t('tools.defs.voiceClone.description')}
      inputType="audio"
      inputSlots={[
        {
          key: 'source_audio',
          label: t('tools.inputs.sourceAudio', { defaultValue: '源音频' }),
          type: 'audio',
          required: true,
          maxCount: 0,
        },
      ]}
      outputType="text"
      submitPromptFallback={t('tools.defs.voiceClone.submitPromptFallback')}
      promptPlaceholder={t('tools.defs.voiceClone.promptPlaceholder')}
    />
  )
}
