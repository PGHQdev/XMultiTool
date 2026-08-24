import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { observeCells, postIdFromCell } from '../../src/core/adapter/dom'
import { X_SELECTORS } from '../../src/core/adapter/x-selectors'

const html = readFileSync('tests/fixtures/timeline.html', 'utf8')

function cellAt(cells: NodeListOf<Element>, index: number): Element {
  const cell = cells[index]
  if (!cell) throw new Error(`expected a cell at index ${index}`)
  return cell
}

beforeEach(() => {
  document.body.innerHTML = html
})

describe('postIdFromCell', () => {
  it('reads the id from a status permalink', () => {
    const cells = document.querySelectorAll(X_SELECTORS.dom.cell)
    expect(postIdFromCell(cellAt(cells, 0))).toBe('1001')
    expect(postIdFromCell(cellAt(cells, 1))).toBe('2002')
  })

  it('returns null for a cell that holds no post', () => {
    const cells = document.querySelectorAll(X_SELECTORS.dom.cell)
    expect(postIdFromCell(cellAt(cells, 2))).toBeNull()
  })
})

describe('observeCells', () => {
  it('reports the cells that are already present', () => {
    const seen: string[] = []
    observeCells(document.body, (id) => seen.push(id))
    expect(seen).toEqual(['1001', '2002'])
  })

  it('reports a cell that X appends later', async () => {
    const seen: string[] = []
    observeCells(document.body, (id) => seen.push(id))
    const cell = document.createElement('div')
    cell.setAttribute('data-testid', 'cellInnerDiv')
    cell.innerHTML = '<a href="/x/status/3003">3h</a>'
    document.querySelector(X_SELECTORS.dom.primaryColumn)?.appendChild(cell)
    await vi.waitFor(() => expect(seen).toContain('3003'))
  })

  it('reports the same id again when X replaces the node', async () => {
    const calls: HTMLElement[] = []
    observeCells(document.body, (_id, node) => calls.push(node))
    const column = document.querySelector(
      X_SELECTORS.dom.primaryColumn,
    ) as HTMLElement
    const replacement = document.createElement('div')
    replacement.setAttribute('data-testid', 'cellInnerDiv')
    replacement.innerHTML = '<a href="/jack/status/1001">1h</a>'
    column.appendChild(replacement)
    await vi.waitFor(() => expect(calls).toHaveLength(3))
  })

  it('stops reporting after the returned function runs', async () => {
    const seen: string[] = []
    const stop = observeCells(document.body, (id) => seen.push(id))
    stop()
    const cell = document.createElement('div')
    cell.setAttribute('data-testid', 'cellInnerDiv')
    cell.innerHTML = '<a href="/x/status/4004">4h</a>'
    document.body.appendChild(cell)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen).not.toContain('4004')
  })
})
