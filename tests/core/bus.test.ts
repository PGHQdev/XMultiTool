import { describe, expect, it, vi } from 'vitest'
import { type BusTransport, createBus } from '../../src/core/bus'

function linkedTransports(): [BusTransport, BusTransport] {
  const handlers: Array<Array<(m: unknown) => Promise<unknown> | unknown>> = [
    [],
    [],
  ]
  const make = (self: number, other: number): BusTransport => ({
    async send(message) {
      for (const handler of handlers[other] ?? []) {
        const result = await handler(message)
        if (result !== undefined) return result
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

  it('ignores a message that is not a bus envelope', async () => {
    const [a, b] = linkedTransports()
    const bus = createBus(b)
    bus.handle('x', () => 1)
    await expect(a.send({ random: true })).resolves.toBeUndefined()
  })
})
