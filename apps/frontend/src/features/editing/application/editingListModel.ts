import type {
  ElectronMediaEditingProjectStoreResult,
  ElectronMediaPipelineEditingProject,
} from '@/shared/contracts/electronApiMedia'
import type { EditingProjectSummary } from '@/features/app-shell/application/editingProjectRegistry'

export const STANDALONE_EDITING_PROJECT_ID = 'standalone'
export const EDITING_CANVAS_PRESETS = [
  { id: '16:9', label: '16:9 横屏', width: 1920, height: 1080 },
  { id: '9:16', label: '9:16 竖屏', width: 1080, height: 1920 },
  { id: '1:1', label: '1:1 方形', width: 1080, height: 1080 },
  { id: '4:5', label: '4:5 信息流', width: 1080, height: 1350 },
] as const

export type EditingCanvasPresetId = (typeof EDITING_CANVAS_PRESETS)[number]['id']

export type EditingListState =
  | { status: 'idle'; message?: string }
  | { status: 'creating'; message?: string }
  | { status: 'error'; message: string }

export function createEmptyEditingProject(
  title: string,
  canvas: Pick<(typeof EDITING_CANVAS_PRESETS)[number], 'width' | 'height'>,
): ElectronMediaPipelineEditingProject {
  const now = new Date().toISOString()
  const id = `editing_project_${Date.now()}`
  return {
    version: 1,
    id,
    projectId: STANDALONE_EDITING_PROJECT_ID,
    title: title.trim() || '未命名剪辑',
    source: { kind: 'manual' },
    timeline: {
      version: 1,
      id: `timeline_${id}`,
      fps: 24,
      width: canvas.width,
      height: canvas.height,
      background: '#000000',
      durationMs: 0,
      tracks: [],
    },
    assets: { assets: [] },
    createdAt: now,
    updatedAt: now,
    revision: 0,
  }
}

export function editingProjectStoreResultToSummary(result: ElectronMediaEditingProjectStoreResult): EditingProjectSummary {
  return {
    id: result.editingProject.id,
    projectId: result.editingProject.projectId,
    title: result.editingProject.title,
    updatedAt: result.editingProject.updatedAt ?? new Date().toISOString(),
    projectPath: result.projectPath,
    snapshot: result.editingProject,
  }
}

export function formatEditingListProjectTime(value: string) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}
