import { describe, expect, it } from 'vitest'
import { StatsCounter } from '../../src/core/stats'

describe('StatsCounter', () => {
  it('starts at zero', () => {
    expect(new StatsCounter().snapshot()).toEqual({
      seen: 0,
      hidden: 0,
      dimmed: 0,
      badged: 0,
      unknownEntryTypes: [],
    })
  })

  it('counts each action against the total seen', () => {
    const stats = new StatsCounter()
    stats.count({ action: 'hide', reason: 'a' })
    stats.count({ action: 'dim', reason: 'b' })
    stats.count({ action: 'badge', reason: 'c', label: 'c' })
    stats.count({ action: 'pass' })
    expect(stats.snapshot()).toEqual({
      seen: 4,
      hidden: 1,
      dimmed: 1,
      badged: 1,
      unknownEntryTypes: [],
    })
  })

  it('keeps each unknown entry type once', () => {
    const stats = new StatsCounter()
    stats.noteUnknownEntryTypes(['A', 'B'])
    stats.noteUnknownEntryTypes(['B', 'C'])
    expect(stats.snapshot().unknownEntryTypes).toEqual(['A', 'B', 'C'])
  })

  it('clears on reset', () => {
    const stats = new StatsCounter()
    stats.count({ action: 'hide', reason: 'a' })
    stats.reset()
    expect(stats.snapshot().seen).toBe(0)
  })
})
