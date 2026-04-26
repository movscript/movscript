import { StoryboardDetail } from '@/components/detail'
import type { Storyboard } from '@/types'

export function StoryboardWorkspace({ storyboard }: { storyboard: Storyboard }) {
  return <StoryboardDetail storyboard={storyboard} />
}
