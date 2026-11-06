// Every popup menu in the app closes on a window 'click' (left-click
// anywhere), but a right-click fires 'contextmenu' instead, so opening a
// second menu elsewhere left the first one open. This turns every right-click
// into that same outside click first: capture phase on window runs before
// React's handlers on #root, so the old menus close and only then does the
// new target open its own. The click is dispatched on <body>, above #root,
// so no React onClick handler sees it — only the window-level close listeners.
export function installCloseMenusOnRightClick(target: Window = window): () => void {
  const onContextMenu = () => {
    target.document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }
  target.addEventListener('contextmenu', onContextMenu, true)
  return () => target.removeEventListener('contextmenu', onContextMenu, true)
}
