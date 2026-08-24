type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

// A failed write leaves the panel data unchanged, and checked={...}/value={...} diff
// against Svelte's own last-written cache, which already equals that data. Svelte
// therefore writes nothing back and the control keeps the value the user just picked,
// so the caller puts the previous one back by hand.
export function restoreControl(
  target: Control,
  previous: string | boolean,
): void {
  if (typeof previous === 'boolean') {
    const input = target as HTMLInputElement
    input.checked = previous
    return
  }
  target.value = previous
}
