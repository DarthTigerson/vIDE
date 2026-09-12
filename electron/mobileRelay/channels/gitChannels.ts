import { registerChannel } from '../dispatch'
import {
  getGitBranch, getAheadBehind, getGitStatus, getIgnoredPaths,
  stageFiles, unstageFiles, stageAll, unstageAll,
  discardFileChanges, discardAllChanges, commit, getDiffContent,
  getFileAtHead, getCommitDiffContent, getGitGraph, getGitBranches,
  getDefaultBranch, getBranchList, getGitBranchDiff, getGitShowStat,
  fetchRemote, getStagedDiff, discoverRepos,
} from '../../git'

// Plain request/response git channels, mirroring the ipcMain.handle wiring in
// electron/gitRunner.ts's GitRunner.registerHandlers() — same channel names,
// same argument order, same delegation to electron/git.ts's exported
// functions. `git:runCommand` and the `git:log:data`/`git:log:exit` streaming
// pair are stream-shaped (backed by a long-lived PTY), not plain
// request/response, so they're intentionally excluded here; they're handled
// by the push-event work in Task 5, along with `git:watchRoot`/`git:changed`.
export function registerGitRelayChannels(): void {
  registerChannel('git:branch', (cwd: string) => getGitBranch(cwd))
  registerChannel('git:aheadBehind', (cwd: string) => getAheadBehind(cwd))
  registerChannel('git:status', (cwd: string) => getGitStatus(cwd))
  registerChannel('git:listIgnored', (cwd: string) => getIgnoredPaths(cwd))
  registerChannel('git:stage', (cwd: string, paths: string[]) => stageFiles(cwd, paths))
  registerChannel('git:unstage', (cwd: string, paths: string[]) => unstageFiles(cwd, paths))
  registerChannel('git:stageAll', (cwd: string) => stageAll(cwd))
  registerChannel('git:unstageAll', (cwd: string) => unstageAll(cwd))
  registerChannel('git:discard', (cwd: string, path: string) => discardFileChanges(cwd, path))
  registerChannel('git:discardAll', (cwd: string) => discardAllChanges(cwd))
  registerChannel('git:commit', (cwd: string, message: string, noVerify?: boolean) => commit(cwd, message, noVerify))
  registerChannel('git:diff', (cwd: string, path: string, staged: boolean) => getDiffContent(cwd, path, staged))
  registerChannel('git:fileAtHead', (cwd: string, path: string) => getFileAtHead(cwd, path))
  registerChannel('git:commitDiff', (cwd: string, hash: string, path: string) => getCommitDiffContent(cwd, hash, path))
  registerChannel('git:graph', (cwd: string, offset?: number, limit?: number) => getGitGraph(cwd, offset, limit))
  registerChannel('git:branches', (cwd: string) => getGitBranches(cwd))
  registerChannel('git:defaultBranch', (cwd: string) => getDefaultBranch(cwd))
  registerChannel('git:branchList', (cwd: string) => getBranchList(cwd))
  registerChannel('git:branchDiff', (cwd: string, source: string, target: string, offset?: number, limit?: number) =>
    getGitBranchDiff(cwd, source, target, offset, limit))
  registerChannel('git:showStat', (cwd: string, hash: string) => getGitShowStat(cwd, hash))
  registerChannel('git:fetchSilent', (cwd: string) => fetchRemote(cwd))
  registerChannel('git:stagedDiff', (cwd: string) => getStagedDiff(cwd))
  registerChannel('git:discoverRepos', (root: string, maxDepth?: number) => discoverRepos(root, maxDepth))
}
