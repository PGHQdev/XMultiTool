import { describe, expect, it } from 'vitest'
import { coerce, defaultsOf, type Schema } from '../../src/core/settings/schema'

interface Demo {
  on: boolean
  limit: number
  label: string
  mode: string
  words: string[]
}

const schema: Schema<Demo> = {
  on: { type: 'boolean', default: true, label: 'On' },
  limit: { type: 'number', default: 5, min: 0, max: 10, label: 'Limit' },
  label: { type: 'string', default: 'hi', label: 'Label' },
  mode: {
    type: 'enum',
    default: 'a',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
    label: 'Mode',
  },
  words: { type: 'stringList', default: [], label: 'Words' },
}

describe('defaultsOf', () => {
  it('builds an object from the declared defaults', () => {
    expect(defaultsOf(schema)).toEqual({
      on: true,
      limit: 5,
      label: 'hi',
      mode: 'a',
      words: [],
    })
  })

  it('copies list defaults so two tools cannot share an array', () => {
    const first = defaultsOf(schema)
    first.words.push('x')
    expect(defaultsOf(schema).words).toEqual([])
  })
})

describe('coerce', () => {
  it('fills missing fields with defaults', () => {
    expect(coerce(schema, { limit: 2 })).toEqual({
      on: true,
      limit: 2,
      label: 'hi',
      mode: 'a',
      words: [],
    })
  })

  it('drops unknown keys', () => {
    expect(coerce(schema, { nope: 1 })).not.toHaveProperty('nope')
  })

  it('replaces a value of the wrong type with the default', () => {
    expect(coerce(schema, { on: 'yes' }).on).toBe(true)
  })

  it('clamps a number to its range', () => {
    expect(coerce(schema, { limit: 99 }).limit).toBe(10)
    expect(coerce(schema, { limit: -4 }).limit).toBe(0)
  })

  it('rejects an enum value that is not an option', () => {
    expect(coerce(schema, { mode: 'z' }).mode).toBe('a')
  })

  it('keeps only strings inside a list', () => {
    expect(coerce(schema, { words: ['a', 3, null, 'b'] }).words).toEqual([
      'a',
      'b',
    ])
  })

  it('survives a non-object input', () => {
    expect(coerce(schema, null)).toEqual(defaultsOf(schema))
  })
})
