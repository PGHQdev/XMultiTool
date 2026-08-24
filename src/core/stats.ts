import type { Verdict } from './types'

export interface Stats {
  seen: number
  hidden: number
  dimmed: number
  badged: number
  unknownEntryTypes: string[]
}

export class StatsCounter {
  private seen = 0
  private hidden = 0
  private dimmed = 0
  private badged = 0
  private readonly unknown = new Set<string>()

  count(verdict: Verdict): void {
    this.seen += 1
    if (verdict.action === 'hide') this.hidden += 1
    if (verdict.action === 'dim') this.dimmed += 1
    if (verdict.action === 'badge') this.badged += 1
  }

  noteUnknownEntryTypes(types: string[]): void {
    for (const type of types) this.unknown.add(type)
  }

  snapshot(): Stats {
    return {
      seen: this.seen,
      hidden: this.hidden,
      dimmed: this.dimmed,
      badged: this.badged,
      unknownEntryTypes: [...this.unknown],
    }
  }

  reset(): void {
    this.seen = 0
    this.hidden = 0
    this.dimmed = 0
    this.badged = 0
    this.unknown.clear()
  }
}
