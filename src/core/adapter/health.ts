export interface HealthEntry {
  id: string
  matches: number
  staleForMs: number
  healthy: boolean
}

interface Sample {
  matches: number
  lastMatchAt: number
}

export class SelectorHealth {
  private readonly samples = new Map<string, Sample>()

  constructor(
    private readonly now: () => number,
    private readonly graceMs = 10_000,
  ) {}

  record(id: string, matches: number): void {
    const at = this.now()
    const previous = this.samples.get(id)
    this.samples.set(id, {
      matches,
      lastMatchAt: matches > 0 ? at : (previous?.lastMatchAt ?? at),
    })
  }

  report(): HealthEntry[] {
    const at = this.now()
    return [...this.samples.entries()].map(([id, sample]) => {
      const staleForMs = sample.matches > 0 ? 0 : at - sample.lastMatchAt
      return {
        id,
        matches: sample.matches,
        staleForMs,
        healthy: staleForMs <= this.graceMs,
      }
    })
  }
}
