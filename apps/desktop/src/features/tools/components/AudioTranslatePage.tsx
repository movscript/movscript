import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'

export default function AudioTranslatePage() {
  const { t } = useTranslation()

  return (
    <ToolDialog
      nodeType="audio_translate"
      capability="audio_translate"
      jobType="audio_translate"
      toolName={t('tools.defs.audioTranslate.name')}
      toolDescription={t('tools.defs.audioTranslate.description')}
      inputType="audio"
      inputSlots={[
        {
          key: 'source_audio',
          label: t('tools.inputs.sourceAudio', { defaultValue: '源音频' }),
          type: 'audio',
          required: true,
          maxCount: 1,
        },
      ]}
      outputType="text"
      promptRequired={false}
      submitPromptFallback={t('tools.defs.audioTranslate.submitPromptFallback')}
      promptPlaceholder={t('tools.defs.audioTranslate.promptPlaceholder')}
    />
  )
}
