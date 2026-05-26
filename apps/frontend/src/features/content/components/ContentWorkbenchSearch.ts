interface ContentWorkbenchSearchRecord {
  title?: unknown
  name?: unknown
  label?: unknown
  kind?: unknown
  status?: unknown
  description?: unknown
  prompt?: unknown
  content?: unknown
}

export interface ContentWorkbenchSearchRow {
  title: string
  scope: string
  moment: ContentWorkbenchSearchRecord
  segment?: ContentWorkbenchSearchRecord
  references: ContentWorkbenchSearchRecord[]
  units: ContentWorkbenchSearchRecord[]
  keyframes: ContentWorkbenchSearchRecord[]
}

export function contentWorkbenchRowMatchesSearch(row: ContentWorkbenchSearchRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  return contentWorkbenchRowSearchText(row).includes(normalizedQuery)
}

function contentWorkbenchRowSearchText(row: ContentWorkbenchSearchRow) {
  const values: string[] = [
    row.title,
    row.scope,
    titleOfRecord(row.moment),
    row.segment ? titleOfRecord(row.segment) : '',
    ...row.references.map((record) => `${titleOfRecord(record)} ${firstText(record.kind, record.description)}`),
    ...row.units.map((unit) => [
      titleOfRecord(unit),
      firstText(unit.kind, unit.status),
      firstText(unit.prompt, unit.description, unit.content),
    ].join(' ')),
    ...row.keyframes.map((keyframe) => `${titleOfRecord(keyframe)} ${firstText(keyframe.prompt, keyframe.description)}`),
  ]
  return values.join(' ').toLowerCase()
}

function titleOfRecord(record?: ContentWorkbenchSearchRecord | null) {
  return firstText(record?.title, record?.name, record?.label, '未命名')
}

function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}
