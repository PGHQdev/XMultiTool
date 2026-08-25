import { resolve } from 'node:path'
import { type BrowserContext, chromium, expect, test } from '@playwright/test'

const EXTENSION = resolve('dist/chrome-mv3')

let context: BrowserContext
let extensionId: string

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
    ],
  })
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  extensionId = new URL(worker.url()).hostname
})

test.afterAll(async () => {
  await context.close()
})

test('the options page lists the rules and remembers a toggle', async () => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await expect(page.getByText('Ads and promoted posts')).toBeVisible()
  await expect(page.getByText('Engagement bait')).toBeVisible()

  // Reposts ship off, so it is the one rule a click can turn on.
  const reposts = page.getByRole('checkbox', { name: 'Reposts' })
  await reposts.check()

  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Reposts' })).toBeChecked()
})

test('the filter screen explains itself when no x tab is open', async () => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(
    page.getByText('Open an x.com tab to see what it caught.'),
  ).toBeVisible()
})
