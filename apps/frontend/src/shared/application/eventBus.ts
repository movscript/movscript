export type EventBusHandler<Payload> = (payload: Payload) => void

export interface EventBus<EventMap extends Record<string, unknown>> {
  publish<Topic extends keyof EventMap>(topic: Topic, payload: EventMap[Topic]): void
  publishReplay<Topic extends keyof EventMap>(topic: Topic, payload: EventMap[Topic]): void
  consume<Topic extends keyof EventMap>(topic: Topic): EventMap[Topic] | undefined
  once<Topic extends keyof EventMap>(
    topic: Topic,
    handler: EventBusHandler<EventMap[Topic]>,
  ): () => void
  subscribe<Topic extends keyof EventMap>(
    topic: Topic,
    handler: EventBusHandler<EventMap[Topic]>,
  ): () => void
}

export function createEventBus<EventMap extends Record<string, unknown>>(): EventBus<EventMap> {
  const handlers = new Map<keyof EventMap, Set<EventBusHandler<EventMap[keyof EventMap]>>>()
  const replayQueues = new Map<keyof EventMap, Array<EventMap[keyof EventMap]>>()

  function replayQueue<Topic extends keyof EventMap>(topic: Topic): Array<EventMap[Topic]> {
    const queue = replayQueues.get(topic) ?? []
    replayQueues.set(topic, queue)
    return queue as Array<EventMap[Topic]>
  }

  function publish<Topic extends keyof EventMap>(topic: Topic, payload: EventMap[Topic]) {
    const topicHandlers = handlers.get(topic)
    if (!topicHandlers) return
    for (const handler of Array.from(topicHandlers)) {
      handler(payload)
    }
  }

  function subscribe<Topic extends keyof EventMap>(
    topic: Topic,
    handler: EventBusHandler<EventMap[Topic]>,
  ) {
    const topicHandlers = handlers.get(topic) ?? new Set<EventBusHandler<EventMap[keyof EventMap]>>()
    topicHandlers.add(handler as EventBusHandler<EventMap[keyof EventMap]>)
    handlers.set(topic, topicHandlers)
    return () => {
      topicHandlers.delete(handler as EventBusHandler<EventMap[keyof EventMap]>)
      if (topicHandlers.size === 0) handlers.delete(topic)
    }
  }

  return {
    publish,
    publishReplay(topic, payload) {
      replayQueue(topic).push(payload)
      publish(topic, payload)
    },
    consume(topic) {
      const queue = replayQueues.get(topic)
      const payload = queue?.shift() as EventMap[typeof topic] | undefined
      if (queue?.length === 0) replayQueues.delete(topic)
      return payload
    },
    once(topic, handler) {
      const unsubscribe = subscribe(topic, (payload) => {
        unsubscribe()
        handler(payload)
      })
      return unsubscribe
    },
    subscribe,
  }
}
