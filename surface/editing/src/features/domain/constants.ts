import type { ElectronMediaPipelineClip } from '@movscript/editing-surface/contracts'

export const STANDALONE_EDITING_PROJECT_ID = 'standalone'
export const EDITING_ASSET_DRAG_TYPE = 'application/x-movscript-editing-asset'
export const EDITING_LAYOUT_STORAGE_KEY = 'movscript.editing-workspace.layout.v1'

export const EDITING_LIBRARY_DEFAULT_WIDTH = 300
export const EDITING_LIBRARY_MIN_WIDTH = 240
export const EDITING_LIBRARY_MAX_WIDTH = 460
export const EDITING_INSPECTOR_DEFAULT_WIDTH = 320
export const EDITING_INSPECTOR_MIN_WIDTH = 260
export const EDITING_INSPECTOR_MAX_WIDTH = 480
export const EDITING_TIMELINE_DEFAULT_HEIGHT = 230
export const EDITING_TIMELINE_MIN_HEIGHT = 160
export const EDITING_TIMELINE_MAX_HEIGHT = 360

export const EDITING_TIMELINE_MIN_CLIP_DURATION_MS = 200
export const EDITING_TIMELINE_SNAP_THRESHOLD_MS = 160
export const EDITING_AUTOSAVE_DELAY_MS = 1200
export const EDITING_TIMELINE_FRAME_CELL_MS = 1200
export const EDITING_TIMELINE_MIN_VISIBLE_MS = 1200
export const EDITING_TIMELINE_MAX_ZOOM = 32

export const EDITING_CANVAS_MIN_SIZE = 120
export const EDITING_CANVAS_MAX_SIZE = 7680
export const EDITING_CLIP_MIN_SCALE_PERCENT = 25
export const EDITING_CLIP_MAX_SCALE_PERCENT = 400

export const EDITING_CANVAS_PRESETS = [
  { id: '16:9', label: '16:9 横屏', width: 1920, height: 1080 },
  { id: '9:16', label: '9:16 竖屏', width: 1080, height: 1920 },
  { id: '1:1', label: '1:1 方形', width: 1080, height: 1080 },
  { id: '4:5', label: '4:5 信息流', width: 1080, height: 1350 },
] as const

export const EDITING_FIT_OPTIONS: Array<NonNullable<ElectronMediaPipelineClip['fit']>> = ['contain', 'cover', 'crop', 'none']
