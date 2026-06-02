export class RuntimeDeferredTaskRegistry {
  private readonly tasks = new Set<Promise<void>>()

  get size(): number {
    return this.tasks.size
  }

  track(task: Promise<void>): void {
    this.tasks.add(task)
    void task.finally(() => {
      this.tasks.delete(task)
    }).catch(() => undefined)
  }

  async flush(): Promise<void> {
    while (this.tasks.size > 0) {
      await Promise.allSettled([...this.tasks])
    }
  }
}
