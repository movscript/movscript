export function shallowReferenceArrayEqual<T>(
  prev: readonly T[] | null | undefined,
  next: readonly T[] | null | undefined,
) {
  if (prev === next) return true
  if (!prev || !next) return false
  if (prev.length !== next.length) return false
  return prev.every((item, index) => item === next[index])
}
