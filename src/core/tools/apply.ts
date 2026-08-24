import type { Verdict } from '../types'

export const ATTR_ACTION = 'data-xmt'
export const ATTR_REASON = 'data-xmt-reason'
export const ATTR_LABEL = 'data-xmt-label'

export function applyVerdict(node: HTMLElement, verdict: Verdict): void {
  if (verdict.action === 'pass') {
    node.removeAttribute(ATTR_ACTION)
    node.removeAttribute(ATTR_REASON)
    node.removeAttribute(ATTR_LABEL)
    return
  }

  node.setAttribute(ATTR_ACTION, verdict.action)
  node.setAttribute(ATTR_REASON, verdict.reason)
  if (verdict.action === 'badge') node.setAttribute(ATTR_LABEL, verdict.label)
  else node.removeAttribute(ATTR_LABEL)
}
