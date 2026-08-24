import { X_SELECTORS } from './x-selectors'

const STATUS_ID = /\/status\/(\d+)/

export function postIdFromCell(cell: Element): string | null {
  for (const link of cell.querySelectorAll(X_SELECTORS.dom.statusLink)) {
    const href = link.getAttribute('href') ?? ''
    const match = STATUS_ID.exec(href)
    if (match?.[1]) return match[1]
  }
  return null
}

export function observeCells(
  root: Element,
  onCell: (id: string, node: HTMLElement) => void,
): () => void {
  const report = (element: Element): void => {
    const id = postIdFromCell(element)
    if (id) onCell(id, element as HTMLElement)
  }

  const scan = (element: Element): void => {
    if (element.matches(X_SELECTORS.dom.cell)) report(element)
    for (const cell of element.querySelectorAll(X_SELECTORS.dom.cell))
      report(cell)
  }

  scan(root)

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const added of record.addedNodes) {
        if (added.nodeType === Node.ELEMENT_NODE) scan(added as Element)
      }
    }
  })

  observer.observe(root, { childList: true, subtree: true })
  return () => observer.disconnect()
}
