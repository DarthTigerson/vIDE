// navigator.clipboard when available; falls back to a hidden textarea +
// execCommand('copy') where it rejects (e.g. document not focused).
export function copyText(text: string): void {
  navigator.clipboard?.writeText(text).catch(() => {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  })
}
