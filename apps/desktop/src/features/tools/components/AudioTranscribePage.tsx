import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'

export default function AudioTranscribePage() {
  const { t } = useTranslation()

  return (
    <ToolDialog
      nodeType="audio_transcribe"
      capability="audio_transcribe"
      jobType="audio_transcribe"
      toolName={t('tools.defs.audioTranscribe.name')}
      toolDescription={t('tools.defs.audioTranscribe.description')}
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
      submitPromptFallback={t('tools.defs.audioTranscribe.submitPromptFallback')}
      promptPlaceholder={t('tools.defs.audioTranscribe.promptPlaceholder')}
    />
  )
}
