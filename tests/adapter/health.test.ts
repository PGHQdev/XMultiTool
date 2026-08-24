import { describe, expect, it } from 'vitest'
import { SelectorHealth } from '../../src/core/adapter/health'

describe('SelectorHealth', () => {
  it('calls a selector healthy as soon as it matches', () => {
    const now = 0
    const health = new SelectorHealth(() => now, 10_000)
    health.record('cell', 3)
    expect(health.report()).toEqual([
      { id: 'cell', matches: 3, staleForMs: 0, healthy: true },
    ])
  })

  it('keeps a selector healthy inside the grace window', () => {
    let now = 0
    const health = new SelectorHealth(() => now, 10_000)
    health.record('cell', 0)
    now = 9_000
    const [entry] = health.report()
    expect(entry?.healthy).toBe(true)
  })

  it('marks a selector unhealthy after the grace window with no match', () => {
    let now = 0
    const health = new SelectorHealth(() => now, 10_000)
    health.record('cell', 0)
    now = 10_001
    const [entry] = health.report()
    expect(entry).toEqual({
      id: 'cell',
      matches: 0,
      staleForMs: 10_001,
      healthy: false,
    })
  })

  it('recovers when the selector matches again', () => {
    let now = 0
    const health = new SelectorHealth(() => now, 10_000)
    health.record('cell', 0)
    now = 20_000
    health.record('cell', 2)
    const [entry] = health.report()
    expect(entry?.healthy).toBe(true)
  })
})
