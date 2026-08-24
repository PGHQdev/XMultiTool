import { describe, expect, it, vi } from 'vitest'
import { type BusTransport, createBus, NOT_HANDLED } from '../../src/core/bus'

function linkedTransports(): [BusTransport, BusTransport] {
  const handlers: Array<Array<(m: unknown) => Promise<unknown> | unknown>> = [
    [],
    [],
  ]
  const make = (self: number, other: number): BusTransport => ({
    async send(message) {
      for (const handler of handlers[other] ?? []) {
        const result = handler(message)
        // A real transport never turns NOT_HANDLED into a reply.
        if (result === NOT_HANDLED) continue
        const value = await result
        if (value !== undefined) return value
      }
      return undefined
    },
    onMessage(cb) {
      const list = handlers[self]
      list?.push(cb)
      return () => {
        if (!list) return
        list.splice(list.indexOf(cb), 1)
      }
    },
  })
  return [make(0, 1), make(1, 0)]
}

describe('createBus', () => {
  it('carries a request to the handler and the reply back', async () => {
    const [a, b] = linkedTransports()
    const client = createBus(a)
    const server = createBus(b)
    server.handle(
      'sum',
      (payload: { a: number; b: number }) => payload.a + payload.b,
    )
    expect(await client.request<number>('sum', { a: 2, b: 3 })).toBe(5)
  })

  it('awaits an async handler', async () => {
    const [a, b] = linkedTransports()
    createBus(b).handle('slow', async () => 'done')
    expect(await createBus(a).request<string>('slow', undefined)).toBe('done')
  })

  it('rejects when no handler is registered', async () => {
    const [a] = linkedTransports()
    await expect(createBus(a).request('nobody', undefined)).rejects.toThrow(
      /no handler/i,
    )
  })

  it('turns a handler throw into a rejected request', async () => {
    const [a, b] = linkedTransports()
    createBus(b).handle('bad', () => {
      throw new Error('handler failed')
    })
    await expect(createBus(a).request('bad', undefined)).rejects.toThrow(
      'handler failed',
    )
  })

  it('delivers an event to every listener', async () => {
    const [a, b] = linkedTransports()
    const server = createBus(b)
    const first = vi.fn()
    const second = vi.fn()
    server.on('settings:changed', first)
    server.on('settings:changed', second)
    await createBus(a).emit('settings:changed', { version: 1 })
    expect(first).toHaveBeenCalledWith({ version: 1 })
    expect(second).toHaveBeenCalledWith({ version: 1 })
  })

  it('resolves emit even when nothing is listening, but still sends the envelope', async () => {
    const send = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'Could not establish connection. Receiving end does not exist.',
        ),
      )
    const transport: BusTransport = { send, onMessage: () => () => {} }
    await expect(
      createBus(transport).emit('settings:changed', { version: 1 }),
    ).resolves.toBeUndefined()
    expect(send).toHaveBeenCalledWith({
      xmt: 'event',
      type: 'settings:changed',
      payload: { version: 1 },
    })
  })

  it('ignores a message that is not a bus envelope', async () => {
    const [a, b] = linkedTransports()
    const bus = createBus(b)
    bus.handle('x', () => 1)
    await expect(a.send({ random: true })).resolves.toBeUndefined()
  })

  it('answers NOT_HANDLED for anything this context did not register', () => {
    let cb: ((message: unknown) => Promise<unknown> | unknown) | undefined
    const bus = createBus({
      send: async () => undefined,
      onMessage(c) {
        cb = c
        return () => {}
      },
    })
    bus.handle('mine', () => 1)
    expect(
      cb?.({ xmt: 'request', type: 'someone-elses', payload: undefined }),
    ).toBe(NOT_HANDLED)
    expect(cb?.({ xmt: 'event', type: 'settings:changed', payload: 1 })).toBe(
      NOT_HANDLED,
    )
    expect(cb?.({ random: true })).toBe(NOT_HANDLED)
  })

  it('still runs event listeners on the callback that answers NOT_HANDLED', () => {
    let cb: ((message: unknown) => Promise<unknown> | unknown) | undefined
    const bus = createBus({
      send: async () => undefined,
      onMessage(c) {
        cb = c
        return () => {}
      },
    })
    const seen = vi.fn()
    bus.on('settings:changed', seen)
    expect(cb?.({ xmt: 'event', type: 'settings:changed', payload: 7 })).toBe(
      NOT_HANDLED,
    )
    expect(seen).toHaveBeenCalledWith(7)
  })

  it('throws when a second handler is registered for a live type', () => {
    const [, b] = linkedTransports()
    const server = createBus(b)
    server.handle('dup', () => 1)
    expect(() => server.handle('dup', () => 2)).toThrow(/dup/)
  })

  it('allows re-registering a type after the previous handler unsubscribed', () => {
    const [, b] = linkedTransports()
    const server = createBus(b)
    const unsubscribe = server.handle('dup', () => 1)
    unsubscribe()
    expect(() => server.handle('dup', () => 2)).not.toThrow()
  })
})
