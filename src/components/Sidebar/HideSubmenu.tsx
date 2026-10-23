import type { FileNode } from '@/types/index'
import { MenuButton, MenuDivider, SubMenuButton, SwitchMenuButton } from '@/components/ui/MenuItems'
import { extensionOf, GRAPHIFY_OUT_DIR, isRuleHidden, relativePath, type HideToggle } from '@/lib/treeHiding'
import { selectRules, useTreeHidingStore } from '@/stores/treeHidingStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { useFileStore } from '@/stores/fileStore'

// The Site Tree right-click menu's Hide ▸ submenu: hide this item, every item
// with its name, or every file with its extension (Unhide instead on an item
// that is already hidden), plus per-repo switches for whole kinds of items
// (on = hidden; stored as their show* inverse). node null = a
// right-click on empty tree space, which only gets the switches. Flipping a
// switch leaves the menu open; the hide actions close it via onDone.
export function HideSubmenu({ root, node, onDone }: {
  root: string
  node: FileNode | null
  onDone: () => void
}) {
  const rules = useTreeHidingStore((s) => selectRules(s.byRepo, root))
  const graphifyEnabled = useGraphifySettingsStore((s) => s.enabled)
  // Only offered in a repo that has a built graph to hide.
  const hasGraphifyOut = useFileStore((s) => s.tree.some((n) => n.isDirectory && n.name === GRAPHIFY_OUT_DIR))
  const { hidePath, hideName, hideExtension, unhide, setToggle } = useTreeHidingStore.getState()
  const rel = node ? relativePath(root, node.path) : null
  const ext = node && !node.isDirectory ? extensionOf(node.name) : null

  function run(action: () => void) {
    action()
    onDone()
  }

  // Under "Hide", a switch that's on means that kind of item is hidden.
  function hideSwitch(key: HideToggle, label: string) {
    return <SwitchMenuButton checked={!rules[key]} onClick={() => setToggle(root, key, !rules[key])}>{label}</SwitchMenuButton>
  }

  return (
    <SubMenuButton label="Hide" width="w-60">
      {node && rel && (
        <>
          {isRuleHidden(rel, node.isDirectory, rules) ? (
            <MenuButton onClick={() => run(() => unhide(root, rel, node.isDirectory))}>{`Unhide "${node.name}"`}</MenuButton>
          ) : (
            <>
              <MenuButton onClick={() => run(() => hidePath(root, rel))}>{`Hide "${node.name}"`}</MenuButton>
              <MenuButton onClick={() => run(() => hideName(root, node.name))}>
                {node.isDirectory ? `Hide all folders named "${node.name}"` : `Hide all named "${node.name}"`}
              </MenuButton>
              {ext && <MenuButton onClick={() => run(() => hideExtension(root, ext))}>{`Hide all .${ext} files`}</MenuButton>}
            </>
          )}
          <MenuDivider />
        </>
      )}
      {hideSwitch('showHidden', 'Hidden items')}
      {hideSwitch('showGitignored', 'Gitignored items')}
      {hideSwitch('showDotfiles', 'Dotfiles')}
      {graphifyEnabled && hasGraphifyOut && hideSwitch('showGraphify', 'Graphify output')}
    </SubMenuButton>
  )
}
