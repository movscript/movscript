export function buildConcatArgs(concatListPath: string, outputPath: string): string[] {
  return [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ]
}

export function buildConcatList(paths: string[]): string {
  return paths.map(path => `file '${path.replace(/'/g, "'\\''")}'`).join('\n')
}
