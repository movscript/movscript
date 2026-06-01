export function createObjectUrl(source: Blob | MediaSource): string {
  return URL.createObjectURL(source)
}

export function revokeObjectUrl(url: string | undefined | null) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

export function revokeObjectUrls(urls: Iterable<string | undefined | null>) {
  for (const url of urls) revokeObjectUrl(url)
}

export async function withObjectUrl<T>(source: Blob | MediaSource, fn: (url: string) => Promise<T>): Promise<T> {
  const url = createObjectUrl(source)
  try {
    return await fn(url)
  } finally {
    revokeObjectUrl(url)
  }
}
