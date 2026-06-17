import { ChevronLeft, ChevronRight, History, Wand2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@movscript/ui/primitives'
import type { Job } from '@/types'
import {
  ToolDialogEmptyState,
  ToolDialogHistoryCount,
  ToolDialogHistoryHeader,
  ToolDialogHistoryList,
  ToolDialogHistoryPager,
  ToolDialogHistoryShell,
  ToolDialogHistoryTitle,
} from './ToolDialogUi'
import { GenerationCard, GenerationHistoryGridItem } from './ToolDialogJobPanels'

interface ToolDialogHistorySectionProps {
  jobs: Job[]
  historyPage: number
  historyPageCount: number
  historyTotal: number
  layout: 'default' | 'reference-workbench'
  outputType: 'image' | 'video' | 'audio'
  debugMode: boolean
  onPreviousPage: () => void
  onNextPage: () => void
  onReusePrompt: (prompt: string) => void
}

export function ToolDialogHistorySection({
  jobs,
  historyPage,
  historyPageCount,
  historyTotal,
  layout,
  outputType,
  debugMode,
  onPreviousPage,
  onNextPage,
  onReusePrompt,
}: ToolDialogHistorySectionProps) {
  const { t } = useTranslation()

  return (
    <ToolDialogHistoryShell>
      <ToolDialogHistoryHeader>
        <ToolDialogHistoryTitle icon={<History size={14} className="text-muted-foreground" />}>
          {t('shared.toolNode.generationHistory')}
        </ToolDialogHistoryTitle>
        {historyTotal > 0 && (
          <ToolDialogHistoryCount>
            {historyTotal}
          </ToolDialogHistoryCount>
        )}
        <div className="flex-1" />
        <ToolDialogHistoryPager>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('common.previousPage', { defaultValue: '上一页' })}
            disabled={historyPage <= 1}
            onClick={onPreviousPage}
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="tabular-nums">{historyPage}/{historyPageCount}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('common.nextPage', { defaultValue: '下一页' })}
            disabled={historyPage >= historyPageCount}
            onClick={onNextPage}
          >
            <ChevronRight size={14} />
          </Button>
        </ToolDialogHistoryPager>
      </ToolDialogHistoryHeader>

      {jobs.length === 0 ? (
        <ToolDialogEmptyState
          icon={Wand2}
          title={t('pages.jobs.empty')}
        />
      ) : (
        <ToolDialogHistoryList>
          {jobs.map((job) => (
            layout === 'reference-workbench' ? (
              <GenerationHistoryGridItem
                key={job.ID}
                job={job}
                onReuse={() => onReusePrompt(job.prompt)}
              />
            ) : (
              <GenerationCard
                key={job.ID}
                job={job}
                outputType={outputType}
                onReuse={() => onReusePrompt(job.prompt)}
                debugMode={debugMode}
              />
            )
          ))}
        </ToolDialogHistoryList>
      )}
    </ToolDialogHistoryShell>
  )
}
