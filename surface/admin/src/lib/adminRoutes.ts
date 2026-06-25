export function adminHref(href: string, pathname = currentPathname()): string {
  const normalized = href.startsWith('/') ? href : `/${href}`
  if (pathname.startsWith('/admin')) return `/admin${normalized}`
  return normalized
}

function currentPathname(): string {
  if (typeof window === 'undefined') return ''
  return window.location.pathname
}
