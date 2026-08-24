import { describe, expect, it } from 'vitest'
import {
  applyTheme,
  resolveTheme,
  themeFromCookie,
} from '../../src/core/ui/theme'

describe('themeFromCookie', () => {
  it('reads light', () => {
    expect(themeFromCookie('guest_id=1; night_mode=0; other=2')).toBe('light')
  })

  it('reads dim', () => {
    expect(themeFromCookie('night_mode=1')).toBe('dim')
  })

  it('reads lights out', () => {
    expect(themeFromCookie('night_mode=2')).toBe('lights-out')
  })

  it('returns null when the cookie is absent', () => {
    expect(themeFromCookie('guest_id=1')).toBeNull()
  })

  it('returns null for a value it does not know', () => {
    expect(themeFromCookie('night_mode=9')).toBeNull()
  })

  it('is not fooled by a similarly named cookie', () => {
    expect(themeFromCookie('not_night_mode=1')).toBeNull()
  })
})

describe('resolveTheme', () => {
  it('follows the user choice above everything', () => {
    expect(resolveTheme('light', 'lights-out', true)).toBe('light')
  })

  it('follows X when the choice is auto', () => {
    expect(resolveTheme('auto', 'dim', false)).toBe('dim')
  })

  it('falls back to the system when detection failed', () => {
    expect(resolveTheme('auto', null, true)).toBe('lights-out')
    expect(resolveTheme('auto', null, false)).toBe('light')
  })
})

describe('applyTheme', () => {
  it('sets one attribute on the root', () => {
    const root = document.createElement('html')
    applyTheme(root, 'dim')
    expect(root.getAttribute('data-xmt-theme')).toBe('dim')
  })
})
