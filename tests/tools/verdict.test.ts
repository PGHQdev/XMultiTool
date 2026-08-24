import { describe, expect, it } from 'vitest'
import { mergeVerdicts } from '../../src/core/tools/verdict'

describe('mergeVerdicts', () => {
  it('passes when there is nothing to say', () => {
    expect(mergeVerdicts([])).toEqual({ action: 'pass' })
  })

  it('ignores hooks that returned nothing', () => {
    expect(mergeVerdicts([undefined, undefined])).toEqual({ action: 'pass' })
  })

  it('lets hide beat dim and badge', () => {
    expect(
      mergeVerdicts([
        { action: 'dim', reason: 'low signal' },
        { action: 'hide', reason: 'promoted' },
        { action: 'badge', reason: 'bait', label: 'bait' },
      ]),
    ).toEqual({ action: 'hide', reason: 'promoted' })
  })

  it('lets dim beat badge', () => {
    expect(
      mergeVerdicts([
        { action: 'badge', reason: 'bait', label: 'bait' },
        { action: 'dim', reason: 'muted word' },
      ]),
    ).toEqual({ action: 'dim', reason: 'muted word' })
  })

  it('keeps the first verdict when two tools agree on the action', () => {
    expect(
      mergeVerdicts([
        { action: 'hide', reason: 'first' },
        { action: 'hide', reason: 'second' },
      ]),
    ).toEqual({ action: 'hide', reason: 'first' })
  })
})
