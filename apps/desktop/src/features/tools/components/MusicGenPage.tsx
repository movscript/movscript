import { ToolDialog } from './ToolDialog'
import { useTranslation } from 'react-i18next'

export default function MusicGenPage() {
  const { t } = useTranslation()

  return (
    <ToolDialog
      nodeType="audio_music"
      capability="audio_music"
      jobType="audio_music"
      toolName={t('tools.defs.musicGen.name')}
      toolDescription={t('tools.defs.musicGen.description')}
      inputType="none"
      outputType="audio"
      promptPlaceholder={t('tools.defs.musicGen.promptPlaceholder')}
    />
  )
}
