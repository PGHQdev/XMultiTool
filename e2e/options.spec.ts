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

test('the options page lists the core tool and remembers a toggle', async () => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await page.getByRole('button', { name: 'tools' }).click()
  await expect(page.getByText('Diagnostics')).toBeVisible()

  const toggle = page.getByRole('checkbox').first()
  await toggle.check()
  await expect(page.getByText('Explain every post')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'tools' }).click()
  await expect(page.getByRole('checkbox').first()).toBeChecked()
})

test('the status page explains itself when no x tab is open', async () => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await expect(page.getByText('Open an x.com tab')).toBeVisible()
})
