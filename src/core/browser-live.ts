import { type Browser, browser } from 'wxt/browser'
import {
  createRuntimeTransport,
  createStorageArea,
  type StorageApi,
} from './browser'
import { createBus } from './bus'

const storageApi: StorageApi = {
  get: (key) =>
    browser.storage.local.get(key) as Promise<Record<string, unknown>>,
  set: (items) => browser.storage.local.set(items),
  addChangeListener(cb) {
    const listener = (changes: Record<string, unknown>) =>
      cb(Object.keys(changes))
    browser.storage.local.onChanged.addListener(listener)
    return () => browser.storage.local.onChanged.removeListener(listener)
  },
}

export const storage = createStorageArea(storageApi)

export const bus = createBus(createRuntimeTransport(browser.runtime))

// runtime.sendMessage never reaches a content script. Anything answered inside the
// x.com tab has to travel through tabs.sendMessage, so the background relays it.
export async function requestActiveTab<T>(
  type: string,
  payload: unknown,
): Promise<T> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('Open an x.com tab first.')
  const reply = (await browser.tabs.sendMessage(tab.id, {
    xmt: 'request',
    type,
    payload,
  })) as { ok: boolean; value?: unknown; error?: string } | undefined
  if (!reply) throw new Error(`xmt: no handler for "${type}"`)
  if (!reply.ok) throw new Error(reply.error ?? 'xmt: request failed')
  return reply.value as T
}

export async function requestPermissions(names: string[]): Promise<boolean> {
  return browser.permissions.request({
    permissions: names as Browser.runtime.ManifestPermission[],
  })
}

export async function openSidePanel(tabId: number): Promise<void> {
  // chrome.sidePanel has no Firefox counterpart; the Firefox build uses sidebar_action,
  // which opens from the manifest and needs no call here.
  const api = (
    browser as unknown as {
      sidePanel?: { open(o: { tabId: number }): Promise<void> }
    }
  ).sidePanel
  await api?.open({ tabId })
}
