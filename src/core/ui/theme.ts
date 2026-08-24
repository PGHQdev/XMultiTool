import { X_SELECTORS } from '../adapter/x-selectors'
import type { ThemeChoice } from '../settings/store'

export type XTheme = 'light' | 'dim' | 'lights-out'

const BY_COOKIE_VALUE: Record<string, XTheme> = {
  '0': 'light',
  '1': 'dim',
  '2': 'lights-out',
}

export function themeFromCookie(cookie: string): XTheme | null {
  const name = X_SELECTORS.cookies.theme
  for (const part of cookie.split(';')) {
    const [key, value] = part.trim().split('=')
    if (key === name)
      return value !== undefined ? (BY_COOKIE_VALUE[value] ?? null) : null
  }
  return null
}

export function resolveTheme(
  choice: ThemeChoice,
  detected: XTheme | null,
  prefersDark: boolean,
): XTheme {
  if (choice !== 'auto') return choice
  if (detected) return detected
  return prefersDark ? 'lights-out' : 'light'
}

export function applyTheme(root: HTMLElement, theme: XTheme): void {
  root.setAttribute('data-xmt-theme', theme)
}
