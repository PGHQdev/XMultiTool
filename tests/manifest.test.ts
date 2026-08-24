import { describe, expect, it } from 'vitest'
import type { ConfigEnv } from 'wxt'
import { CORE_TOOLS } from '../src/core/tools/index'
import { HOST_MATCH, manifest } from '../src/manifest.config'

const build = (browser: string): ConfigEnv => ({
  browser,
  manifestVersion: 3,
  mode: 'production',
  command: 'build',
})

const chrome = manifest(build('chrome'))
const firefox = manifest(build('firefox'))

describe('manifest', () => {
  it('targets x.com only', () => {
    expect(chrome.host_permissions).toEqual([HOST_MATCH])
    expect(firefox.host_permissions).toEqual([HOST_MATCH])
  })

  it('requests the minimum permissions', () => {
    expect(chrome.permissions.sort()).toEqual(['sidePanel', 'storage', 'tabs'])
  })

  it('keeps the Chrome-only keys out of the Firefox build', () => {
    expect(firefox.permissions.sort()).toEqual(['storage', 'tabs'])
    expect('minimum_chrome_version' in firefox).toBe(false)
    expect('side_panel' in firefox).toBe(false)
    expect('minimum_chrome_version' in chrome).toBe(true)
    expect('side_panel' in chrome).toBe(true)
  })

  it('exposes the main-world script to x.com only', () => {
    expect(chrome.web_accessible_resources).toEqual([
      { resources: ['xmt-main-world.js'], matches: [HOST_MATCH] },
    ])
  })

  it('declares no remote code and no content security policy escape', () => {
    expect(JSON.stringify(chrome)).not.toMatch(/https?:\/\/(?!x\.com)/)
    expect(JSON.stringify(firefox)).not.toMatch(/https?:\/\/(?!x\.com)/)
  })

  // permissions.request only resolves true for a name the manifest already lists as
  // optional, so a tool permission that is missing here is dead on arrival.
  it('declares every tool permission as optional', () => {
    for (const tool of CORE_TOOLS) {
      for (const name of tool.permissions ?? []) {
        expect(chrome.optional_permissions).toContain(name)
      }
    }
  })
})
