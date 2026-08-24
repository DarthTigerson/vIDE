import type { Tab } from '@/types/index'
import { isSettingsTab, isGitLogTab, isGitGraphTab, isGitBranchDiffTab, isGraphifyGraphTab, isUsageGraphTab, isTodoBoardTab, isTodoDetailTab, isNotesBoardTab, isTerminalTab, isBrowserTab } from '@/components/Settings/paths'
import { isGitDiffTab, isGitCommitDiffTab } from '@/components/Git/paths'
import { isImagePreviewTab, isMarkdownPreviewTab } from '@/components/Viewer/paths'
import { isDockerLogsTab } from '@/components/Docker/paths'

export function isVirtualTab(tab: Tab | null): boolean {
  return !!tab && (isSettingsTab(tab.path) || isTerminalTab(tab.path))
}

export function isReadOnlyTab(tab: Tab | null): boolean {
  return !!tab && (
    isSettingsTab(tab.path) ||
    isGitDiffTab(tab.path) ||
    isGitCommitDiffTab(tab.path) ||
    isGitLogTab(tab.path) ||
    isGitGraphTab(tab.path) ||
    isGitBranchDiffTab(tab.path) ||
    isGraphifyGraphTab(tab.path) ||
    isUsageGraphTab(tab.path) ||
    isTodoBoardTab(tab.path) ||
    isTodoDetailTab(tab.path) ||
    isNotesBoardTab(tab.path) ||
    isDockerLogsTab(tab.path) ||
    isTerminalTab(tab.path) ||
    isBrowserTab(tab.path) ||
    isImagePreviewTab(tab.path) ||
    isMarkdownPreviewTab(tab.path)
  )
}
