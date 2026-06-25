import { useState, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  LayoutGrid,
  Video,
  Wand2,
} from 'lucide-react'
import type { Job } from '@/types'
import {
  JobsActionButton,
  JobsCategorySection,
  JobsCollection,
  JobsCountPill,
} from '@/features/jobs/components/JobsPageUi'
import { JobGridThumb, JobListCard } from '@/features/jobs/components/JobsPageCards'

export { JobDetailCard, JobGridThumb, JobListCard } from '@/features/jobs/components/JobsPageCards'

export type StatusFilter = 'all' | 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type JobsQueryResult = {
  jobs: Job[]
  total: number
}

type Category = {
  key: string
  labelKey: string
  icon: ReactNode
}

export const CATEGORIES: Category[] = [
  { key: 'all', labelKey: 'common.all', icon: <Wand2 size={14} /> },
  { key: 'image', labelKey: 'pages.jobs.categories.image', icon: <ImageIcon size={14} /> },
  { key: 'image_edit', labelKey: 'pages.jobs.categories.imageEdit', icon: <ImageIcon size={14} /> },
  { key: 'video', labelKey: 'pages.jobs.categories.video', icon: <Video size={14} /> },
  { key: 'video_i2v', labelKey: 'pages.jobs.categories.videoI2V', icon: <Video size={14} /> },
  { key: 'video_v2v', labelKey: 'pages.jobs.categories.videoV2V', icon: <Video size={14} /> },
  { key: 'canvas', labelKey: 'header.titles.canvases', icon: <LayoutGrid size={14} /> },
]

export const STATUS_FILTERS: Array<{ key: StatusFilter; labelKey: string }> = [
  { key: 'all', labelKey: 'pages.jobs.allStatuses' },
  { key: 'pending', labelKey: 'pages.jobs.status.pending' },
  { key: 'running', labelKey: 'pages.jobs.status.running' },
  { key: 'succeeded', labelKey: 'pages.jobs.status.succeeded' },
  { key: 'failed', labelKey: 'pages.jobs.status.failed' },
  { key: 'cancelled', labelKey: 'pages.jobs.status.cancelled' },
]

function getJobCategory(job: Job): string {
  if (job.job_type === 'canvas') return 'canvas'
  return job.job_type
}

export function filterJobs(jobs: Job[], category: string): Job[] {
  if (category === 'all') return jobs
  if (category === 'canvas') return jobs.filter((job) => job.job_type === 'canvas')
  return jobs.filter((job) => getJobCategory(job) === category)
}

export function CategorySection({
  label,
  jobs,
  viewMode,
  onCancel,
  onRetry,
  onSelect,
  cancellingId,
  retryingId,
  selectedJobId,
}: {
  label: string
  jobs: Job[]
  viewMode: 'grid' | 'list'
  onCancel: (id: number) => void
  onRetry: (id: number) => void
  onSelect: (id: number) => void
  cancellingId?: number
  retryingId?: number
  selectedJobId?: number | null
}) {
  const [open, setOpen] = useState(true)

  return (
    <JobsCategorySection
      control={(
        <JobsActionButton
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {label}
          <JobsCountPill>{jobs.length}</JobsCountPill>
        </JobsActionButton>
      )}
    >
      {open && (
        viewMode === 'grid' ? (
          <JobsCollection layout="grid">
            {jobs.map((job) => (
              <JobGridThumb
                key={job.ID}
                job={job}
                onCancel={onCancel}
                onRetry={onRetry}
                onSelect={onSelect}
                cancelling={cancellingId === job.ID}
                retrying={retryingId === job.ID}
                selected={selectedJobId === job.ID}
              />
            ))}
          </JobsCollection>
        ) : (
          <JobsCollection>
            {jobs.map((job) => (
              <JobListCard
                key={job.ID}
                job={job}
                onCancel={onCancel}
                onRetry={onRetry}
                onSelect={onSelect}
                cancelling={cancellingId === job.ID}
                retrying={retryingId === job.ID}
                selected={selectedJobId === job.ID}
              />
            ))}
          </JobsCollection>
        )
      )}
    </JobsCategorySection>
  )
}
