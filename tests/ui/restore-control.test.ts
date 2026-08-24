import { describe, expect, it } from 'vitest'
import { restoreControl } from '../../src/ui/controls/restore-control'

describe('restoreControl', () => {
  it('puts a checkbox back', () => {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = true
    restoreControl(input, false)
    expect(input.checked).toBe(false)
  })

  it('puts a text input back', () => {
    const input = document.createElement('input')
    input.value = 'typed'
    restoreControl(input, 'saved')
    expect(input.value).toBe('saved')
  })

  it('puts a select back', () => {
    const select = document.createElement('select')
    for (const value of ['auto', 'dim']) {
      const option = document.createElement('option')
      option.value = value
      select.append(option)
    }
    select.value = 'dim'
    restoreControl(select, 'auto')
    expect(select.value).toBe('auto')
  })

  it('puts a textarea back', () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'a\nb'
    restoreControl(textarea, 'a')
    expect(textarea.value).toBe('a')
  })
})
