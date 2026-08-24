import { describe, expect, it } from 'vitest'
import { controlFor } from '../../src/ui/controls/control-for'

describe('controlFor', () => {
  it('maps a boolean to a switch', () => {
    expect(controlFor({ type: 'boolean', default: false, label: 'x' })).toBe(
      'switch',
    )
  })

  it('maps a number to a number control', () => {
    expect(controlFor({ type: 'number', default: 1, label: 'x' })).toBe(
      'number',
    )
  })

  it('maps a string to a text control', () => {
    expect(controlFor({ type: 'string', default: '', label: 'x' })).toBe('text')
  })

  it('maps an enum to a select', () => {
    expect(
      controlFor({
        type: 'enum',
        default: 'a',
        options: [{ value: 'a', label: 'A' }],
        label: 'x',
      }),
    ).toBe('select')
  })

  it('maps a string list to a list control', () => {
    expect(controlFor({ type: 'stringList', default: [], label: 'x' })).toBe(
      'list',
    )
  })
})
