import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'

export default function AudioChatPage() {
  const { t } = useTranslation()

  return (
    <ToolDialog
      nodeType="audio_chat"
      capability="audio_chat"
      jobType="audio_chat"
      toolName={t('tools.defs.audioChat.name')}
      toolDescription={t('tools.defs.audioChat.description')}
      inputType="audio"
      inputSlots={[
        {
          key: 'source_audio',
          label: t('tools.inputs.sourceAudio', { defaultValue: '源音频' }),
          type: 'audio',
          required: false,
          maxCount: 1,
        },
      ]}
      outputType="audio"
      promptPlaceholder={t('tools.defs.audioChat.promptPlaceholder')}
    />
  )
}
