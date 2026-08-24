import { describe, expect, it } from 'vitest'
import { exportConfig, importConfig } from '../../src/core/settings/config-file'
import {
  SETTINGS_VERSION,
  type StoredSettings,
} from '../../src/core/settings/store'

const settings: StoredSettings = {
  version: SETTINGS_VERSION,
  enabled: { 'core:diagnostics': true },
  tools: { 'core:diagnostics': { explain: true } },
  ui: { theme: 'dim' },
}

describe('exportConfig', () => {
  it('writes readable json with a stamp', () => {
    const text = exportConfig(settings, '2026-08-24T00:00:00.000Z')
    expect(JSON.parse(text)).toEqual({
      app: 'xmultitool',
      version: SETTINGS_VERSION,
      exportedAt: '2026-08-24T00:00:00.000Z',
      settings,
    })
    expect(text).toContain('\n')
  })
})

describe('importConfig', () => {
  it('reads back what export wrote', () => {
    expect(
      importConfig(exportConfig(settings, '2026-08-24T00:00:00.000Z')),
    ).toEqual(settings)
  })

  it('rejects text that is not json', () => {
    expect(() => importConfig('not json')).toThrow(
      /not a valid xmultitool config/i,
    )
  })

  it('rejects a file from another app', () => {
    expect(() =>
      importConfig(JSON.stringify({ app: 'other', settings })),
    ).toThrow(/not a valid xmultitool config/i)
  })

  it('repairs a config with unknown fields instead of failing', () => {
    const text = JSON.stringify({
      app: 'xmultitool',
      version: SETTINGS_VERSION,
      settings: { ...settings, junk: 1 },
    })
    expect(importConfig(text)).toEqual(settings)
  })

  it('rejects a null settings object', () => {
    expect(() =>
      importConfig(
        JSON.stringify({
          app: 'xmultitool',
          version: SETTINGS_VERSION,
          settings: null,
        }),
      ),
    ).toThrow(/not a valid xmultitool config/i)
  })

  it('rejects an array in place of the settings object', () => {
    expect(() =>
      importConfig(
        JSON.stringify({
          app: 'xmultitool',
          version: SETTINGS_VERSION,
          settings: [],
        }),
      ),
    ).toThrow(/not a valid xmultitool config/i)
  })

  it('rejects a version written as a string', () => {
    expect(() =>
      importConfig(
        JSON.stringify({ app: 'xmultitool', version: '5', settings }),
      ),
    ).toThrow(/not a valid xmultitool config/i)
  })

  it('rejects a missing version', () => {
    expect(() =>
      importConfig(JSON.stringify({ app: 'xmultitool', settings })),
    ).toThrow(/not a valid xmultitool config/i)
  })

  it('rejects a fractional version', () => {
    expect(() =>
      importConfig(
        JSON.stringify({ app: 'xmultitool', version: 1.5, settings }),
      ),
    ).toThrow(/not a valid xmultitool config/i)
  })

  it('rejects a config written by a newer version', () => {
    const text = JSON.stringify({
      app: 'xmultitool',
      version: SETTINGS_VERSION + 5,
      settings,
    })
    expect(() => importConfig(text)).toThrow(/newer version/i)
  })
})
