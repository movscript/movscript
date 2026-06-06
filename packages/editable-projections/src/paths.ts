export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '') || '.'
}

export function pathIsInside(path: string, root: string): boolean {
  const normalizedPath = normalizePath(path)
  const normalizedRoot = normalizePath(root)
  return normalizedRoot === '.'
    || normalizedPath === normalizedRoot
    || normalizedPath.startsWith(`${normalizedRoot}/`)
}

export function pathHasParentSegment(path: string): boolean {
  return normalizePath(path).split('/').includes('..')
}

export function pathHasCurrentSegment(path: string): boolean {
  return normalizePath(path).split('/').includes('.')
}

export function pathIsAbsolute(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  return normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)
}

export function jsonPointer(path: Array<string | number>): string {
  if (path.length === 0) return ''
  return `/${path.map((part) => String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`
}
