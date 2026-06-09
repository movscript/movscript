declare module 'node-pty' {
  export type IPty = {
    pid: number
    process: string
    write(data: string): void
    resize(cols: number, rows: number): void
    kill(signal?: string): void
    onData(handler: (data: string) => void): { dispose(): void }
    onExit(handler: (event: { exitCode: number; signal?: number }) => void): { dispose(): void }
  }

  export type IPtyForkOptions = {
    name?: string
    cols?: number
    rows?: number
    cwd?: string
    env?: Record<string, string | undefined>
  }

  export function spawn(file: string, args: string[], options?: IPtyForkOptions): IPty
}
