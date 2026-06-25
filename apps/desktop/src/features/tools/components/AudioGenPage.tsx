import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'

export default function AudioGenPage() {
  const { t } = useTranslation()

  return (
    <ToolDialog
      nodeType="audio_tts"
      capability="audio_tts"
      jobType="audio_tts"
      toolName={t('tools.defs.audioGen.name')}
      toolDescription={t('tools.defs.audioGen.description')}
      inputType="none"
      outputType="audio"
      promptPlaceholder={t('tools.defs.audioGen.promptPlaceholder')}
    />
  )
}
