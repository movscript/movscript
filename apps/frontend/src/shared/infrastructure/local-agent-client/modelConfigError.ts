export async function withRuntimeModelConfigError<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('local agent returned 404')) {
      throw new Error('当前 Agent 版本不支持模型配置接口。请重启桌面端，或停止旧进程后重新运行：pnpm --filter @movscript/agent dev')
    }
    throw error
  }
}
