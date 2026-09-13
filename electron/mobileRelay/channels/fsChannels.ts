import { registerChannel } from '../dispatch'
import {
  buildTree, readTextFile, readImageDataUrl, pathExists, getHomeDir,
  writeFile, mkdir, renamePath, trashPath, listAllFiles, searchText,
} from '../../fsOps'

// Plain request/response filesystem channels, mirroring the ipcMain.handle
// wiring in electron/main.ts's registerFsHandlers() — same channel names,
// same argument order, same delegation to electron/fsOps.ts's exported
// functions. `dialog:openFolder` (native OS folder picker) and
// `system:getMemoryUsage` are intentionally excluded — see the exclusion
// list in Task 7. `fs:watchRoot`/`fs:changed` are stream/push-shaped, not
// plain request/response, and are handled by the push-event work in Task 5.
export function registerFsRelayChannels(): void {
  registerChannel('fs:readDir', (path: string) => buildTree(path))
  registerChannel('fs:readFile', (path: string) => readTextFile(path))
  registerChannel('fs:readImageDataUrl', (path: string) => readImageDataUrl(path))
  registerChannel('fs:exists', (path: string) => pathExists(path))
  registerChannel('fs:homeDir', () => getHomeDir())
  registerChannel('fs:writeFile', (path: string, content: string) => writeFile(path, content))
  registerChannel('fs:mkdir', (path: string) => mkdir(path))
  registerChannel('fs:rename', (from: string, to: string) => renamePath(from, to))
  registerChannel('fs:trash', (path: string) => trashPath(path))
  registerChannel('fs:listAllFiles', (root: string) => listAllFiles(root))
  registerChannel('fs:searchText', (root: string, query: string, caseSensitive: boolean) =>
    searchText(root, query, caseSensitive))
}
