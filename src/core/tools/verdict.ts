import type { Verdict } from '../types'

const PRECEDENCE: Record<Verdict['action'], number> = {
  hide: 3,
  dim: 2,
  badge: 1,
  pass: 0,
}

export function mergeVerdicts(verdicts: Array<Verdict | void>): Verdict {
  let winner: Verdict = { action: 'pass' }
  for (const verdict of verdicts) {
    if (!verdict) continue
    if (PRECEDENCE[verdict.action] > PRECEDENCE[winner.action]) winner = verdict
  }
  return winner
}
