import { ipcMain, BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import type { GitCommandAction, GitCommandPayload, GitCheckoutPayload, GitPublishBranchPayload } from '../src/types/index'
import { getGitBranch, getGitBranches, getDefaultBranch, getBranchList, getAheadBehind, getGitStatus, stageFiles, unstageFiles, stageAll, unstageAll, commit, discardFileChanges, discardAllChanges, getDiffContent, getFileAtHead, getCommitDiffContent, getGitGraph, getGitBranchDiff, getGitShowStat, getIgnoredPaths, fetchRemote, getStagedDiff, discoverRepos } from './git'
import { getMobileBroadcaster } from './mobile'

const ARGS: Record<Exclude<GitCommandAction, 'checkout' | 'publishBranch'>, string[]> = {
  fetch:           ['fetch'],
  pull:            ['pull'],
  push:            ['push'],
  forcePush:       ['push', '--force'],
  forcePushLease:  ['push', '--force-with-lease'],
}

function buildArgs(action: GitCommandAction, payload?: GitCommandPayload): string[] {
  if (action === 'checkout') {
    const { ref, create, track } = payload as GitCheckoutPayload
    if (track) return ['checkout', '-b', ref, '--track', track]
    if (create) return ['checkout', '-b', ref]
    return ['checkout', ref]
  }
  if (action === 'publishBranch') {
    const { branch } = payload as GitPublishBranchPayload
    return ['push', '--set-upstream', 'origin', branch]
  }
  return ARGS[action]
}

function hasValidSize(cols: number, rows: number): boolean {
  return Number.isFinite(cols) && Number.isFinite(rows) && cols > 0 && rows > 0
}

export class GitRunner {
  private runningByWindow = new Map<number, pty.IPty>()
  // Persists the Git Terminal's last known size across commands, since each
  // command spawns a fresh PTY (unlike the long-lived shell PTYs in
  // pty.ts) and node-pty needs cols/rows up front rather than post-spawn.
  private sizeByWindow = new Map<number, { cols: number; rows: number }>()

  registerHandlers(): void {
    ipcMain.handle('git:runCommand', (event, id: string, cwd: string, action: GitCommandAction, payload?: GitCommandPayload) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return

      if (this.runningByWindow.has(win.id)) {
        if (!win.isDestroyed()) {
          win.webContents.send('git:log:data', id, 'A git command is already running.\r\n')
          win.webContents.send('git:log:exit', id, 1)
        }
        getMobileBroadcaster().emit('git:log:data', id, 'A git command is already running.\r\n')
        getMobileBroadcaster().emit('git:log:exit', id, 1)
        return
      }

      // Spawned via a real PTY (not child_process) so git — and any hooks it
      // triggers, e.g. lint-on-precommit — see a TTY and keep its normal
      // color output instead of falling back to plain text.
      const { cols, rows } = this.sizeByWindow.get(win.id) ?? { cols: 80, rows: 24 }
      const proc = pty.spawn('git', buildArgs(action, payload), {
        name: 'xterm-color',
        cols,
        rows,
        cwd,
        env: process.env as Record<string, string>,
      })
      this.runningByWindow.set(win.id, proc)

      proc.onData((data) => {
        if (!win.isDestroyed()) win.webContents.send('git:log:data', id, data)
        getMobileBroadcaster().emit('git:log:data', id, data)
      })
      proc.onExit(({ exitCode }) => {
        this.runningByWindow.delete(win.id)
        if (!win.isDestroyed()) win.webContents.send('git:log:exit', id, exitCode)
        getMobileBroadcaster().emit('git:log:exit', id, exitCode)
      })
    })

    ipcMain.on('git:log:resize', (event, cols: number, rows: number) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win || !hasValidSize(cols, rows)) return
      const size = { cols: Math.floor(cols), rows: Math.floor(rows) }
      this.sizeByWindow.set(win.id, size)
      this.runningByWindow.get(win.id)?.resize(size.cols, size.rows)
    })

    // Re-register all existing git handlers (previously in registerGitHandlers)
    ipcMain.handle('git:branch', (_e, cwd: string) => getGitBranch(cwd))
    ipcMain.handle('git:aheadBehind', (_e, cwd: string) => getAheadBehind(cwd))
    ipcMain.handle('git:status', (_e, cwd: string) => getGitStatus(cwd))
    ipcMain.handle('git:listIgnored', (_e, cwd: string) => getIgnoredPaths(cwd))
    ipcMain.handle('git:stage', (_e, cwd: string, paths: string[]) => stageFiles(cwd, paths))
    ipcMain.handle('git:unstage', (_e, cwd: string, paths: string[]) => unstageFiles(cwd, paths))
    ipcMain.handle('git:stageAll', (_e, cwd: string) => stageAll(cwd))
    ipcMain.handle('git:unstageAll', (_e, cwd: string) => unstageAll(cwd))
    ipcMain.handle('git:discard', (_e, cwd: string, path: string) => discardFileChanges(cwd, path))
    ipcMain.handle('git:discardAll', (_e, cwd: string) => discardAllChanges(cwd))
    ipcMain.handle('git:commit', (_e, cwd: string, message: string, noVerify?: boolean) => commit(cwd, message, noVerify))
    ipcMain.handle('git:diff', (_e, cwd: string, path: string, staged: boolean) => getDiffContent(cwd, path, staged))
    ipcMain.handle('git:fileAtHead', (_e, cwd: string, path: string) => getFileAtHead(cwd, path))
    ipcMain.handle('git:commitDiff', (_e, cwd: string, hash: string, path: string) => getCommitDiffContent(cwd, hash, path))
    ipcMain.handle('git:graph', (_e, cwd: string, offset?: number, limit?: number) => getGitGraph(cwd, offset, limit))
    ipcMain.handle('git:branches', (_e, cwd: string) => getGitBranches(cwd))
    ipcMain.handle('git:defaultBranch', (_e, cwd: string) => getDefaultBranch(cwd))
    ipcMain.handle('git:branchList', (_e, cwd: string) => getBranchList(cwd))
    ipcMain.handle('git:branchDiff', (_e, cwd: string, source: string, target: string, offset?: number, limit?: number) => getGitBranchDiff(cwd, source, target, offset, limit))
    ipcMain.handle('git:showStat', (_e, cwd: string, hash: string) => getGitShowStat(cwd, hash))
    ipcMain.handle('git:fetchSilent', (_e, cwd: string) => fetchRemote(cwd))
    ipcMain.handle('git:stagedDiff', (_e, cwd: string) => getStagedDiff(cwd))
    ipcMain.handle('git:discoverRepos', (_e, root: string, maxDepth?: number) => discoverRepos(root, maxDepth))
  }
}
