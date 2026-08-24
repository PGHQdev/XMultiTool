import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REGISTRY = 'src/core/adapter/x-selectors.ts'
const FORBIDDEN = [
  /data-testid/,
  /\/i\/api\/graphql/,
  /night_mode/,
  /\bHomeTimeline\b/,
  /\bTweetDetail\b/,
]

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sources(path, out)
    else if (/\.(ts|svelte)$/.test(name)) out.push(path)
  }
  return out
}

describe('selector registry', () => {
  it('holds every X-specific string in the project', () => {
    const offenders: string[] = []
    for (const dir of ['src', 'entrypoints']) {
      for (const file of sources(dir)) {
        if (file.replace(/\\/g, '/') === REGISTRY) continue
        const text = readFileSync(file, 'utf8')
        for (const pattern of FORBIDDEN) {
          if (pattern.test(text)) offenders.push(`${file} matches ${pattern}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
