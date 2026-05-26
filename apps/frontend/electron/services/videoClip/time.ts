export function ffmpegSeconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3)
}
