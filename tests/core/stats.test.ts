import { describe, expect, it } from 'vitest'
import { StatsCounter } from '../../src/core/stats'

describe('StatsCounter', () => {
  it('starts at zero', () => {
    expect(new StatsCounter().snapshot()).toEqual({
      seen: 0,
      hidden: 0,
      dimmed: 0,
      badged: 0,
      byReason: {},
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
      byReason: { a: 1, b: 1 },
      unknownEntryTypes: [],
    })
  })

  it('counts a hidden or dimmed post under its reason', () => {
    const stats = new StatsCounter()
    stats.count({ action: 'dim', reason: 'promoted' })
    stats.count({ action: 'dim', reason: 'promoted' })
    stats.count({ action: 'dim', reason: 'muted word' })
    expect(stats.snapshot().byReason).toEqual({ promoted: 2, 'muted word': 1 })
  })

  it('leaves a badge reason out, since it names a post and not a rule', () => {
    const stats = new StatsCounter()
    stats.count({
      action: 'badge',
      reason: 'post 123 from graphql',
      label: 'graphql',
    })
    expect(stats.snapshot().byReason).toEqual({})
  })

  it('stops taking new reasons once the map is full', () => {
    const stats = new StatsCounter()
    for (let i = 0; i < 40; i += 1)
      stats.count({ action: 'dim', reason: `r${i}` })
    stats.count({ action: 'dim', reason: 'r0' })
    const byReason = stats.snapshot().byReason
    expect(Object.keys(byReason)).toHaveLength(24)
    expect(byReason.r0).toBe(2)
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
    expect(stats.snapshot().byReason).toEqual({})
  })
})
