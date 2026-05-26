import { summarizePickedFields } from './summaryUtils'

export function summarizeResourceRecord(item: Record<string, unknown>): unknown {
  return summarizePickedFields(item, ['ID', 'id', 'name', 'filename', 'file_name', 'type', 'mime_type', 'url', 'URL', 'status', 'CreatedAt', 'UpdatedAt'])
}
