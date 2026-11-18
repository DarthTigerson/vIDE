import { watch as chokidarWatch, type FSWatcher } from 'chokidar'

// Every chokidar watcher the main process opens, so quitting can close them
// all before Node tears its environment down. Under chokidar 3 (fsevents
// addon on macOS) an fsevents stream still open at exit either deadlocked in
// fsevents.node during Node's cleanup (fse_instance_destroy waiting on a
// mutex: the windows are gone but the process never exits, so the Dock icon
// is dead until a force quit) or tripped an assertion there
// (fse_dispatch_event → abort, and macOS shows the crash dialog). chokidar 4+
// uses Node's own fs.watch (still FSEvents-backed by libuv on macOS); closing
// everything before teardown stays the safe order. Some watchers
// (notes, scripts, todos) live for the whole app; the per-window ones close
// on window close, but without awaiting, so a quit right after can still
// race them.
const watchers = new Set<FSWatcher>()

export function watch(...args: Parameters<typeof chokidarWatch>): FSWatcher {
  const w = chokidarWatch(...args)
  watchers.add(w)
  return w
}

export function openWatcherCount(): number {
  return watchers.size
}

// close() is idempotent in chokidar (a second call returns the same promise),
// so watchers already closed elsewhere are safe to close again here; this is
// also what waits out a close that was started without being awaited.
export async function closeAllWatchers(): Promise<void> {
  const all = [...watchers]
  watchers.clear()
  await Promise.all(all.map((w) => Promise.resolve().then(() => w.close()).catch(() => undefined)))
}
