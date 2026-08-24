import { describe, expect, it } from 'vitest'
import {
  ATTR_ACTION,
  ATTR_LABEL,
  ATTR_REASON,
  applyVerdict,
} from '../../src/core/tools/apply'

describe('applyVerdict', () => {
  it('marks a hidden node with its reason', () => {
    const node = document.createElement('div')
    applyVerdict(node, { action: 'hide', reason: 'promoted' })
    expect(node.getAttribute(ATTR_ACTION)).toBe('hide')
    expect(node.getAttribute(ATTR_REASON)).toBe('promoted')
  })

  it('carries the label of a badge', () => {
    const node = document.createElement('div')
    applyVerdict(node, {
      action: 'badge',
      reason: 'engagement bait',
      label: 'bait',
    })
    expect(node.getAttribute(ATTR_LABEL)).toBe('bait')
  })

  it('clears every mark on pass', () => {
    const node = document.createElement('div')
    applyVerdict(node, { action: 'hide', reason: 'promoted' })
    applyVerdict(node, { action: 'pass' })
    expect(node.hasAttribute(ATTR_ACTION)).toBe(false)
    expect(node.hasAttribute(ATTR_REASON)).toBe(false)
    expect(node.hasAttribute(ATTR_LABEL)).toBe(false)
  })

  it('never sets an inline style', () => {
    const node = document.createElement('div')
    applyVerdict(node, { action: 'dim', reason: 'muted' })
    expect(node.getAttribute('style')).toBeNull()
  })
})
