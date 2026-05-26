import { truncateLongText } from './utils'

export function summarizeProjectScripts(items: unknown[]): unknown[] {
  return items.map((item) => summarizeScript(item, { includeContent: false, contentLimit: 0 }))
}

export function summarizeScriptVersion(item: any): unknown {
  if (!item || typeof item !== 'object') return item
  const body = String(item.content || item.raw_source || '')
  const summary: Record<string, unknown> = {}
  for (const key of [
    'ID',
    'id',
    'project_id',
    'script_id',
    'parent_version_id',
    'version_number',
    'title',
    'source_type',
    'summary',
    'status',
    'CreatedAt',
    'UpdatedAt',
  ]) {
    if (item[key] !== undefined) summary[key] = truncateLongText(item[key])
  }
  summary.body_length = body.length
  return summary
}

function summarizeScript(item: any, options: { includeContent: boolean; contentLimit: number }): unknown {
  if (!item || typeof item !== 'object') return item
  const body = String(item.content || item.raw_source || '')
  const summary: Record<string, unknown> = {}
  for (const key of [
    'ID',
    'id',
    'project_id',
    'parent_script_id',
    'episode_id',
    'title',
    'script_type',
    'source_type',
    'version',
    'order',
    'status',
    'summary',
    'description',
    'characters',
    'core_settings',
    'hook',
    'plot_summary',
    'script_points',
    'planned_scene_count',
    'planned_character_count',
    'time_text',
    'location_text',
    'structured_characters',
    'plot_beats',
    'atmosphere',
    'CreatedAt',
    'UpdatedAt',
  ]) {
    if (item[key] !== undefined) summary[key] = truncateLongText(item[key])
  }
  summary.body_length = body.length
  if (options.includeContent) {
    summary.content = body.length > options.contentLimit ? body.slice(0, options.contentLimit) + '...' : body
    summary.content_truncated = body.length > options.contentLimit
  }
  return summary
}
