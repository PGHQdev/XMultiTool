export interface BusTransport {
  send(message: unknown): Promise<unknown>
  onMessage(cb: (message: unknown) => Promise<unknown> | unknown): () => void
}

interface Envelope {
  xmt: 'request' | 'event'
  type: string
  payload: unknown
}

interface Reply {
  ok: boolean
  value?: unknown
  error?: string
}

const isEnvelope = (m: unknown): m is Envelope =>
  typeof m === 'object' && m !== null && (m as Envelope).xmt !== undefined

export interface Bus {
  request<T>(type: string, payload: unknown): Promise<T>
  handle(type: string, handler: (payload: any) => unknown): () => void
  emit(type: string, payload: unknown): Promise<void>
  on(type: string, listener: (payload: any) => void): () => void
}

export function createBus(transport: BusTransport): Bus {
  const handlers = new Map<string, (payload: unknown) => unknown>()
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  let attached = false

  const attach = (): void => {
    if (attached) return
    attached = true
    transport.onMessage(async (message) => {
      if (!isEnvelope(message)) return undefined

      if (message.xmt === 'event') {
        for (const listener of listeners.get(message.type) ?? [])
          listener(message.payload)
        return undefined
      }

      const handler = handlers.get(message.type)
      if (!handler) return undefined
      try {
        return {
          ok: true,
          value: await handler(message.payload),
        } satisfies Reply
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies Reply
      }
    })
  }

  return {
    async request<T>(type: string, payload: unknown): Promise<T> {
      const reply = (await transport.send({
        xmt: 'request',
        type,
        payload,
      } satisfies Envelope)) as Reply | undefined
      if (!reply) throw new Error(`xmt: no handler for "${type}"`)
      if (!reply.ok) throw new Error(reply.error ?? 'xmt: request failed')
      return reply.value as T
    },
    handle(type, handler) {
      attach()
      if (handlers.has(type)) {
        throw new Error(`xmt: a handler is already registered for "${type}"`)
      }
      handlers.set(type, handler as (payload: unknown) => unknown)
      return () => handlers.delete(type)
    },
    // Chrome rejects runtime.sendMessage whenever no other context is listening,
    // which is the normal state any time every extension page besides the sender
    // is closed. A broadcast with no receiver is not a failure, so emit resolves
    // either way; the request path above still surfaces its own errors.
    async emit(type, payload) {
      await transport
        .send({ xmt: 'event', type, payload } satisfies Envelope)
        .catch(() => undefined)
    },
    on(type, listener) {
      attach()
      const set = listeners.get(type) ?? new Set()
      set.add(listener as (payload: unknown) => void)
      listeners.set(type, set)
      return () => set.delete(listener as (payload: unknown) => void)
    },
  }
}
