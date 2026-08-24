import { describe, expect, it, vi } from 'vitest'
import {
  BRIDGE_TAG,
  type InterceptTarget,
  installInterceptor,
} from '../../src/core/adapter/intercept'

const TRACKED =
  'https://x.com/i/api/graphql/hash1/HomeTimeline?variables=%7B%7D'
const UNTRACKED = 'https://x.com/i/api/graphql/hash1/CreateTweet'

function target(
  fetchImpl: typeof fetch,
): InterceptTarget & { messages: unknown[] } {
  return {
    messages: [],
    fetch: fetchImpl,
    XMLHttpRequest: class {} as unknown as typeof XMLHttpRequest,
    postMessage(message) {
      this.messages.push(message)
    },
  }
}

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

function fakeXhrClass() {
  return class FakeXMLHttpRequest {
    responseText = ''
    openCalls: unknown[][] = []
    sendCalls: unknown[][] = []
    private loadListeners: Array<() => void> = []

    open(...args: unknown[]): void {
      this.openCalls.push(args)
    }

    send(...args: unknown[]): void {
      this.sendCalls.push(args)
    }

    addEventListener(type: string, listener: () => void): void {
      if (type === 'load') this.loadListeners.push(listener)
    }

    fireLoad(): void {
      for (const listener of this.loadListeners) listener()
    }
  }
}

function xhrTarget() {
  const Fake = fakeXhrClass()
  const t = target(async () => jsonResponse({}))
  t.XMLHttpRequest = Fake as unknown as typeof XMLHttpRequest
  return { t, makeXhr: () => new Fake() }
}

describe('installInterceptor', () => {
  it('forwards a tracked graphql response', async () => {
    const t = target(async () => jsonResponse({ data: { ok: true } }))
    installInterceptor(t)
    await t.fetch(TRACKED)
    await vi.waitFor(() => expect(t.messages).toHaveLength(1))
    expect(t.messages[0]).toEqual({
      tag: BRIDGE_TAG,
      op: 'HomeTimeline',
      url: TRACKED,
      payload: { data: { ok: true } },
    })
  })

  it('ignores an untracked operation', async () => {
    const t = target(async () => jsonResponse({ data: {} }))
    installInterceptor(t)
    await t.fetch(UNTRACKED)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(t.messages).toHaveLength(0)
  })

  it('returns a response whose body the page can still read', async () => {
    const t = target(async () => jsonResponse({ data: { value: 42 } }))
    installInterceptor(t)
    const response = await t.fetch(TRACKED)
    expect(await response.json()).toEqual({ data: { value: 42 } })
  })

  it('passes a fetch rejection through untouched', async () => {
    const failure = new Error('network down')
    const t = target(async () => {
      throw failure
    })
    installInterceptor(t)
    await expect(t.fetch(TRACKED)).rejects.toBe(failure)
    expect(t.messages).toHaveLength(0)
  })

  it('stays silent when the body is not json', async () => {
    const t = target(async () => new Response('<html>', { status: 200 }))
    installInterceptor(t)
    await t.fetch(TRACKED)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(t.messages).toHaveLength(0)
  })

  it('accepts a Request object as the fetch input', async () => {
    const t = target(async () => jsonResponse({ data: 1 }))
    installInterceptor(t)
    await t.fetch(new Request(TRACKED))
    await vi.waitFor(() => expect(t.messages).toHaveLength(1))
  })

  it('restores the original fetch on uninstall', async () => {
    const original = (async () => jsonResponse({})) as typeof fetch
    const t = target(original)
    const uninstall = installInterceptor(t)
    uninstall()
    expect(t.fetch).toBe(original)
  })

  it('never reports a message for a non-x.com host', async () => {
    const t = target(async () => jsonResponse({ data: 1 }))
    installInterceptor(t)
    await t.fetch('https://example.com/i/api/graphql/h/HomeTimeline')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(t.messages).toHaveLength(0)
  })

  it('reports a payload captured over xhr for a tracked operation', () => {
    const { t, makeXhr } = xhrTarget()
    installInterceptor(t)
    const xhr = makeXhr()
    xhr.open('GET', TRACKED)
    xhr.send()
    xhr.responseText = JSON.stringify({ data: { ok: true } })
    xhr.fireLoad()
    expect(t.messages).toEqual([
      {
        tag: BRIDGE_TAG,
        op: 'HomeTimeline',
        url: TRACKED,
        payload: { data: { ok: true } },
      },
    ])
  })

  it('reports nothing over xhr for an untracked operation', () => {
    const { t, makeXhr } = xhrTarget()
    installInterceptor(t)
    const xhr = makeXhr()
    xhr.open('GET', UNTRACKED)
    xhr.send()
    xhr.responseText = JSON.stringify({ data: {} })
    xhr.fireLoad()
    expect(t.messages).toHaveLength(0)
  })

  it('still calls the original xhr open and send with their original arguments', () => {
    const { t, makeXhr } = xhrTarget()
    installInterceptor(t)
    const xhr = makeXhr()
    xhr.open('POST', TRACKED)
    xhr.send('payload-body')
    expect(xhr.openCalls).toEqual([['POST', TRACKED]])
    expect(xhr.sendCalls).toEqual([['payload-body']])
  })

  it('stays silent when the xhr response body is not json', () => {
    const { t, makeXhr } = xhrTarget()
    installInterceptor(t)
    const xhr = makeXhr()
    xhr.open('GET', TRACKED)
    xhr.send()
    xhr.responseText = '<html>'
    expect(() => xhr.fireLoad()).not.toThrow()
    expect(t.messages).toHaveLength(0)
  })

  it('restores the original xhr open and send on uninstall', () => {
    const { t } = xhrTarget()
    const originalOpen = t.XMLHttpRequest.prototype.open
    const originalSend = t.XMLHttpRequest.prototype.send
    const uninstall = installInterceptor(t)
    uninstall()
    expect(t.XMLHttpRequest.prototype.open).toBe(originalOpen)
    expect(t.XMLHttpRequest.prototype.send).toBe(originalSend)
  })
})
