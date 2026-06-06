export async function withProviderSessionModelConfigError<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('provider session returned 404')) {
      throw new Error('当前提供方不支持模型配置接口。请切换到支持 app-server 协议的提供方，或重启桌面端后重试。')
    }
    throw error
  }
}
