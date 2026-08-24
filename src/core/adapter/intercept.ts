import { isTrackedOperation, operationFromUrl } from './x-selectors'

export const BRIDGE_TAG = 'xmt'

export interface BridgeMessage {
  tag: typeof BRIDGE_TAG
  op: string
  url: string
  payload: unknown
}

export interface InterceptTarget {
  fetch: typeof fetch
  XMLHttpRequest: typeof XMLHttpRequest
  postMessage(message: unknown, targetOrigin: string): void
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function trackedOperation(url: string): string | null {
  const op = operationFromUrl(url)
  return op && isTrackedOperation(op) ? op : null
}

export function installInterceptor(target: InterceptTarget): () => void {
  const originalFetch = target.fetch
  const originalOpen = target.XMLHttpRequest.prototype?.open
  const originalSend = target.XMLHttpRequest.prototype?.send

  const report = (op: string, url: string, payload: unknown): void => {
    try {
      target.postMessage(
        { tag: BRIDGE_TAG, op, url, payload } satisfies BridgeMessage,
        '*',
      )
    } catch {
      // A page that rejects the message must not break the extension or the site.
    }
  }

  const patchedFetch = async function (
    this: unknown,
    input: RequestInfo | URL,
    init?: RequestInit,
  ) {
    const response = await originalFetch.call(
      this ?? target,
      input as RequestInfo,
      init,
    )
    try {
      const url = urlOf(input)
      const op = trackedOperation(url)
      if (op) {
        response
          .clone()
          .json()
          .then((payload) => report(op, url, payload))
          .catch(() => {})
      }
    } catch {
      // Reading the response must never change what the page receives.
    }
    return response
  } as typeof fetch

  target.fetch = patchedFetch

  const urls = new WeakMap<XMLHttpRequest, string>()

  if (originalOpen && originalSend) {
    target.XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      try {
        urls.set(this, typeof url === 'string' ? url : url.toString())
      } catch {
        // If the url can't be read here, tracking is skipped; open still runs below.
      }
      return (originalOpen as (...a: unknown[]) => void).call(
        this,
        method,
        url,
        ...rest,
      )
    } as typeof originalOpen

    target.XMLHttpRequest.prototype.send = function (
      this: XMLHttpRequest,
      body?: unknown,
    ) {
      try {
        const url = urls.get(this)
        const op = url ? trackedOperation(url) : null
        if (op && url) {
          this.addEventListener('load', () => {
            try {
              report(op, url, JSON.parse(this.responseText))
            } catch {
              // Not json, or a body the page reads another way. Skip it.
            }
          })
        }
      } catch {
        // A failure choosing whether to listen must not stop the site's own send.
      }
      return (originalSend as (...a: unknown[]) => void).call(this, body)
    } as typeof originalSend
  }

  return () => {
    target.fetch = originalFetch
    if (originalOpen) target.XMLHttpRequest.prototype.open = originalOpen
    if (originalSend) target.XMLHttpRequest.prototype.send = originalSend
  }
}
