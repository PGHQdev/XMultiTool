import { describe, expect, it } from 'vitest'
import { HOST_MATCH, manifest } from '../src/manifest.config'

describe('manifest', () => {
  it('targets x.com only', () => {
    expect(manifest.host_permissions).toEqual([HOST_MATCH])
  })

  it('requests the minimum permissions', () => {
    expect(manifest.permissions.sort()).toEqual([
      'scripting',
      'sidePanel',
      'storage',
      'tabs',
    ])
  })

  it('exposes the main-world script to x.com only', () => {
    expect(manifest.web_accessible_resources).toEqual([
      { resources: ['xmt-main-world.js'], matches: [HOST_MATCH] },
    ])
  })

  it('declares no remote code and no content security policy escape', () => {
    expect(JSON.stringify(manifest)).not.toMatch(/https?:\/\/(?!x\.com)/)
  })
})
