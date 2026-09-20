import type { FileNode } from '@/types/index'

export function findNodeByPath(nodes: FileNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.children) {
      const found = findNodeByPath(node.children, path)
      if (found) return found
    }
  }
  return null
}

export function isExternalFileDrag(dataTransfer: DataTransfer | null | undefined): boolean {
  return !!dataTransfer && Array.from(dataTransfer.types ?? []).includes('Files')
}
