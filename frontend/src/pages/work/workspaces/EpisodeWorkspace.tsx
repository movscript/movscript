import { EpisodeDetail } from '@/components/detail'
import type { Episode } from '@/types'

export function EpisodeWorkspace({ episode }: { episode: Episode }) {
  return <EpisodeDetail episode={episode} />
}
