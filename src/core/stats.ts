import type { Verdict } from './types'

const REASON_MAX = 24

export interface Stats {
  seen: number
  hidden: number
  dimmed: number
  badged: number
  // Counts per rule, keyed by the reason the tool gave. Badge reasons name a post
  // rather than a rule, so they stay out.
  byReason: Record<string, number>
  unknownEntryTypes: string[]
}

export class StatsCounter {
  private seen = 0
  private hidden = 0
  private dimmed = 0
  private badged = 0
  private readonly unknown = new Set<string>()
  private readonly reasons = new Map<string, number>()

  count(verdict: Verdict): void {
    this.seen += 1
    if (verdict.action === 'hide') this.hidden += 1
    if (verdict.action === 'dim') this.dimmed += 1
    if (verdict.action === 'badge') this.badged += 1
    if (verdict.action === 'hide' || verdict.action === 'dim')
      this.noteReason(verdict.reason)
  }

  // A tool is free to write any reason it likes, and the counter lives for as long as
  // the tab does, so the map takes no key it does not already hold once it is full.
  private noteReason(reason: string): void {
    const seen = this.reasons.get(reason)
    if (seen === undefined && this.reasons.size >= REASON_MAX) return
    this.reasons.set(reason, (seen ?? 0) + 1)
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
      byReason: Object.fromEntries(this.reasons),
      unknownEntryTypes: [...this.unknown],
    }
  }

  reset(): void {
    this.seen = 0
    this.hidden = 0
    this.dimmed = 0
    this.badged = 0
    this.reasons.clear()
    this.unknown.clear()
  }
}
