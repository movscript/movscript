import type { AgentRun } from '../../state/shared/types.js'
import type { VideoFrameExtraction, VideoFrameExtractionMode, VideoFrameOutputLayout } from '../../media/video/videoFrameExtraction.js'

export interface CoreVideoFrameExtractionPort {
  extract(input: {
    run: AgentRun
    resourceId: number
    count: number
    timestampsSec?: number[]
    mode?: VideoFrameExtractionMode
    startSec?: number
    endSec?: number
    centerSec?: number
    windowSec?: number
    fps?: number
    intervalSec?: number
    maxFrames?: number
    outputLayout?: VideoFrameOutputLayout
    maxWidth: number
    imageFormat: 'jpeg' | 'png'
    signal?: AbortSignal
  }): Promise<VideoFrameExtraction>
}
